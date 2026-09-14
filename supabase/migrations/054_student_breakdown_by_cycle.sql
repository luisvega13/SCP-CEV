-- El desglose del padrón se genera obligatoriamente para un ciclo escolar.

drop function if exists public.obtener_desglose_alumnos();

create or replace function public.obtener_desglose_alumnos(
  p_ciclo_escolar text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_inicio date;
  v_fin date;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede exportar el padrón escolar'
      using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer
      <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es válido' using errcode = '22023';
  end if;

  v_inicio := make_date(split_part(p_ciclo_escolar, '-', 1)::integer, 8, 1);
  v_fin := make_date(split_part(p_ciclo_escolar, '-', 2)::integer, 7, 31);

  with niveles(orden, nivel, grados) as (
    values
      (1, 'preescolar'::public.nivel_escolar, 3),
      (2, 'primaria'::public.nivel_escolar, 6),
      (3, 'secundaria'::public.nivel_escolar, 3),
      (4, 'bachillerato'::public.nivel_escolar, 6)
  ), participantes_ids as materialized (
    select distinct ec.alumno_id
    from public.estado_cuenta ec
    where public.ciclo_de_pago(ec.mes, ec.anio) = p_ciclo_escolar
    union
    select distinct p.alumno_id
    from public.pagos p
    where p.ciclo_escolar = p_ciclo_escolar
    union
    select a.id
    from public.alumnos a
    where a.ciclo_grado_actual = p_ciclo_escolar
      and a.fecha_alta <= v_fin
  ), padron_ciclo as materialized (
    select
      a.id,
      a.sexo,
      coalesce(
        promocion.nivel_nuevo,
        estado_ciclo.nivel,
        case when a.ciclo_grado_actual = p_ciclo_escolar then a.nivel end,
        promocion_posterior.nivel_anterior,
        a.nivel
      ) as nivel,
      coalesce(
        promocion.grado_nuevo,
        estado_ciclo.grado,
        case when a.ciclo_grado_actual = p_ciclo_escolar then a.grado end,
        promocion_posterior.grado_anterior,
        a.grado
      ) as grado,
      coalesce(
        estado_final.estado_nuevo,
        case
          when p_ciclo_escolar = public.ciclo_escolar_actual() then a.estado
          else 'activo'::public.estado_alumno
        end
      ) as estado
    from participantes_ids participante
    join public.alumnos a on a.id = participante.alumno_id
    left join lateral (
      select p.nivel_nuevo, p.grado_nuevo
      from public.promociones_academicas p
      where p.alumno_id = a.id
        and p.ciclo_escolar = p_ciclo_escolar
      order by p.fecha_promocion desc
      limit 1
    ) promocion on true
    left join lateral (
      select h.nivel, h.grado
      from public.historial_estados_alumnos h
      where h.alumno_id = a.id
        and h.ciclo_escolar = p_ciclo_escolar
      order by h.registrado_en desc, h.id desc
      limit 1
    ) estado_ciclo on true
    left join lateral (
      select p.nivel_anterior, p.grado_anterior
      from public.promociones_academicas p
      where p.alumno_id = a.id
        and p.ciclo_escolar > p_ciclo_escolar
      order by p.ciclo_escolar asc, p.fecha_promocion asc
      limit 1
    ) promocion_posterior on true
    left join lateral (
      select h.estado_nuevo
      from public.historial_estados_alumnos h
      where h.alumno_id = a.id
        and coalesce(h.fecha_evento, h.registrado_en)
          < (v_fin + 1)::timestamp
      order by coalesce(h.fecha_evento, h.registrado_en) desc,
        h.registrado_en desc, h.id desc
      limit 1
    ) estado_final on true
  ), desglose as (
    select
      n.orden,
      n.nivel,
      g.grado,
      count(a.id)::integer as total,
      count(a.id) filter (where a.sexo = 'hombre')::integer as hombres,
      count(a.id) filter (where a.sexo = 'mujer')::integer as mujeres,
      count(a.id) filter (where a.estado = 'activo')::integer as activos,
      count(a.id) filter (where a.estado = 'pausa')::integer as pausas,
      count(a.id) filter (where a.estado = 'baja')::integer as bajas
    from niveles n
    cross join lateral generate_series(1, n.grados) as g(grado)
    left join padron_ciclo a on a.nivel = n.nivel and a.grado = g.grado
    group by n.orden, n.nivel, g.grado
  ), totales_nivel as (
    select
      orden,
      nivel,
      sum(total)::integer as total,
      sum(hombres)::integer as hombres,
      sum(mujeres)::integer as mujeres,
      sum(activos)::integer as activos,
      sum(pausas)::integer as pausas,
      sum(bajas)::integer as bajas,
      jsonb_agg(jsonb_build_object(
        'grado', grado,
        'total', total,
        'hombres', hombres,
        'mujeres', mujeres,
        'activos', activos,
        'pausas', pausas,
        'bajas', bajas
      ) order by grado) as grados
    from desglose
    group by orden, nivel
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'generado_en', now(),
    'total_general', (select count(*) from padron_ciclo),
    'total_hombres', (select count(*) from padron_ciclo where sexo = 'hombre'),
    'total_mujeres', (select count(*) from padron_ciclo where sexo = 'mujer'),
    'total_activos', (select count(*) from padron_ciclo where estado = 'activo'),
    'total_pausas', (select count(*) from padron_ciclo where estado = 'pausa'),
    'total_bajas', (select count(*) from padron_ciclo where estado = 'baja'),
    'niveles', jsonb_agg(jsonb_build_object(
      'nivel', nivel,
      'total', total,
      'hombres', hombres,
      'mujeres', mujeres,
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

revoke all on function public.obtener_desglose_alumnos(text) from public;
grant execute on function public.obtener_desglose_alumnos(text) to authenticated;

notify pgrst, 'reload schema';
