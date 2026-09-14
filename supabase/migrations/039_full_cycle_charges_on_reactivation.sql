-- Regla institucional: todo alumno reactivado cubre el ciclo escolar completo,
-- sin importar el mes en que vuelva a estado activo.

alter table public.alumnos
  add column if not exists ciclo_cobro_completo text;

alter table public.alumnos
  drop constraint if exists alumnos_ciclo_cobro_completo_check;
alter table public.alumnos
  add constraint alumnos_ciclo_cobro_completo_check
  check (
    ciclo_cobro_completo is null
    or ciclo_cobro_completo ~ '^[0-9]{4}-[0-9]{4}$'
  );

comment on column public.alumnos.ciclo_cobro_completo is
  'Ciclo que debe cobrarse completo porque el alumno fue reactivado.';

create or replace function public.marcar_cobro_completo_al_reactivar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
begin
  if (
      old.estado = 'baja'
      or (
        old.estado = 'pausa'
        and not old.pausa_automatica_inscripcion
      )
    )
    and new.estado = 'activo' then
    v_inicio := case
      when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
      else extract(year from v_hoy)::integer - 1
    end;
    new.ciclo_cobro_completo := v_inicio::text || '-' || (v_inicio + 1)::text;
  elsif old.estado = 'pausa'
    and old.pausa_automatica_inscripcion
    and new.estado = 'activo' then
    new.ciclo_cobro_completo := null;
  end if;
  return new;
end;
$$;

-- El prefijo zz hace que este BEFORE trigger se ejecute despues del trigger
-- que reactiva automaticamente al liquidar la inscripcion.
drop trigger if exists zz_marcar_cobro_completo_al_reactivar
  on public.alumnos;
create trigger zz_marcar_cobro_completo_al_reactivar
before update of estado, deuda_inscripcion
on public.alumnos
for each row execute function public.marcar_cobro_completo_al_reactivar();

create or replace function public.validar_cargo_desde_fecha_alta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_alta date;
  v_ciclo_completo text;
  v_mes_cargo date;
  v_mes_alta date;
  v_ciclo_cargo text;
begin
  select alumno.fecha_alta, alumno.ciclo_cobro_completo
  into v_fecha_alta, v_ciclo_completo
  from public.alumnos as alumno
  where alumno.id = new.alumno_id;

  if v_fecha_alta is null then
    return new;
  end if;

  v_ciclo_cargo := public.ciclo_de_pago(new.mes, new.anio);

  -- Una reactivacion habilita agosto-julio del ciclo marcado.
  if v_ciclo_completo = v_ciclo_cargo then
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

create or replace function public.generar_ciclo_completo_al_reactivar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio integer;
  v_configuracion record;
  v_periodo record;
  v_pagado numeric(12, 2);
begin
  if not (
    old.estado in ('pausa', 'baja')
    and new.estado = 'activo'
    and new.ciclo_cobro_completo is not null
  ) then
    return new;
  end if;

  v_inicio := split_part(new.ciclo_cobro_completo, '-', 1)::integer;

  select
    costo_inscripcion,
    costo_mensualidad,
    fecha_limite_inscripcion
  into v_configuracion
  from public.configuracion_costos
  where nivel = new.nivel
    and ciclo_escolar = new.ciclo_cobro_completo;

  if not found then
    return new;
  end if;

  select coalesce(sum(pago.monto), 0)
  into v_pagado
  from public.pagos as pago
  where pago.alumno_id = new.id
    and pago.tipo_pago = 'inscripcion'
    and pago.mes = 'agosto'
    and pago.anio = v_inicio;

  insert into public.estado_cuenta (
    alumno_id, concepto, tipo_pago, mes, anio,
    monto_esperado, monto_pagado, fecha_limite
  ) values (
    new.id,
    'Inscripción ' || v_inicio,
    'inscripcion',
    'agosto',
    v_inicio,
    v_configuracion.costo_inscripcion,
    v_pagado,
    v_configuracion.fecha_limite_inscripcion
  )
  on conflict (alumno_id, tipo_pago, mes, anio)
  do update set
    concepto = excluded.concepto,
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
      'mensualidad',
      v_periodo.mes,
      v_periodo.anio,
      v_configuracion.costo_mensualidad,
      v_pagado,
      make_date(v_periodo.anio, v_periodo.numero_mes, 10)
    )
    on conflict (alumno_id, tipo_pago, mes, anio)
    do update set
      concepto = excluded.concepto,
      monto_pagado = excluded.monto_pagado,
      fecha_limite = excluded.fecha_limite;
  end loop;

  perform public.aplicar_beca_estado_cuenta(
    new.id,
    new.ciclo_cobro_completo
  );
  perform public.actualizar_estatus_estado_cuenta();

  return new;
end;
$$;

drop trigger if exists generar_ciclo_completo_al_reactivar
  on public.alumnos;
create trigger generar_ciclo_completo_al_reactivar
after update of estado, deuda_inscripcion
on public.alumnos
for each row
when (old.estado is distinct from new.estado)
execute function public.generar_ciclo_completo_al_reactivar();

revoke all on function public.marcar_cobro_completo_al_reactivar() from public;
revoke all on function public.generar_ciclo_completo_al_reactivar() from public;
