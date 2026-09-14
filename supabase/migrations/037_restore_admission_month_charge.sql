-- Corrige la elegibilidad del primer mes: el mes de alta siempre aplica,
-- aunque el alumno haya sido registrado despues del dia de corte.

create or replace function public.validar_cargo_desde_fecha_alta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_alta date;
  v_mes_cargo date;
  v_mes_alta date;
begin
  select alumno.fecha_alta
  into v_fecha_alta
  from public.alumnos as alumno
  where alumno.id = new.alumno_id;

  if v_fecha_alta is null then
    return new;
  end if;

  if new.tipo_pago = 'mensualidad' then
    v_mes_cargo := make_date(
      new.anio,
      public.numero_mes(new.mes),
      1
    );
    v_mes_alta := date_trunc('month', v_fecha_alta)::date;

    if v_mes_cargo < v_mes_alta then
      if tg_op = 'INSERT' then
        return null;
      end if;
      new.fecha_limite := old.fecha_limite;
    elsif new.fecha_limite < v_fecha_alta then
      new.fecha_limite := v_fecha_alta;
    end if;
  elsif new.tipo_pago = 'inscripcion'
    and new.fecha_limite < v_fecha_alta then
    new.fecha_limite := v_fecha_alta;
  end if;

  return new;
end;
$$;

-- En instalaciones existentes, auth.users conserva la fecha real en que se
-- creo la cuenta aunque alumnos todavia no tuviera fecha_alta.
update public.alumnos as alumno
set fecha_alta = least(
  alumno.fecha_alta,
  timezone('America/Mexico_City', usuario.created_at)::date
)
from auth.users as usuario
where usuario.id = alumno.usuario_id
  and timezone('America/Mexico_City', usuario.created_at)::date
      < alumno.fecha_alta;

-- Restaura los cargos aplicables del ciclo vigente que la version anterior
-- pudo omitir. No crea meses anteriores al mes de alta.
do $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
  v_ciclo text;
  v_alumno record;
begin
  v_inicio := case
    when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
    else extract(year from v_hoy)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;

  insert into public.estado_cuenta (
    alumno_id,
    concepto,
    tipo_pago,
    mes,
    anio,
    monto_esperado,
    monto_pagado,
    fecha_limite
  )
  select
    alumno.id,
    'Colegiatura ' || initcap(periodo.mes::text),
    'mensualidad',
    periodo.mes,
    periodo.anio,
    configuracion.costo_mensualidad,
    coalesce((
      select sum(pago.monto)
      from public.pagos as pago
      where pago.alumno_id = alumno.id
        and pago.tipo_pago = 'mensualidad'
        and pago.mes = periodo.mes
        and pago.anio = periodo.anio
    ), 0),
    greatest(
      make_date(periodo.anio, periodo.numero_mes, 10),
      alumno.fecha_alta
    )
  from public.alumnos as alumno
  join public.configuracion_costos as configuracion
    on configuracion.nivel = alumno.nivel
   and configuracion.ciclo_escolar = v_ciclo
  cross join (values
    ('agosto'::public.mes_pago, 8, v_inicio),
    ('septiembre'::public.mes_pago, 9, v_inicio),
    ('octubre'::public.mes_pago, 10, v_inicio),
    ('noviembre'::public.mes_pago, 11, v_inicio),
    ('diciembre'::public.mes_pago, 12, v_inicio),
    ('enero'::public.mes_pago, 1, v_inicio + 1),
    ('febrero'::public.mes_pago, 2, v_inicio + 1),
    ('marzo'::public.mes_pago, 3, v_inicio + 1),
    ('abril'::public.mes_pago, 4, v_inicio + 1),
    ('mayo'::public.mes_pago, 5, v_inicio + 1),
    ('junio'::public.mes_pago, 6, v_inicio + 1),
    ('julio'::public.mes_pago, 7, v_inicio + 1)
  ) as periodo(mes, numero_mes, anio)
  where alumno.estado = 'activo'
    and make_date(periodo.anio, periodo.numero_mes, 1)
        >= date_trunc('month', alumno.fecha_alta)::date
  on conflict (alumno_id, tipo_pago, mes, anio)
  do update set
    concepto = excluded.concepto,
    monto_pagado = excluded.monto_pagado,
    fecha_limite = excluded.fecha_limite;

  for v_alumno in
    select alumno.id
    from public.alumnos as alumno
    join public.configuracion_costos as configuracion
      on configuracion.nivel = alumno.nivel
     and configuracion.ciclo_escolar = v_ciclo
    where alumno.estado = 'activo'
  loop
    perform public.aplicar_beca_estado_cuenta(v_alumno.id, v_ciclo);
  end loop;

  perform public.actualizar_estatus_estado_cuenta();
end
$$;
