-- Los cargos de un alumno comienzan cuando fue dado de alta en el sistema.
-- Un cargo mensual cuya fecha de corte ya habia pasado antes del alta no aplica.

alter table public.alumnos
  add column if not exists fecha_alta date;

-- Para registros existentes usamos la evidencia operativa mas antigua disponible.
-- Esto conserva el historial pagado y evita inventar deudas anteriores a la carga
-- del alumno cuando no existe ningun movimiento previo.
update public.alumnos as alumno
set fecha_alta = coalesce(
  (
    select min(evidencia.fecha)
    from (
      select timezone('America/Mexico_City', pago.fecha_pago)::date as fecha
      from public.pagos as pago
      where pago.alumno_id = alumno.id
      union all
      select timezone('America/Mexico_City', cargo.created_at)::date as fecha
      from public.estado_cuenta as cargo
      where cargo.alumno_id = alumno.id
    ) as evidencia
  ),
  timezone('America/Mexico_City', now())::date
)
where alumno.fecha_alta is null;

alter table public.alumnos
  alter column fecha_alta set default
    (timezone('America/Mexico_City', now())::date),
  alter column fecha_alta set not null;

comment on column public.alumnos.fecha_alta is
  'Fecha desde la que el alumno puede generar obligaciones financieras en el sistema.';

create index if not exists alumnos_fecha_alta_idx
  on public.alumnos (fecha_alta);

-- Retira exclusivamente cargos mensuales sin pagos cuyo mes es anterior al alta.
-- Los cargos con abonos se conservan como evidencia financiera.
delete from public.estado_cuenta as cargo
using public.alumnos as alumno
where cargo.alumno_id = alumno.id
  and cargo.tipo_pago = 'mensualidad'
  and cargo.monto_pagado = 0
  and date_trunc('month', cargo.fecha_limite)::date
      < date_trunc('month', alumno.fecha_alta)::date;

-- La inscripcion si corresponde al alta, pero nunca debe nacer vencida.
update public.estado_cuenta as cargo
set fecha_limite = alumno.fecha_alta,
    updated_at = now()
from public.alumnos as alumno
where cargo.alumno_id = alumno.id
  and cargo.tipo_pago = 'inscripcion'
  and cargo.monto_pagado = 0
  and cargo.fecha_limite < alumno.fecha_alta;

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
      -- En un INSERT, retornar null omite un mes anterior al alta.
      if tg_op = 'INSERT' then
        return null;
      end if;
      new.fecha_limite := old.fecha_limite;
    elsif new.fecha_limite < v_fecha_alta then
      -- El mes de alta si aplica, pero no nace vencido antes del registro.
      new.fecha_limite := v_fecha_alta;
    end if;
  elsif new.tipo_pago = 'inscripcion'
    and new.fecha_limite < v_fecha_alta then
    new.fecha_limite := v_fecha_alta;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_cargo_desde_fecha_alta_trigger
  on public.estado_cuenta;
create trigger validar_cargo_desde_fecha_alta_trigger
before insert or update of alumno_id, tipo_pago, fecha_limite
on public.estado_cuenta
for each row execute function public.validar_cargo_desde_fecha_alta();

revoke all on function public.validar_cargo_desde_fecha_alta() from public;

-- Al crear un alumno, genera su estado de cuenta del ciclo vigente. El trigger
-- anterior se encarga de omitir automaticamente los meses cuyo corte ya paso.
create or replace function public.inicializar_deuda_nuevo_alumno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
  v_ciclo text;
  v_configuracion record;
  v_periodo record;
  v_pagado numeric(12, 2);
begin
  v_inicio := case
    when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
    else extract(year from v_hoy)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;

  select
    configuracion.costo_inscripcion,
    configuracion.costo_mensualidad,
    configuracion.fecha_limite_inscripcion
  into v_configuracion
  from public.configuracion_costos as configuracion
  where configuracion.nivel = new.nivel
    and configuracion.ciclo_escolar = v_ciclo;

  if new.estado = 'activo' and found then
    select coalesce(sum(pago.monto), 0)
    into v_pagado
    from public.pagos as pago
    where pago.alumno_id = new.id
      and pago.tipo_pago = 'inscripcion'
      and pago.ciclo_escolar = v_ciclo;

    insert into public.estado_cuenta (
      alumno_id, concepto, tipo_pago, mes, anio,
      monto_esperado, monto_pagado, fecha_limite
    ) values (
      new.id, 'Inscripción ' || v_inicio, 'inscripcion', 'agosto', v_inicio,
      v_configuracion.costo_inscripcion, v_pagado,
      greatest(v_configuracion.fecha_limite_inscripcion, new.fecha_alta)
    )
    on conflict (alumno_id, tipo_pago, mes, anio)
    do update set
      concepto = excluded.concepto,
      monto_esperado = excluded.monto_esperado,
      monto_pagado = excluded.monto_pagado,
      fecha_limite = excluded.fecha_limite;

    for v_periodo in
      select *
      from (values
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
      ) as periodos(mes, numero_mes, anio)
      where make_date(anio, numero_mes, 1)
        >= date_trunc('month', new.fecha_alta)::date
    loop
      select coalesce(sum(pago.monto), 0)
      into v_pagado
      from public.pagos as pago
      where pago.alumno_id = new.id
        and pago.tipo_pago = 'mensualidad'
        and pago.mes = v_periodo.mes
        and pago.anio = v_periodo.anio;

      insert into public.estado_cuenta (
        alumno_id, concepto, tipo_pago, mes, anio,
        monto_esperado, monto_pagado, fecha_limite
      ) values (
        new.id,
        'Colegiatura ' || initcap(v_periodo.mes::text),
        'mensualidad', v_periodo.mes, v_periodo.anio,
        v_configuracion.costo_mensualidad, v_pagado,
        greatest(
          make_date(v_periodo.anio, v_periodo.numero_mes, 10),
          new.fecha_alta
        )
      )
      on conflict (alumno_id, tipo_pago, mes, anio)
      do update set
        concepto = excluded.concepto,
        monto_esperado = excluded.monto_esperado,
        monto_pagado = excluded.monto_pagado,
        fecha_limite = excluded.fecha_limite;
    end loop;

    if to_regprocedure(
      'public.aplicar_beca_estado_cuenta(uuid,text)'
    ) is not null then
      perform public.aplicar_beca_estado_cuenta(new.id, v_ciclo);
    else
      perform public.recalcular_deuda_alumno(new.id, v_ciclo);
    end if;
  end if;

  return new;
end;
$$;

-- Sincroniza los saldos operativos del ciclo actual despues de limpiar cargos.
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

  if to_regprocedure('public.recalcular_deuda_alumno(uuid,text)') is not null then
    for v_alumno in select id from public.alumnos loop
      perform public.recalcular_deuda_alumno(v_alumno.id, v_ciclo);
    end loop;
  end if;

  if to_regprocedure('public.actualizar_estatus_estado_cuenta()') is not null then
    perform public.actualizar_estatus_estado_cuenta();
  end if;
end
$$;
