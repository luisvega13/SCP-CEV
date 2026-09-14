-- Amplía el padrón exportable con el desglose de hombres y mujeres.

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
      count(a.id) filter (where a.sexo = 'hombre')::integer as hombres,
      count(a.id) filter (where a.sexo = 'mujer')::integer as mujeres,
      count(a.id) filter (where a.estado = 'activo')::integer as activos,
      count(a.id) filter (where a.estado = 'pausa')::integer as pausas,
      count(a.id) filter (where a.estado = 'baja')::integer as bajas
    from niveles n
    cross join lateral generate_series(1, n.grados) as g(grado)
    left join public.alumnos a
      on a.nivel = n.nivel
      and a.grado = g.grado
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
    'generado_en', now(),
    'total_general', coalesce((select count(*) from public.alumnos), 0),
    'total_hombres', coalesce((select count(*) from public.alumnos where sexo = 'hombre'), 0),
    'total_mujeres', coalesce((select count(*) from public.alumnos where sexo = 'mujer'), 0),
    'total_activos', coalesce((select count(*) from public.alumnos where estado = 'activo'), 0),
    'total_pausas', coalesce((select count(*) from public.alumnos where estado = 'pausa'), 0),
    'total_bajas', coalesce((select count(*) from public.alumnos where estado = 'baja'), 0),
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

revoke all on function public.obtener_desglose_alumnos() from public;
grant execute on function public.obtener_desglose_alumnos() to authenticated;

notify pgrst, 'reload schema';
