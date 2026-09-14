-- Alinea proyección, pago aplicado y adeudo al mismo periodo del cargo.

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

  with meses(orden, mes, etiqueta, anio) as (
    values
      (1, 'agosto'::public.mes_pago, 'Agosto', v_inicio),
      (2, 'septiembre'::public.mes_pago, 'Septiembre', v_inicio),
      (3, 'octubre'::public.mes_pago, 'Octubre', v_inicio),
      (4, 'noviembre'::public.mes_pago, 'Noviembre', v_inicio),
      (5, 'diciembre'::public.mes_pago, 'Diciembre', v_inicio),
      (6, 'enero'::public.mes_pago, 'Enero', v_inicio + 1),
      (7, 'febrero'::public.mes_pago, 'Febrero', v_inicio + 1),
      (8, 'marzo'::public.mes_pago, 'Marzo', v_inicio + 1),
      (9, 'abril'::public.mes_pago, 'Abril', v_inicio + 1),
      (10, 'mayo'::public.mes_pago, 'Mayo', v_inicio + 1),
      (11, 'junio'::public.mes_pago, 'Junio', v_inicio + 1),
      (12, 'julio'::public.mes_pago, 'Julio', v_inicio + 1)
  ), resumen as (
    select
      m.orden,
      m.mes,
      m.etiqueta,
      m.anio,
      coalesce(sum(ec.monto_esperado), 0)::numeric(14, 2) as proyectado,
      coalesce(sum(least(ec.monto_pagado, ec.monto_esperado)), 0)
        ::numeric(14, 2) as pagado,
      coalesce(sum(greatest(ec.monto_esperado - ec.monto_pagado, 0)), 0)
        ::numeric(14, 2) as adeudo
    from meses m
    left join public.estado_cuenta ec
      on ec.mes = m.mes
      and ec.anio = m.anio
    group by m.orden, m.mes, m.etiqueta, m.anio
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
grant execute on function public.obtener_resumen_financiero_mensual(text)
  to authenticated;

notify pgrst, 'reload schema';
