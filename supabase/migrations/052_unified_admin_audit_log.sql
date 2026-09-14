-- Bitácora administrativa unificada y de solo lectura.
-- Reúne las fuentes de auditoría existentes sin duplicar ni modificar eventos.

create or replace function public.consultar_auditoria_administrativa(
  p_tipo_evento text default null,
  p_desde date default null,
  p_hasta date default null,
  p_busqueda text default '',
  p_limite integer default 15,
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
    raise exception 'Solo un administrador puede consultar la auditoría'
      using errcode = '42501';
  end if;

  if p_tipo_evento is not null and p_tipo_evento not in (
    'pago_modificado', 'pago_eliminado', 'beca_asignada',
    'curp_modificada', 'estado_alumno'
  ) then
    raise exception 'El tipo de evento no es válido' using errcode = '22023';
  end if;
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha inicial no puede ser posterior a la fecha final'
      using errcode = '22023';
  end if;
  if p_limite < 1 or p_limite > 100 or p_offset < 0 then
    raise exception 'La paginación no es válida' using errcode = '22023';
  end if;

  with eventos as materialized (
    select
      ap.id,
      'pago_modificado'::text as tipo_evento,
      'pagos'::text as categoria,
      ap.fecha_modificacion as fecha,
      a.id as alumno_id,
      a.matricula,
      nullif(concat_ws(' ', a.nombre, a.apellido_paterno,
        nullif(a.apellido_materno, '')), '') as alumno,
      coalesce(u.email, 'Usuario no disponible')::text as responsable,
      ap.motivo,
      'Se corrigieron datos de un pago registrado'::text as resumen,
      jsonb_build_object(
        'pago_id', ap.pago_id,
        'monto_anterior', ap.monto_anterior,
        'monto_nuevo', ap.monto_nuevo,
        'metodo_anterior', ap.metodo_anterior,
        'metodo_nuevo', ap.metodo_nuevo,
        'facturado_anterior', ap.facturado_anterior,
        'facturado_nuevo', ap.facturado_nuevo
      ) as detalle
    from public.auditoria_pagos ap
    left join public.pagos p on p.id = ap.pago_id
    left join public.auditoria_pagos_eliminados pe on pe.pago_id = ap.pago_id
    left join public.alumnos a on a.id = coalesce(p.alumno_id, pe.alumno_id)
    left join auth.users u on u.id = ap.modificado_por

    union all

    select
      pe.id,
      'pago_eliminado'::text,
      'pagos'::text,
      pe.fecha_eliminacion,
      a.id,
      a.matricula,
      nullif(concat_ws(' ', a.nombre, a.apellido_paterno,
        nullif(a.apellido_materno, '')), ''),
      coalesce(u.email, 'Usuario no disponible')::text,
      pe.motivo,
      'Se eliminó un pago registrado'::text,
      jsonb_build_object(
        'pago_id', pe.pago_id,
        'monto', pe.monto,
        'tipo_pago', pe.tipo_pago,
        'metodo_pago', pe.metodo_pago,
        'facturado', pe.facturado,
        'folio_comprobante', pe.folio_comprobante,
        'periodo', initcap(pe.mes::text) || ' ' || pe.anio,
        'fecha_pago_original', pe.fecha_pago_original
      )
    from public.auditoria_pagos_eliminados pe
    join public.alumnos a on a.id = pe.alumno_id
    left join auth.users u on u.id = pe.eliminado_por

    union all

    select
      ab.id,
      'beca_asignada'::text,
      'becas'::text,
      ab.fecha_evento,
      a.id,
      a.matricula,
      nullif(concat_ws(' ', a.nombre, a.apellido_paterno,
        nullif(a.apellido_materno, '')), ''),
      coalesce(u.email, 'Usuario no disponible')::text,
      nullif(ab.observaciones, ''),
      'Se asignó la beca ' || ab.beca_nombre,
      jsonb_build_object(
        'beca', ab.beca_nombre,
        'ciclo_escolar', ab.ciclo_escolar,
        'tipo_descuento', ab.tipo_descuento_aplicado,
        'porcentaje', ab.porcentaje_aplicado,
        'monto_fijo', ab.monto_fijo_aplicado,
        'alcance', ab.alcance_aplicado,
        'vigencia_desde', ab.vigencia_desde
      )
    from public.auditoria_asignaciones_becas ab
    join public.alumnos a on a.id = ab.alumno_id
    left join auth.users u on u.id = ab.asignado_por

    union all

    select
      ac.id,
      'curp_modificada'::text,
      'alumnos'::text,
      ac.fecha_modificacion,
      a.id,
      a.matricula,
      nullif(concat_ws(' ', a.nombre, a.apellido_paterno,
        nullif(a.apellido_materno, '')), ''),
      coalesce(u.email, 'Usuario no disponible')::text,
      null::text,
      'Se modificó la CURP del alumno'::text,
      jsonb_build_object(
        'curp_anterior', ac.curp_anterior,
        'curp_nueva', ac.curp_nueva
      )
    from public.auditoria_curp_alumnos ac
    join public.alumnos a on a.id = ac.alumno_id
    left join auth.users u on u.id = ac.modificado_por

    union all

    select
      he.id,
      'estado_alumno'::text,
      'alumnos'::text,
      coalesce(he.fecha_evento, he.registrado_en),
      he.alumno_id,
      he.matricula,
      nullif(concat_ws(' ', he.nombre, he.apellido_paterno,
        nullif(he.apellido_materno, '')), ''),
      case
        when he.modificado_por is null and he.dato_historico then 'Registro histórico'
        when he.modificado_por is null then 'Sistema'
        else coalesce(u.email, 'Usuario no disponible')
      end::text,
      null::text,
      case
        when he.estado_nuevo = 'activo' then 'Se reactivó al alumno'
        when he.estado_nuevo = 'pausa' then 'Se registró una pausa temporal'
        else 'Se registró una baja definitiva'
      end::text,
      jsonb_build_object(
        'estado_anterior', he.estado_anterior,
        'estado_nuevo', he.estado_nuevo,
        'ciclo_escolar', he.ciclo_escolar,
        'dato_historico', he.dato_historico,
        'nivel', he.nivel,
        'grado', he.grado,
        'grupo', he.grupo
      )
    from public.historial_estados_alumnos he
    left join auth.users u on u.id = he.modificado_por
  ), filtrados as materialized (
    select e.*
    from eventos e
    where (p_tipo_evento is null or e.tipo_evento = p_tipo_evento)
      and (p_desde is null
        or timezone('America/Mexico_City', e.fecha)::date >= p_desde)
      and (p_hasta is null
        or timezone('America/Mexico_City', e.fecha)::date <= p_hasta)
      and (
        nullif(trim(coalesce(p_busqueda, '')), '') is null
        or coalesce(e.matricula, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(e.alumno, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(e.responsable, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(e.motivo, '') ilike '%' || trim(p_busqueda) || '%'
        or e.resumen ilike '%' || trim(p_busqueda) || '%'
      )
  ), pagina as (
    select * from filtrados
    order by fecha desc, id desc
    limit p_limite offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'pagos', (select count(*) from filtrados where categoria = 'pagos'),
    'becas', (select count(*) from filtrados where categoria = 'becas'),
    'alumnos', (select count(*) from filtrados where categoria = 'alumnos'),
    'registros', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'tipo_evento', p.tipo_evento,
      'categoria', p.categoria,
      'fecha', p.fecha,
      'alumno_id', p.alumno_id,
      'matricula', p.matricula,
      'alumno', p.alumno,
      'responsable', p.responsable,
      'motivo', p.motivo,
      'resumen', p.resumen,
      'detalle', p.detalle
    ) order by p.fecha desc, p.id desc) from pagina p), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.consultar_auditoria_administrativa(
  text, date, date, text, integer, integer
) from public;
grant execute on function public.consultar_auditoria_administrativa(
  text, date, date, text, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
