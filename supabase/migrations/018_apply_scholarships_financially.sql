do $$
begin
  create type public.alcance_beca as enum (
    'mensualidad',
    'inscripcion',
    'ambas'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.becas
  add column if not exists alcance public.alcance_beca
  not null default 'mensualidad';

alter table public.alumnos_becas
  add column if not exists porcentaje_aplicado numeric(5, 2),
  add column if not exists alcance_aplicado public.alcance_beca;

update public.alumnos_becas as asignacion
set
  porcentaje_aplicado = beca.porcentaje,
  alcance_aplicado = beca.alcance
from public.becas as beca
where beca.id = asignacion.beca_id
  and (
    asignacion.porcentaje_aplicado is null
    or asignacion.alcance_aplicado is null
  );

alter table public.alumnos_becas
  alter column porcentaje_aplicado set not null,
  alter column alcance_aplicado set not null;

alter table public.alumnos_becas
  drop constraint if exists alumnos_becas_porcentaje_aplicado_check;

alter table public.alumnos_becas
  add constraint alumnos_becas_porcentaje_aplicado_check
    check (porcentaje_aplicado > 0 and porcentaje_aplicado <= 100);

-- Las asignaciones financieras solo se modifican mediante RPC transaccionales.
revoke insert, update, delete on table public.alumnos_becas from authenticated;

drop policy if exists "Usuarios consultan sus asignaciones de beca"
  on public.alumnos_becas;
create policy "Usuarios consultan sus asignaciones de beca"
  on public.alumnos_becas
  for select
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from public.alumnos as alumno
      where alumno.id = alumnos_becas.alumno_id
        and alumno.usuario_id = (select auth.uid())
    )
  );

-- El catalogo no contiene datos privados y el alumno necesita leer el nombre.
drop policy if exists "Usuarios autenticados consultan catalogo de becas"
  on public.becas;
create policy "Usuarios autenticados consultan catalogo de becas"
  on public.becas
  for select
  to authenticated
  using (true);

create or replace function public.costo_con_beca(
  p_costo numeric,
  p_porcentaje numeric,
  p_aplica boolean
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    p_costo * case when p_aplica then (100 - coalesce(p_porcentaje, 0)) / 100 else 1 end,
    2
  );
$$;

create or replace function public.recalcular_deuda_alumno(
  p_alumno_id uuid,
  p_ciclo_escolar text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_costo_inscripcion numeric(12, 2);
  v_costo_mensualidad numeric(12, 2);
  v_porcentaje numeric(5, 2) := 0;
  v_alcance public.alcance_beca;
  v_pagado_inscripcion numeric(12, 2);
  v_pagado_mensualidad numeric(12, 2);
begin
  select nivel into v_nivel
  from public.alumnos
  where id = p_alumno_id;
  if not found then raise exception 'El alumno no existe'; end if;

  select costo_inscripcion, costo_mensualidad
  into v_costo_inscripcion, v_costo_mensualidad
  from public.configuracion_costos
  where nivel = v_nivel and ciclo_escolar = p_ciclo_escolar;
  if not found then
    raise exception 'No existe configuracion de costos para % / %', v_nivel, p_ciclo_escolar;
  end if;

  select porcentaje_aplicado, alcance_aplicado
  into v_porcentaje, v_alcance
  from public.alumnos_becas
  where alumno_id = p_alumno_id and ciclo_escolar = p_ciclo_escolar;

  v_costo_inscripcion := public.costo_con_beca(
    v_costo_inscripcion,
    coalesce(v_porcentaje, 0),
    v_alcance in ('inscripcion', 'ambas')
  );
  v_costo_mensualidad := public.costo_con_beca(
    v_costo_mensualidad,
    coalesce(v_porcentaje, 0),
    v_alcance in ('mensualidad', 'ambas')
  );

  select
    coalesce(sum(monto) filter (where tipo_pago = 'inscripcion'), 0),
    coalesce(sum(monto) filter (where tipo_pago = 'mensualidad'), 0)
  into v_pagado_inscripcion, v_pagado_mensualidad
  from public.pagos
  where alumno_id = p_alumno_id
    and public.ciclo_de_pago(mes, anio) = p_ciclo_escolar;

  update public.alumnos
  set
    deuda_inscripcion = greatest(v_costo_inscripcion - v_pagado_inscripcion, 0),
    deuda_mensualidad = greatest((v_costo_mensualidad * 12) - v_pagado_mensualidad, 0)
  where id = p_alumno_id;
end;
$$;

create or replace function public.aplicar_beca_estado_cuenta(
  p_alumno_id uuid,
  p_ciclo_escolar text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_inscripcion numeric(12, 2);
  v_mensualidad numeric(12, 2);
  v_porcentaje numeric(5, 2) := 0;
  v_alcance public.alcance_beca;
begin
  select nivel into v_nivel from public.alumnos where id = p_alumno_id;
  select costo_inscripcion, costo_mensualidad
  into v_inscripcion, v_mensualidad
  from public.configuracion_costos
  where nivel = v_nivel and ciclo_escolar = p_ciclo_escolar;
  if not found then
    raise exception 'Configura los costos del nivel antes de asignar la beca';
  end if;

  select porcentaje_aplicado, alcance_aplicado
  into v_porcentaje, v_alcance
  from public.alumnos_becas
  where alumno_id = p_alumno_id and ciclo_escolar = p_ciclo_escolar;

  update public.estado_cuenta
  set monto_esperado = case
    when tipo_pago = 'inscripcion' then public.costo_con_beca(
      v_inscripcion, coalesce(v_porcentaje, 0), v_alcance in ('inscripcion', 'ambas')
    )
    else public.costo_con_beca(
      v_mensualidad, coalesce(v_porcentaje, 0), v_alcance in ('mensualidad', 'ambas')
    )
  end
  where alumno_id = p_alumno_id
    and public.ciclo_de_pago(mes, anio) = p_ciclo_escolar;

  perform public.recalcular_deuda_alumno(p_alumno_id, p_ciclo_escolar);
end;
$$;

-- Valida pagos contra el costo neto despues de la beca y conserva la regla
-- secuencial de mensualidades.
create or replace function public.descontar_saldo_al_registrar_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_deuda_inscripcion numeric(12, 2);
  v_ciclo text;
  v_costo_inscripcion numeric(12, 2);
  v_costo_mensualidad numeric(12, 2);
  v_porcentaje numeric(5, 2) := 0;
  v_alcance public.alcance_beca;
  v_mes_numero smallint;
  v_mes_anterior public.mes_pago;
  v_anio_anterior smallint;
  v_pagado_actual numeric(12, 2);
  v_pagado_anterior numeric(12, 2);
begin
  select nivel, deuda_inscripcion
  into v_nivel, v_deuda_inscripcion
  from public.alumnos
  where id = new.alumno_id
  for update;
  if not found then raise exception 'El alumno no existe'; end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);
  select costo_inscripcion, costo_mensualidad
  into v_costo_inscripcion, v_costo_mensualidad
  from public.configuracion_costos
  where nivel = v_nivel and ciclo_escolar = v_ciclo;
  if not found then
    raise exception 'Configura los costos de % para el ciclo %', v_nivel, v_ciclo;
  end if;

  select porcentaje_aplicado, alcance_aplicado
  into v_porcentaje, v_alcance
  from public.alumnos_becas
  where alumno_id = new.alumno_id and ciclo_escolar = v_ciclo;

  v_costo_inscripcion := public.costo_con_beca(
    v_costo_inscripcion, coalesce(v_porcentaje, 0),
    v_alcance in ('inscripcion', 'ambas')
  );
  v_costo_mensualidad := public.costo_con_beca(
    v_costo_mensualidad, coalesce(v_porcentaje, 0),
    v_alcance in ('mensualidad', 'ambas')
  );

  select coalesce(sum(monto), 0) into v_pagado_actual
  from public.pagos
  where alumno_id = new.alumno_id
    and tipo_pago = new.tipo_pago
    and mes = new.mes
    and anio = new.anio;

  if new.tipo_pago = 'inscripcion' then
    if new.mes <> 'agosto' then
      raise exception 'La inscripcion solo puede registrarse en agosto';
    end if;
    if v_pagado_actual + new.monto > v_costo_inscripcion then
      raise exception 'El pago excede el saldo de inscripcion con beca';
    end if;
  else
    if v_deuda_inscripcion > 0 then
      raise exception 'Debe liquidarse la inscripcion antes de pagar mensualidades';
    end if;
    if v_pagado_actual + new.monto > v_costo_mensualidad then
      raise exception 'El pago excede el costo de la mensualidad con beca';
    end if;

    v_mes_numero := public.numero_mes(new.mes);
    if v_mes_numero <> 8 then
      if v_mes_numero = 1 then
        v_mes_anterior := 'diciembre';
        v_anio_anterior := new.anio - 1;
      else
        v_mes_anterior := public.mes_desde_numero((v_mes_numero - 1)::smallint);
        v_anio_anterior := new.anio;
      end if;

      select coalesce(sum(monto), 0) into v_pagado_anterior
      from public.pagos
      where alumno_id = new.alumno_id
        and tipo_pago = 'mensualidad'
        and mes = v_mes_anterior
        and anio = v_anio_anterior;

      if v_pagado_anterior < v_costo_mensualidad then
        raise exception 'Debe liquidarse % de % antes de continuar',
          v_mes_anterior, v_anio_anterior;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.asignar_beca_alumno(
  p_alumno_id uuid,
  p_beca_id uuid,
  p_ciclo_escolar text,
  p_observaciones text default ''
)
returns public.alumnos_becas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beca public.becas;
  v_asignacion public.alumnos_becas;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede asignar becas' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.pagos
    where alumno_id = p_alumno_id
      and public.ciclo_de_pago(mes, anio) = p_ciclo_escolar
  ) then
    raise exception 'No se puede asignar una beca porque ya existen pagos en este ciclo'
      using errcode = '23514';
  end if;
  select * into v_beca from public.becas where id = p_beca_id and activa;
  if not found then raise exception 'La beca no existe o esta inactiva'; end if;

  insert into public.alumnos_becas (
    alumno_id, beca_id, ciclo_escolar, observaciones,
    porcentaje_aplicado, alcance_aplicado
  ) values (
    p_alumno_id, p_beca_id, p_ciclo_escolar, trim(coalesce(p_observaciones, '')),
    v_beca.porcentaje, v_beca.alcance
  ) returning * into v_asignacion;

  perform public.aplicar_beca_estado_cuenta(p_alumno_id, p_ciclo_escolar);
  return v_asignacion;
end;
$$;

create or replace function public.retirar_beca_alumno(p_asignacion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion public.alumnos_becas;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede retirar becas' using errcode = '42501';
  end if;
  select * into v_asignacion
  from public.alumnos_becas where id = p_asignacion_id for update;
  if not found then raise exception 'La asignacion no existe'; end if;
  if exists (
    select 1 from public.pagos
    where alumno_id = v_asignacion.alumno_id
      and public.ciclo_de_pago(mes, anio) = v_asignacion.ciclo_escolar
  ) then
    raise exception 'No se puede retirar la beca porque ya existen pagos en este ciclo'
      using errcode = '23514';
  end if;

  delete from public.alumnos_becas where id = v_asignacion.id;
  perform public.aplicar_beca_estado_cuenta(
    v_asignacion.alumno_id,
    v_asignacion.ciclo_escolar
  );
end;
$$;

revoke all on function public.costo_con_beca(numeric, numeric, boolean) from public;
revoke all on function public.aplicar_beca_estado_cuenta(uuid, text) from public;
revoke all on function public.asignar_beca_alumno(uuid, uuid, text, text) from public;
revoke all on function public.retirar_beca_alumno(uuid) from public;
grant execute on function public.asignar_beca_alumno(uuid, uuid, text, text) to authenticated;
grant execute on function public.retirar_beca_alumno(uuid) to authenticated;

-- Envuelve el generador existente para aplicar los importes con beca despues
-- de crear o actualizar todos los cargos base del ciclo. Algunas instalaciones
-- anteriores usan smallint y otras integer para el dia limite.
do $$
declare
  v_encontrada boolean := false;
begin
  if to_regprocedure(
    'public.generar_estado_cuenta_ciclo(text,integer)'
  ) is not null then
    alter function public.generar_estado_cuenta_ciclo(text, integer)
      rename to generar_estado_cuenta_ciclo_sin_becas;
    v_encontrada := true;
  end if;
  if to_regprocedure(
    'public.generar_estado_cuenta_ciclo(text,smallint)'
  ) is not null then
    alter function public.generar_estado_cuenta_ciclo(text, smallint)
      rename to generar_estado_cuenta_ciclo_sin_becas;
    v_encontrada := true;
  end if;
  if not v_encontrada then
    raise exception 'No existe una version compatible de generar_estado_cuenta_ciclo';
  end if;
end
$$;

do $$
begin
  if to_regprocedure(
    'public.generar_estado_cuenta_ciclo_sin_becas(text,integer)'
  ) is not null then
    revoke all on function public.generar_estado_cuenta_ciclo_sin_becas(
      text,
      integer
    ) from public;
  end if;
  if to_regprocedure(
    'public.generar_estado_cuenta_ciclo_sin_becas(text,smallint)'
  ) is not null then
    revoke all on function public.generar_estado_cuenta_ciclo_sin_becas(
      text,
      smallint
    ) from public;
  end if;
end
$$;

create function public.generar_estado_cuenta_ciclo(
  p_ciclo_escolar text,
  p_dia_limite integer default 10
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_afectados integer;
  v_alumno record;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and session_user not in ('postgres', 'service_role') then
    raise exception 'Solo un administrador puede generar estados de cuenta'
      using errcode = '42501';
  end if;

  -- smallint encuentra la firma exacta antigua y se convierte implicitamente
  -- a integer cuando esa es la variante instalada.
  v_afectados := public.generar_estado_cuenta_ciclo_sin_becas(
    p_ciclo_escolar,
    p_dia_limite::smallint
  );

  for v_alumno in
    select alumno.id
    from public.alumnos as alumno
    join public.configuracion_costos as costos
      on costos.nivel = alumno.nivel
     and costos.ciclo_escolar = p_ciclo_escolar
    where alumno.estado = 'activo'
  loop
    perform public.aplicar_beca_estado_cuenta(
      v_alumno.id,
      p_ciclo_escolar
    );
  end loop;

  return v_afectados;
end;
$$;

revoke all on function public.generar_estado_cuenta_ciclo(text, integer)
  from public;
grant execute on function public.generar_estado_cuenta_ciclo(text, integer)
  to authenticated;

-- Activa financieramente asignaciones creadas con el modulo inicial.
do $$
declare
  v_asignacion record;
begin
  for v_asignacion in
    select asignacion.alumno_id, asignacion.ciclo_escolar
    from public.alumnos_becas as asignacion
    join public.alumnos as alumno on alumno.id = asignacion.alumno_id
    join public.configuracion_costos as costos
      on costos.nivel = alumno.nivel
     and costos.ciclo_escolar = asignacion.ciclo_escolar
  loop
    perform public.aplicar_beca_estado_cuenta(
      v_asignacion.alumno_id,
      v_asignacion.ciclo_escolar
    );
  end loop;
end
$$;
