-- Los alumnos que ya pertenecian al ciclo cuando se incorporo fecha_alta son
-- registros heredados. Para ellos, el alta financiera inicia con el ciclo.
-- Los alumnos creados despues de esta migracion conservan su fecha real.

do $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
  v_ciclo text;
  v_inicio_ciclo date;
  v_alumno record;
begin
  v_inicio := case
    when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
    else extract(year from v_hoy)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;
  v_inicio_ciclo := make_date(v_inicio, 8, 1);

  update public.alumnos as alumno_alta
  set fecha_alta = v_inicio_ciclo
  where (
      alumno_alta.ciclo_grado_actual = v_ciclo
      or exists (
        select 1
        from public.estado_cuenta as cargo
        where cargo.alumno_id = alumno_alta.id
          and public.ciclo_de_pago(cargo.mes, cargo.anio) = v_ciclo
      )
    )
    and alumno_alta.fecha_alta > v_inicio_ciclo;

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
    make_date(periodo.anio, periodo.numero_mes, 10)
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

-- La secuencia de pagos consulta ahora el estado de cuenta. Un mes anterior
-- solo se exige cuando realmente existe para ese alumno.
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
  v_costo_actual numeric(12, 2);
  v_costo_anterior numeric(12, 2);
  v_porcentaje numeric(5, 2) := 0;
  v_alcance public.alcance_beca;
  v_vigencia_desde date;
  v_mes_numero smallint;
  v_mes_anterior public.mes_pago;
  v_anio_anterior smallint;
  v_pagado_actual numeric(12, 2);
  v_pagado_anterior numeric(12, 2);
  v_cargo_anterior_encontrado boolean := false;
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

  select porcentaje_aplicado, alcance_aplicado, vigencia_desde
  into v_porcentaje, v_alcance, v_vigencia_desde
  from public.alumnos_becas
  where alumno_id = new.alumno_id and ciclo_escolar = v_ciclo;

  v_costo_actual := public.costo_con_beca(
    case
      when new.tipo_pago = 'inscripcion' then v_costo_inscripcion
      else v_costo_mensualidad
    end,
    coalesce(v_porcentaje, 0),
    public.beca_aplica_en_periodo(
      v_alcance, v_vigencia_desde,
      new.tipo_pago, new.mes, new.anio
    )
  );

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
    if v_pagado_actual + new.monto > v_costo_actual then
      raise exception 'El pago excede el saldo de inscripción vigente';
    end if;
  else
    if v_deuda_inscripcion > 0 then
      raise exception 'Debe liquidarse la inscripción antes de pagar mensualidades';
    end if;
    if v_pagado_actual + new.monto > v_costo_actual then
      raise exception 'El pago excede el costo vigente de la mensualidad';
    end if;

    v_mes_numero := public.numero_mes(new.mes);
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

      select monto_esperado, monto_pagado
      into v_costo_anterior, v_pagado_anterior
      from public.estado_cuenta
      where alumno_id = new.alumno_id
        and tipo_pago = 'mensualidad'
        and mes = v_mes_anterior
        and anio = v_anio_anterior;
      v_cargo_anterior_encontrado := found;

      if v_cargo_anterior_encontrado
        and v_pagado_anterior < v_costo_anterior then
        raise exception 'Debe liquidarse % de % antes de continuar',
          v_mes_anterior, v_anio_anterior;
      end if;
    end if;
  end if;

  return new;
end;
$$;
