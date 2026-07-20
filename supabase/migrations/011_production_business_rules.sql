-- Reglas críticas previas a producción.

create or replace function public.ciclo_escolar_actual()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when extract(month from current_date) >= 8 then
      extract(year from current_date)::integer::text || '-' ||
      (extract(year from current_date)::integer + 1)::text
    else
      (extract(year from current_date)::integer - 1)::text || '-' ||
      extract(year from current_date)::integer::text
  end;
$$;

alter table public.alumnos
  add column if not exists ciclo_grado_actual text,
  add column if not exists promocion_habilitada boolean;

update public.alumnos
set
  ciclo_grado_actual = coalesce(
    ciclo_grado_actual,
    public.ciclo_escolar_actual()
  ),
  promocion_habilitada = coalesce(promocion_habilitada, true)
where ciclo_grado_actual is null
   or promocion_habilitada is null;

alter table public.alumnos
  alter column ciclo_grado_actual
    set default public.ciclo_escolar_actual(),
  alter column ciclo_grado_actual set not null,
  alter column promocion_habilitada set default false,
  alter column promocion_habilitada set not null;

alter table public.alumnos
  drop constraint if exists alumnos_ciclo_grado_actual_check;

alter table public.alumnos
  add constraint alumnos_ciclo_grado_actual_check
  check (ciclo_grado_actual ~ '^\d{4}-\d{4}$');

alter table public.pagos
  add column if not exists ciclo_escolar text
  generated always as (public.ciclo_de_pago(mes, anio)) stored;

create index if not exists pagos_ciclo_alumno_tipo_idx
  on public.pagos (ciclo_escolar, alumno_id, tipo_pago);

-- No permite crear cargos futuros para alumnos inactivos o dados de baja.
create or replace function public.validar_cargo_estado_academico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.estado_alumno;
begin
  select estado
  into v_estado
  from public.alumnos
  where id = new.alumno_id;

  if not found then
    raise exception 'El alumno no existe';
  end if;

  if v_estado <> 'activo' and new.fecha_limite > current_date then
    raise exception 'No se pueden generar cargos futuros para un alumno inactivo o dado de baja'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validar_cargo_estado_academico
  on public.estado_cuenta;

create trigger validar_cargo_estado_academico
  before insert or update of alumno_id, fecha_limite
  on public.estado_cuenta
  for each row
  execute function public.validar_cargo_estado_academico();

create or replace function public.detener_cargos_por_estado_academico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado in ('pausa', 'baja') and old.estado = 'activo' then
    delete from public.estado_cuenta
    where alumno_id = new.id
      and fecha_limite > current_date
      and monto_pagado = 0;
  end if;
  return new;
end;
$$;

drop trigger if exists detener_cargos_por_estado_academico
  on public.alumnos;

create trigger detener_cargos_por_estado_academico
  after update of estado on public.alumnos
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.detener_cargos_por_estado_academico();

-- Limpieza inicial: conserva deuda histórica y elimina únicamente cargos futuros sin abonos.
delete from public.estado_cuenta as cuenta
using public.alumnos as alumno
where cuenta.alumno_id = alumno.id
  and alumno.estado in ('pausa', 'baja')
  and cuenta.fecha_limite > current_date
  and cuenta.monto_pagado = 0;

-- KPI: la deuda histórica incluye bajas; la proyección excluye bajas.
create or replace function public.obtener_kpis_reportes_financieros()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_recaudado',
      coalesce((select sum(monto) from public.pagos), 0),
    'saldo_actual_vencido',
      coalesce((
        select sum(cuenta.monto_esperado - cuenta.monto_pagado)
        from public.estado_cuenta as cuenta
        where cuenta.fecha_limite < current_date
          and cuenta.estatus <> 'pagado'
      ), 0),
    'proyeccion_ingresos',
      coalesce((
        select sum(cuenta.monto_esperado - cuenta.monto_pagado)
        from public.estado_cuenta as cuenta
        join public.alumnos as alumno on alumno.id = cuenta.alumno_id
        where cuenta.estatus <> 'pagado'
          and alumno.estado <> 'baja'
      ), 0),
    'alumnos_con_adeudo',
      coalesce((
        select count(distinct cuenta.alumno_id)
        from public.estado_cuenta as cuenta
        where cuenta.fecha_limite < current_date
          and cuenta.estatus <> 'pagado'
      ), 0)
  );
$$;

-- Bloqueo de configuración en servidor: no se puede eludir desde otro cliente.
create or replace function public.existen_pagos_nivel_ciclo(
  p_nivel public.nivel_escolar,
  p_ciclo_escolar text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.pagos as pago
    join public.alumnos as alumno on alumno.id = pago.alumno_id
    where alumno.nivel = p_nivel
      and pago.ciclo_escolar = p_ciclo_escolar
  );
$$;

revoke all on function public.existen_pagos_nivel_ciclo(
  public.nivel_escolar,
  text
) from public;
grant execute on function public.existen_pagos_nivel_ciclo(
  public.nivel_escolar,
  text
) to authenticated;

create or replace function public.actualizar_configuracion_costos(
  p_nivel public.nivel_escolar,
  p_costo_inscripcion numeric,
  p_costo_mensualidad numeric,
  p_ciclo_escolar text
)
returns public.configuracion_costos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio integer;
  v_fin integer;
  v_configuracion public.configuracion_costos;
  v_alumno record;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede actualizar costos'
      using errcode = '42501';
  end if;

  if p_costo_inscripcion < 0 or p_costo_mensualidad < 0 then
    raise exception 'Los costos no pueden ser negativos';
  end if;

  if p_ciclo_escolar !~ '^\d{4}-\d{4}$' then
    raise exception 'El ciclo escolar debe tener el formato AAAA-AAAA';
  end if;

  v_inicio := split_part(p_ciclo_escolar, '-', 1)::integer;
  v_fin := split_part(p_ciclo_escolar, '-', 2)::integer;
  if v_fin <> v_inicio + 1 then
    raise exception 'El ciclo escolar debe abarcar años consecutivos';
  end if;

  if public.existen_pagos_nivel_ciclo(p_nivel, p_ciclo_escolar) then
    raise exception 'No se pueden modificar los costos porque ya existen pagos registrados en este ciclo'
      using errcode = '23514';
  end if;

  insert into public.configuracion_costos (
    nivel, costo_inscripcion, costo_mensualidad, ciclo_escolar
  ) values (
    p_nivel, p_costo_inscripcion, p_costo_mensualidad, p_ciclo_escolar
  )
  on conflict (nivel, ciclo_escolar)
  do update set
    costo_inscripcion = excluded.costo_inscripcion,
    costo_mensualidad = excluded.costo_mensualidad
  returning * into v_configuracion;

  for v_alumno in
    select id
    from public.alumnos
    where nivel = p_nivel
      and estado = 'activo'
  loop
    perform public.recalcular_deuda_alumno(v_alumno.id, p_ciclo_escolar);
  end loop;

  return v_configuracion;
end;
$$;

-- Impide pagos de alumnos inactivos incluso si el cliente es manipulado.
create or replace function public.validar_estado_antes_de_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.estado_alumno;
begin
  select estado into v_estado
  from public.alumnos
  where id = new.alumno_id
  for update;

  if not found then raise exception 'El alumno no existe'; end if;
  if v_estado <> 'activo' then
    raise exception 'No se pueden registrar pagos para un alumno inactivo o dado de baja'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_estado_antes_de_pago on public.pagos;
create trigger validar_estado_antes_de_pago
  before insert on public.pagos
  for each row
  execute function public.validar_estado_antes_de_pago();

-- Promoción académica idempotente y auditable.
create table if not exists public.promociones_academicas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete restrict,
  ciclo_escolar text not null check (ciclo_escolar ~ '^\d{4}-\d{4}$'),
  nivel_anterior public.nivel_escolar not null,
  grado_anterior smallint not null,
  nivel_nuevo public.nivel_escolar not null,
  grado_nuevo smallint not null,
  fecha_promocion timestamptz not null default now(),
  unique (alumno_id, ciclo_escolar)
);

alter table public.promociones_academicas enable row level security;
alter table public.promociones_academicas force row level security;
revoke all on table public.promociones_academicas from anon;
grant select on table public.promociones_academicas to authenticated;

drop policy if exists "Administradores consultan promociones"
  on public.promociones_academicas;
create policy "Administradores consultan promociones"
  on public.promociones_academicas for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.promover_alumno_por_reinscripcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alumno public.alumnos;
  v_ciclo text;
  v_nivel_nuevo public.nivel_escolar;
  v_grado_nuevo smallint;
begin
  if new.tipo_pago <> 'inscripcion' then return new; end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);
  select * into v_alumno
  from public.alumnos
  where id = new.alumno_id
  for update;

  if not v_alumno.promocion_habilitada then
    update public.alumnos
    set ciclo_grado_actual = v_ciclo,
        promocion_habilitada = true
    where id = new.alumno_id;
    return new;
  end if;

  if v_ciclo <= v_alumno.ciclo_grado_actual then return new; end if;
  if exists (
    select 1 from public.promociones_academicas
    where alumno_id = new.alumno_id and ciclo_escolar = v_ciclo
  ) then return new; end if;

  if v_alumno.nivel = 'primaria' and v_alumno.grado >= 6 then
    v_nivel_nuevo := 'secundaria'; v_grado_nuevo := 1;
  elsif v_alumno.nivel = 'secundaria' and v_alumno.grado >= 3 then
    v_nivel_nuevo := 'bachillerato'; v_grado_nuevo := 1;
  elsif v_alumno.nivel = 'bachillerato' and v_alumno.grado >= 3 then
    raise exception 'El alumno ya se encuentra en el grado máximo de bachillerato'
      using errcode = '23514';
  else
    v_nivel_nuevo := v_alumno.nivel;
    v_grado_nuevo := v_alumno.grado + 1;
  end if;

  insert into public.promociones_academicas (
    alumno_id, ciclo_escolar, nivel_anterior, grado_anterior,
    nivel_nuevo, grado_nuevo
  ) values (
    new.alumno_id, v_ciclo, v_alumno.nivel, v_alumno.grado,
    v_nivel_nuevo, v_grado_nuevo
  );

  update public.alumnos
  set nivel = v_nivel_nuevo,
      grado = v_grado_nuevo,
      ciclo_grado_actual = v_ciclo
  where id = new.alumno_id;

  return new;
end;
$$;

drop trigger if exists promover_alumno_por_reinscripcion on public.pagos;
drop trigger if exists a_promover_alumno_por_reinscripcion on public.pagos;
create trigger a_promover_alumno_por_reinscripcion
  before insert on public.pagos
  for each row
  execute function public.promover_alumno_por_reinscripcion();

-- Opciones compactas para filtros sin descargar la tabla completa.
create or replace function public.obtener_filtros_directorio_alumnos()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'grados', coalesce((select jsonb_agg(distinct grado order by grado) from public.alumnos), '[]'::jsonb),
    'grupos', coalesce((select jsonb_agg(distinct grupo order by grupo) from public.alumnos), '[]'::jsonb)
  );
$$;

grant execute on function public.obtener_filtros_directorio_alumnos()
  to authenticated;
