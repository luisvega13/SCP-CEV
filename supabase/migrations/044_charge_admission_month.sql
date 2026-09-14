-- El mes calendario en que se registra un alumno nuevo siempre se cobra,
-- aunque el dia de corte de ese mes ya haya pasado. Los meses anteriores no aplican.

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
      greatest(v_configuracion.fecha_limite_inscripcion, new.fecha_alta)
    )
    on conflict (alumno_id, tipo_pago, mes, anio)
    do update set
      concepto = excluded.concepto,
      monto_esperado = greatest(
        public.estado_cuenta.monto_pagado,
        excluded.monto_esperado
      ),
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
      -- Se compara contra el primer dia del mes, no contra el dia de corte.
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
        'mensualidad',
        v_periodo.mes,
        v_periodo.anio,
        v_configuracion.costo_mensualidad,
        v_pagado,
        greatest(
          make_date(v_periodo.anio, v_periodo.numero_mes, 10),
          new.fecha_alta
        )
      )
      on conflict (alumno_id, tipo_pago, mes, anio)
      do update set
        concepto = excluded.concepto,
        monto_esperado = greatest(
          public.estado_cuenta.monto_pagado,
          excluded.monto_esperado
        ),
        monto_pagado = excluded.monto_pagado,
        fecha_limite = excluded.fecha_limite;
    end loop;

    perform public.aplicar_beca_estado_cuenta(new.id, v_ciclo);
    perform public.actualizar_estatus_estado_cuenta();
  end if;

  return new;
end;
$$;

-- Conserva el trigger existente, pero garantiza que use la funcion corregida.
drop trigger if exists inicializar_deuda_nuevo_alumno on public.alumnos;
create trigger inicializar_deuda_nuevo_alumno
after insert or update of nivel on public.alumnos
for each row execute function public.inicializar_deuda_nuevo_alumno();

revoke all on function public.inicializar_deuda_nuevo_alumno() from public;

-- Recupera la fecha real de alta desde Auth cuando sea anterior a la registrada.
update public.alumnos as alumno
set fecha_alta = least(
  alumno.fecha_alta,
  timezone('America/Mexico_City', usuario.created_at)::date
)
from auth.users as usuario
where usuario.id = alumno.usuario_id
  and timezone('America/Mexico_City', usuario.created_at)::date
      < alumno.fecha_alta;

-- Crea el cargo del mes de alta que una version anterior pudo omitir.
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
  'Colegiatura ' || initcap(public.mes_desde_numero(
    extract(month from alumno.fecha_alta)::smallint
  )::text),
  'mensualidad',
  public.mes_desde_numero(extract(month from alumno.fecha_alta)::smallint),
  extract(year from alumno.fecha_alta)::integer,
  configuracion.costo_mensualidad,
  coalesce((
    select sum(pago.monto)
    from public.pagos as pago
    where pago.alumno_id = alumno.id
      and pago.tipo_pago = 'mensualidad'
      and pago.mes = public.mes_desde_numero(
        extract(month from alumno.fecha_alta)::smallint
      )
      and pago.anio = extract(year from alumno.fecha_alta)::integer
  ), 0),
  greatest(
    make_date(
      extract(year from alumno.fecha_alta)::integer,
      extract(month from alumno.fecha_alta)::integer,
      10
    ),
    alumno.fecha_alta
  )
from public.alumnos as alumno
join public.configuracion_costos as configuracion
  on configuracion.nivel = alumno.nivel
 and configuracion.ciclo_escolar = public.ciclo_de_pago(
   public.mes_desde_numero(extract(month from alumno.fecha_alta)::smallint),
   extract(year from alumno.fecha_alta)::smallint
 )
where alumno.estado = 'activo'
  and not exists (
    select 1
    from public.estado_cuenta as cargo
    where cargo.alumno_id = alumno.id
      and cargo.tipo_pago = 'mensualidad'
      and cargo.mes = public.mes_desde_numero(
        extract(month from alumno.fecha_alta)::smallint
      )
      and cargo.anio = extract(year from alumno.fecha_alta)::integer
  );

-- Reubica exclusivamente pagos capturados antes de que iniciara el mes futuro
-- y que saltaron por error del mes de alta al mes siguiente.
update public.pagos as pago
set
  mes = public.mes_desde_numero(
    extract(month from alumno.fecha_alta)::smallint
  ),
  anio = extract(year from alumno.fecha_alta)::integer
from public.alumnos as alumno
where pago.alumno_id = alumno.id
  and pago.tipo_pago = 'mensualidad'
  and make_date(pago.anio, public.numero_mes(pago.mes), 1)
      = (date_trunc('month', alumno.fecha_alta) + interval '1 month')::date
  and timezone('America/Mexico_City', pago.fecha_pago)::date
      < make_date(pago.anio, public.numero_mes(pago.mes), 1)
  and not exists (
    select 1
    from public.pagos as pago_mes_alta
    where pago_mes_alta.alumno_id = alumno.id
      and pago_mes_alta.tipo_pago = 'mensualidad'
      and pago_mes_alta.mes = public.mes_desde_numero(
        extract(month from alumno.fecha_alta)::smallint
      )
      and pago_mes_alta.anio = extract(year from alumno.fecha_alta)::integer
  );

-- Reaplica becas y saldos de los alumnos afectados del ciclo vigente.
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

  for v_alumno in
    select id
    from public.alumnos
    where fecha_alta between make_date(v_inicio, 8, 1)
      and make_date(v_inicio + 1, 7, 31)
  loop
    perform public.aplicar_beca_estado_cuenta(v_alumno.id, v_ciclo);
  end loop;

  perform public.actualizar_estatus_estado_cuenta();
end
$$;
