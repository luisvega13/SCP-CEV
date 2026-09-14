-- Cartera vencida consolidada: una fila por alumno y desglose de sus cargos.

create or replace function public.consultar_cartera_vencida_alumnos(
  p_nivel public.nivel_escolar default null,
  p_grado smallint default null,
  p_grupo text default null,
  p_tipo_pago public.tipo_pago default null,
  p_busqueda text default '',
  p_limite integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar la cartera vencida'
      using errcode = '42501';
  end if;
  if p_grado is not null and (p_grado < 1 or p_grado > 6) then
    raise exception 'El grado no es válido' using errcode = '22023';
  end if;
  if p_limite < 1 or p_limite > 100 or p_offset < 0 then
    raise exception 'La paginación no es válida' using errcode = '22023';
  end if;

  with cargos_vencidos as materialized (
    select
      ec.id,
      ec.alumno_id,
      ec.concepto,
      ec.tipo_pago,
      ec.fecha_limite,
      greatest(ec.monto_esperado - ec.monto_pagado, 0)::numeric(12, 2) as saldo,
      a.matricula,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.nivel,
      a.grado,
      a.grupo
    from public.estado_cuenta ec
    join public.alumnos a on a.id = ec.alumno_id
    where ec.fecha_limite < timezone('America/Mexico_City', now())::date
      and ec.monto_esperado > ec.monto_pagado
      and (p_nivel is null or a.nivel = p_nivel)
      and (p_grado is null or a.grado = p_grado)
      and (nullif(trim(coalesce(p_grupo, '')), '') is null
        or lower(a.grupo) = lower(trim(p_grupo)))
      and (p_tipo_pago is null or ec.tipo_pago = p_tipo_pago)
      and (
        nullif(trim(coalesce(p_busqueda, '')), '') is null
        or a.matricula ilike '%' || trim(p_busqueda) || '%'
        or concat_ws(' ', a.nombre, a.apellido_paterno, a.apellido_materno)
          ilike '%' || trim(p_busqueda) || '%'
      )
  ), alumnos_consolidados as materialized (
    select
      c.alumno_id,
      c.matricula,
      c.nombre,
      c.apellido_paterno,
      c.apellido_materno,
      c.nivel,
      c.grado,
      c.grupo,
      count(*)::integer as cantidad_cargos,
      sum(c.saldo)::numeric(12, 2) as saldo_vencido,
      min(c.fecha_limite) as fecha_vencimiento_mas_antigua,
      jsonb_agg(jsonb_build_object(
        'id', c.id,
        'concepto', c.concepto,
        'tipo_pago', c.tipo_pago,
        'fecha_limite', c.fecha_limite,
        'saldo', c.saldo
      ) order by c.fecha_limite, c.id) as cargos
    from cargos_vencidos c
    group by c.alumno_id, c.matricula, c.nombre, c.apellido_paterno,
      c.apellido_materno, c.nivel, c.grado, c.grupo
  ), pagina as (
    select *
    from alumnos_consolidados
    order by saldo_vencido desc, apellido_paterno, apellido_materno, nombre
    limit p_limite offset p_offset
  )
  select jsonb_build_object(
    'total_alumnos', (select count(*) from alumnos_consolidados),
    'total_saldo_vencido', coalesce((select sum(saldo_vencido)
      from alumnos_consolidados), 0),
    'registros', coalesce((select jsonb_agg(jsonb_build_object(
      'alumno_id', p.alumno_id,
      'matricula', p.matricula,
      'nombre', p.nombre,
      'apellido_paterno', p.apellido_paterno,
      'apellido_materno', p.apellido_materno,
      'nivel', p.nivel,
      'grado', p.grado,
      'grupo', p.grupo,
      'cantidad_cargos', p.cantidad_cargos,
      'saldo_vencido', p.saldo_vencido,
      'fecha_vencimiento_mas_antigua', p.fecha_vencimiento_mas_antigua,
      'cargos', p.cargos
    ) order by p.saldo_vencido desc, p.apellido_paterno,
      p.apellido_materno, p.nombre) from pagina p), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.consultar_cartera_vencida_alumnos(
  public.nivel_escolar, smallint, text, public.tipo_pago,
  text, integer, integer
) from public;
grant execute on function public.consultar_cartera_vencida_alumnos(
  public.nivel_escolar, smallint, text, public.tipo_pago,
  text, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
