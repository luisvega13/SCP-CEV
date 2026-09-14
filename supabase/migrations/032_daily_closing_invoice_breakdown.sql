-- Clasificación fiscal de pagos y corte diario con desglose facturado/no facturado.

alter table public.pagos
  add column if not exists facturado boolean not null default false;

comment on column public.pagos.facturado is
  'Indica si el movimiento ya fue facturado en el portal externo.';

create or replace function public.obtener_corte_diario(p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede generar cortes diarios'
      using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > timezone('America/Mexico_City', now())::date then
    raise exception 'Selecciona una fecha válida que no sea futura';
  end if;

  with pagos_dia as (
    select
      p.id,
      p.fecha_pago,
      p.monto,
      p.tipo_pago,
      p.metodo_pago,
      p.facturado,
      p.mes,
      p.anio,
      a.matricula,
      concat_ws(' ', a.nombre, a.apellido_paterno, nullif(a.apellido_materno, '')) as alumno
    from public.pagos p
    join public.alumnos a on a.id = p.alumno_id
    where timezone('America/Mexico_City', p.fecha_pago)::date = p_fecha
  ), metodos as (
    select * from (values
      (1, 'efectivo'::public.metodo_pago),
      (2, 'tarjeta'::public.metodo_pago),
      (3, 'transferencia'::public.metodo_pago),
      (4, 'deposito'::public.metodo_pago)
    ) as m(orden, metodo)
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'generado_en', now(),
    'total_movimientos', (select count(*) from pagos_dia),
    'movimientos_sin_factura', (select count(*) from pagos_dia where not facturado),
    'movimientos_con_factura', (select count(*) from pagos_dia where facturado),
    'total_recaudado', coalesce((select sum(monto) from pagos_dia), 0),
    'recaudado_sin_factura', coalesce((select sum(monto) from pagos_dia where not facturado), 0),
    'recaudado_con_factura', coalesce((select sum(monto) from pagos_dia where facturado), 0),
    'por_metodo', (
      select jsonb_agg(jsonb_build_object(
        'metodo', m.metodo,
        'movimientos', (select count(*) from pagos_dia p where p.metodo_pago = m.metodo),
        'movimientos_sin_factura', (select count(*) from pagos_dia p where p.metodo_pago = m.metodo and not p.facturado),
        'movimientos_con_factura', (select count(*) from pagos_dia p where p.metodo_pago = m.metodo and p.facturado),
        'total', coalesce((select sum(p.monto) from pagos_dia p where p.metodo_pago = m.metodo), 0),
        'recaudado_sin_factura', coalesce((select sum(p.monto) from pagos_dia p where p.metodo_pago = m.metodo and not p.facturado), 0),
        'recaudado_con_factura', coalesce((select sum(p.monto) from pagos_dia p where p.metodo_pago = m.metodo and p.facturado), 0)
      ) order by m.orden)
      from metodos m
    ),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'fecha_pago', p.fecha_pago,
        'hora_local', to_char(timezone('America/Mexico_City', p.fecha_pago), 'HH24:MI:SS'),
        'alumno', p.alumno,
        'curp', p.matricula,
        'tipo_pago', p.tipo_pago,
        'periodo', initcap(p.mes::text) || ' ' || p.anio,
        'metodo_pago', p.metodo_pago,
        'facturado', p.facturado,
        'monto', p.monto
      ) order by p.fecha_pago, p.id)
      from pagos_dia p
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.obtener_corte_diario(date) from public;
grant execute on function public.obtener_corte_diario(date) to authenticated;

notify pgrst, 'reload schema';
