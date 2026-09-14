-- Exportaciones consolidadas para planeación financiera y padrón escolar.

create or replace function public.obtener_resumen_financiero_mensual(
  p_ciclo_escolar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio integer;
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede exportar el resumen financiero'
      using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'El ciclo escolar no tiene un formato válido';
  end if;

  v_inicio := split_part(p_ciclo_escolar, '-', 1)::integer;
  if split_part(p_ciclo_escolar, '-', 2)::integer <> v_inicio + 1 then
    raise exception 'El ciclo escolar debe contener años consecutivos';
  end if;

  with meses(orden, mes, etiqueta, anio, numero_mes) as (
    values
      (1, 'agosto'::public.mes_pago, 'Agosto', v_inicio, 8),
      (2, 'septiembre'::public.mes_pago, 'Septiembre', v_inicio, 9),
      (3, 'octubre'::public.mes_pago, 'Octubre', v_inicio, 10),
      (4, 'noviembre'::public.mes_pago, 'Noviembre', v_inicio, 11),
      (5, 'diciembre'::public.mes_pago, 'Diciembre', v_inicio, 12),
      (6, 'enero'::public.mes_pago, 'Enero', v_inicio + 1, 1),
      (7, 'febrero'::public.mes_pago, 'Febrero', v_inicio + 1, 2),
      (8, 'marzo'::public.mes_pago, 'Marzo', v_inicio + 1, 3),
      (9, 'abril'::public.mes_pago, 'Abril', v_inicio + 1, 4),
      (10, 'mayo'::public.mes_pago, 'Mayo', v_inicio + 1, 5),
      (11, 'junio'::public.mes_pago, 'Junio', v_inicio + 1, 6),
      (12, 'julio'::public.mes_pago, 'Julio', v_inicio + 1, 7)
  ), resumen as (
    select
      m.orden,
      m.mes,
      m.etiqueta,
      m.anio,
      coalesce((
        select sum(ec.monto_esperado)
        from public.estado_cuenta ec
        where ec.mes = m.mes and ec.anio = m.anio
      ), 0)::numeric(14, 2) as proyectado,
      coalesce((
        select sum(p.monto)
        from public.pagos p
        where p.fecha_pago >= make_timestamptz(m.anio, m.numero_mes, 1, 0, 0, 0, 'America/Mexico_City')
          and p.fecha_pago < make_timestamptz(m.anio, m.numero_mes, 1, 0, 0, 0, 'America/Mexico_City') + interval '1 month'
      ), 0)::numeric(14, 2) as pagado,
      coalesce((
        select sum(greatest(ec.monto_esperado - ec.monto_pagado, 0))
        from public.estado_cuenta ec
        where ec.mes = m.mes and ec.anio = m.anio
      ), 0)::numeric(14, 2) as adeudo
    from meses m
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'generado_en', now(),
    'total_proyectado', coalesce(sum(proyectado), 0),
    'total_pagado', coalesce(sum(pagado), 0),
    'total_adeudo', coalesce(sum(adeudo), 0),
    'meses', jsonb_agg(jsonb_build_object(
      'orden', orden,
      'mes', mes,
      'etiqueta', etiqueta,
      'anio', anio,
      'proyectado', proyectado,
      'pagado', pagado,
      'adeudo', adeudo
    ) order by orden)
  ) into v_resultado
  from resumen;

  return v_resultado;
end;
$$;

revoke all on function public.obtener_resumen_financiero_mensual(text) from public;
grant execute on function public.obtener_resumen_financiero_mensual(text) to authenticated;

create or replace function public.obtener_desglose_alumnos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede exportar el padrón escolar'
      using errcode = '42501';
  end if;

  with niveles(orden, nivel, grados) as (
    values
      (1, 'preescolar'::public.nivel_escolar, 3),
      (2, 'primaria'::public.nivel_escolar, 6),
      (3, 'secundaria'::public.nivel_escolar, 3),
      (4, 'bachillerato'::public.nivel_escolar, 6)
  ), desglose as (
    select
      n.orden,
      n.nivel,
      g.grado,
      count(a.id)::integer as total,
      count(a.id) filter (where a.estado = 'activo')::integer as activos,
      count(a.id) filter (where a.estado = 'pausa')::integer as pausas,
      count(a.id) filter (where a.estado = 'baja')::integer as bajas
    from niveles n
    cross join lateral generate_series(1, n.grados) as g(grado)
    left join public.alumnos a on a.nivel = n.nivel and a.grado = g.grado
    group by n.orden, n.nivel, g.grado
  ), totales_nivel as (
    select
      orden,
      nivel,
      sum(total)::integer as total,
      sum(activos)::integer as activos,
      sum(pausas)::integer as pausas,
      sum(bajas)::integer as bajas,
      jsonb_agg(jsonb_build_object(
        'grado', grado,
        'total', total,
        'activos', activos,
        'pausas', pausas,
        'bajas', bajas
      ) order by grado) as grados
    from desglose
    group by orden, nivel
  )
  select jsonb_build_object(
    'generado_en', now(),
    'total_general', coalesce((select count(*) from public.alumnos), 0),
    'total_activos', coalesce((select count(*) from public.alumnos where estado = 'activo'), 0),
    'total_pausas', coalesce((select count(*) from public.alumnos where estado = 'pausa'), 0),
    'total_bajas', coalesce((select count(*) from public.alumnos where estado = 'baja'), 0),
    'niveles', jsonb_agg(jsonb_build_object(
      'nivel', nivel,
      'total', total,
      'activos', activos,
      'pausas', pausas,
      'bajas', bajas,
      'grados', grados
    ) order by orden)
  ) into v_resultado
  from totales_nivel;

  return v_resultado;
end;
$$;

revoke all on function public.obtener_desglose_alumnos() from public;
grant execute on function public.obtener_desglose_alumnos() to authenticated;

notify pgrst, 'reload schema';
