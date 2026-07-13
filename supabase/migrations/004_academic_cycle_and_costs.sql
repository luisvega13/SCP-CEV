-- Nombres desglosados. La migración usa las dos últimas palabras como
-- apellidos cuando existen tres o más componentes.
alter table public.alumnos
  add column apellido_paterno text not null default '',
  add column apellido_materno text not null default '';

with nombres as (
  select
    id,
    regexp_split_to_array(trim(nombre), '\s+') as partes
  from public.alumnos
)
update public.alumnos as alumno
set
  nombre = case
    when cardinality(nombres.partes) >= 3 then
      array_to_string(
        nombres.partes[1:cardinality(nombres.partes) - 2],
        ' '
      )
    else nombres.partes[1]
  end,
  apellido_paterno = case
    when cardinality(nombres.partes) >= 3 then
      nombres.partes[cardinality(nombres.partes) - 1]
    when cardinality(nombres.partes) = 2 then nombres.partes[2]
    else ''
  end,
  apellido_materno = case
    when cardinality(nombres.partes) >= 3 then
      nombres.partes[cardinality(nombres.partes)]
    else ''
  end
from nombres
where alumno.id = nombres.id;

create type public.mes_pago as enum (
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
);

create function public.numero_mes(p_mes public.mes_pago)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case p_mes
    when 'enero' then 1
    when 'febrero' then 2
    when 'marzo' then 3
    when 'abril' then 4
    when 'mayo' then 5
    when 'junio' then 6
    when 'julio' then 7
    when 'agosto' then 8
    when 'septiembre' then 9
    when 'octubre' then 10
    when 'noviembre' then 11
    when 'diciembre' then 12
  end;
$$;

create function public.mes_desde_numero(p_numero smallint)
returns public.mes_pago
language sql
immutable
strict
set search_path = ''
as $$
  select case p_numero
    when 1 then 'enero'::public.mes_pago
    when 2 then 'febrero'::public.mes_pago
    when 3 then 'marzo'::public.mes_pago
    when 4 then 'abril'::public.mes_pago
    when 5 then 'mayo'::public.mes_pago
    when 6 then 'junio'::public.mes_pago
    when 7 then 'julio'::public.mes_pago
    when 8 then 'agosto'::public.mes_pago
    when 9 then 'septiembre'::public.mes_pago
    when 10 then 'octubre'::public.mes_pago
    when 11 then 'noviembre'::public.mes_pago
    when 12 then 'diciembre'::public.mes_pago
  end;
$$;

create function public.ciclo_de_pago(
  p_mes public.mes_pago,
  p_anio smallint
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when public.numero_mes(p_mes) >= 8 then
      p_anio::text || '-' || (p_anio + 1)::text
    else
      (p_anio - 1)::text || '-' || p_anio::text
  end;
$$;

alter table public.pagos
  add column mes public.mes_pago,
  add column anio smallint;

update public.pagos
set
  mes = public.mes_desde_numero(
    extract(month from fecha_pago)::smallint
  ),
  anio = extract(year from fecha_pago)::smallint
where mes is null or anio is null;

alter table public.pagos
  alter column mes set not null,
  alter column anio set not null,
  add constraint pagos_anio_check check (anio between 2020 and 2100);

create index pagos_alumno_periodo_idx
  on public.pagos (alumno_id, anio, mes, tipo_pago);

create table public.configuracion_costos (
  nivel public.nivel_escolar not null,
  costo_inscripcion numeric(12, 2) not null
    check (costo_inscripcion >= 0),
  costo_mensualidad numeric(12, 2) not null
    check (costo_mensualidad >= 0),
  ciclo_escolar text not null
    check (ciclo_escolar ~ '^\d{4}-\d{4}$'),
  primary key (nivel, ciclo_escolar)
);

alter table public.configuracion_costos enable row level security;
alter table public.configuracion_costos force row level security;

revoke all on table public.configuracion_costos from anon;
grant select on table public.configuracion_costos to authenticated;

create policy "Usuarios autenticados consultan costos"
  on public.configuracion_costos
  for select
  to authenticated
  using (true);

create function public.recalcular_deuda_alumno(
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
  v_pagado_inscripcion numeric(12, 2);
  v_pagado_mensualidad numeric(12, 2);
begin
  select nivel
    into v_nivel
    from public.alumnos
    where id = p_alumno_id;

  if not found then
    raise exception 'El alumno no existe';
  end if;

  select costo_inscripcion, costo_mensualidad
    into v_costo_inscripcion, v_costo_mensualidad
    from public.configuracion_costos
    where nivel = v_nivel
      and ciclo_escolar = p_ciclo_escolar;

  if not found then
    raise exception 'No existe configuración de costos para % / %',
      v_nivel, p_ciclo_escolar;
  end if;

  select
    coalesce(sum(monto) filter (
      where tipo_pago = 'inscripcion'
    ), 0),
    coalesce(sum(monto) filter (
      where tipo_pago = 'mensualidad'
    ), 0)
  into v_pagado_inscripcion, v_pagado_mensualidad
  from public.pagos
  where alumno_id = p_alumno_id
    and public.ciclo_de_pago(mes, anio) = p_ciclo_escolar;

  update public.alumnos
  set
    deuda_inscripcion = greatest(
      v_costo_inscripcion - v_pagado_inscripcion,
      0
    ),
    deuda_mensualidad = greatest(
      (v_costo_mensualidad * 12) - v_pagado_mensualidad,
      0
    )
  where id = p_alumno_id;
end;
$$;

create function public.actualizar_configuracion_costos(
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
  if coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ) <> 'admin' then
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

  insert into public.configuracion_costos (
    nivel,
    costo_inscripcion,
    costo_mensualidad,
    ciclo_escolar
  )
  values (
    p_nivel,
    p_costo_inscripcion,
    p_costo_mensualidad,
    p_ciclo_escolar
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
  loop
    perform public.recalcular_deuda_alumno(
      v_alumno.id,
      p_ciclo_escolar
    );
  end loop;

  return v_configuracion;
end;
$$;

revoke all on function public.recalcular_deuda_alumno(uuid, text)
  from public;
revoke all on function public.actualizar_configuracion_costos(
  public.nivel_escolar,
  numeric,
  numeric,
  text
) from public;
grant execute on function public.actualizar_configuracion_costos(
  public.nivel_escolar,
  numeric,
  numeric,
  text
) to authenticated;

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

  if not found then
    raise exception 'El alumno no existe';
  end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);

  select costo_inscripcion, costo_mensualidad
    into v_costo_inscripcion, v_costo_mensualidad
    from public.configuracion_costos
    where nivel = v_nivel
      and ciclo_escolar = v_ciclo;

  if not found then
    raise exception 'Configura los costos de % para el ciclo %',
      v_nivel, v_ciclo;
  end if;

  select coalesce(sum(monto), 0)
    into v_pagado_actual
    from public.pagos
    where alumno_id = new.alumno_id
      and tipo_pago = new.tipo_pago
      and mes = new.mes
      and anio = new.anio;

  if new.tipo_pago = 'inscripcion' then
    if new.mes <> 'agosto' then
      raise exception 'La inscripción solo puede registrarse en agosto';
    end if;

    if v_pagado_actual + new.monto > v_costo_inscripcion then
      raise exception 'El pago excede el saldo de inscripción';
    end if;
  else
    if v_deuda_inscripcion > 0 then
      raise exception 'Debe liquidarse la inscripción antes de pagar mensualidades';
    end if;

    if v_pagado_actual + new.monto > v_costo_mensualidad then
      raise exception 'El pago excede el costo de la mensualidad';
    end if;

    v_mes_numero := public.numero_mes(new.mes);

    -- Agosto inicia el ciclo; los demás meses requieren liquidar el anterior.
    if v_mes_numero <> 8 then
      if v_mes_numero = 1 then
        v_mes_anterior := 'diciembre';
        v_anio_anterior := new.anio - 1;
      else
        v_mes_anterior := public.mes_desde_numero(
          (v_mes_numero - 1)::smallint
        );
        v_anio_anterior := new.anio;
      end if;

      select coalesce(sum(monto), 0)
        into v_pagado_anterior
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

create function public.recalcular_deuda_despues_de_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalcular_deuda_alumno(
    new.alumno_id,
    public.ciclo_de_pago(new.mes, new.anio)
  );
  return new;
end;
$$;

drop trigger if exists descontar_saldo_despues_de_pago
  on public.pagos;

create trigger validar_pago_antes_de_insertar
  before insert on public.pagos
  for each row
  execute function public.descontar_saldo_al_registrar_pago();

create trigger recalcular_deuda_despues_de_pago
  after insert on public.pagos
  for each row
  execute function public.recalcular_deuda_despues_de_pago();

create function public.inicializar_deuda_nuevo_alumno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio integer;
  v_ciclo text;
begin
  v_inicio := case
    when extract(month from current_date) >= 8 then
      extract(year from current_date)::integer
    else
      extract(year from current_date)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;

  if exists (
    select 1
    from public.configuracion_costos
    where nivel = new.nivel
      and ciclo_escolar = v_ciclo
  ) then
    perform public.recalcular_deuda_alumno(new.id, v_ciclo);
  end if;

  return new;
end;
$$;

create trigger inicializar_deuda_nuevo_alumno
  after insert or update of nivel on public.alumnos
  for each row
  execute function public.inicializar_deuda_nuevo_alumno();
