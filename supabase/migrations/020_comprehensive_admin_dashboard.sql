-- Resumen administrativo completo en una sola llamada.
-- Todos los importes se calculan en el servidor y la función solo puede ser
-- ejecutada por administradores autenticados.
create or replace function public.obtener_resumen_administrativo(
  p_ciclo_escolar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('America/Mexico_City', now())::date;
  v_month_start timestamptz := (
    date_trunc('month', timezone('America/Mexico_City', now()))
    at time zone 'America/Mexico_City'
  );
  v_next_month_start timestamptz := v_month_start + interval '1 month';
  v_previous_month_start timestamptz := v_month_start - interval '1 month';
  v_result jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar este resumen'
      using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^\d{4}-\d{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer
      <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es valido'
      using errcode = '22023';
  end if;

  with
  student_summary as (
    select
      count(*)::integer as total,
      count(*) filter (where estado = 'activo')::integer as activos,
      count(*) filter (where estado = 'pausa')::integer as pausa,
      count(*) filter (where estado = 'baja')::integer as baja
    from public.alumnos
  ),
  current_month_payments as (
    select
      coalesce(sum(monto), 0)::numeric as total,
      count(*)::integer as movimientos,
      coalesce(avg(monto), 0)::numeric as ticket_promedio,
      coalesce(sum(monto) filter (
        where timezone('America/Mexico_City', fecha_pago)::date = v_today
      ), 0)::numeric as total_hoy,
      count(*) filter (
        where timezone('America/Mexico_City', fecha_pago)::date = v_today
      )::integer as movimientos_hoy
    from public.pagos
    where fecha_pago >= v_month_start
      and fecha_pago < v_next_month_start
  ),
  previous_month_payments as (
    select coalesce(sum(monto), 0)::numeric as total
    from public.pagos
    where fecha_pago >= v_previous_month_start
      and fecha_pago < v_month_start
  ),
  cycle_payments as (
    select coalesce(sum(monto), 0)::numeric as total
    from public.pagos
    where ciclo_escolar = p_ciclo_escolar
  ),
  account_summary as (
    select
      coalesce(sum(greatest(c.monto_esperado - c.monto_pagado, 0)) filter (
        where c.fecha_limite < v_today
      ), 0)::numeric as saldo_vencido,
      count(*) filter (
        where c.fecha_limite < v_today
          and c.monto_pagado < c.monto_esperado
      )::integer as cargos_vencidos,
      count(distinct c.alumno_id) filter (
        where c.fecha_limite < v_today
          and c.monto_pagado < c.monto_esperado
      )::integer as alumnos_con_adeudo,
      coalesce(sum(greatest(c.monto_esperado - c.monto_pagado, 0)) filter (
        where a.estado <> 'baja'
      ), 0)::numeric as cartera_total,
      coalesce(sum(greatest(c.monto_esperado - c.monto_pagado, 0)) filter (
        where a.estado <> 'baja'
          and c.fecha_limite >= v_today
          and c.fecha_limite < v_today + 30
      ), 0)::numeric as proximos_30_dias,
      coalesce(sum(c.monto_esperado) filter (
        where a.estado <> 'baja' and c.fecha_limite <= v_today
      ), 0)::numeric as devengado,
      coalesce(sum(least(c.monto_pagado, c.monto_esperado)) filter (
        where a.estado <> 'baja' and c.fecha_limite <= v_today
      ), 0)::numeric as devengado_pagado
    from public.estado_cuenta c
    join public.alumnos a on a.id = c.alumno_id
  ),
  scholarship_summary as (
    select
      count(*)::integer as asignaciones,
      count(distinct alumno_id)::integer as alumnos,
      coalesce(avg(porcentaje_aplicado), 0)::numeric as porcentaje_promedio
    from public.alumnos_becas
    where ciclo_escolar = p_ciclo_escolar
  ),
  audit_summary as (
    select
      (select count(*)::integer
       from public.auditoria_pagos
       where fecha_modificacion >= v_month_start
         and fecha_modificacion < v_next_month_start) as modificaciones,
      (select count(*)::integer
       from public.auditoria_pagos_eliminados
       where fecha_eliminacion >= v_month_start
         and fecha_eliminacion < v_next_month_start) as eliminaciones
  )
  select jsonb_build_object(
    'cycle', p_ciclo_escolar,
    'generated_at', now(),
    'students', jsonb_build_object(
      'total', s.total,
      'active', s.activos,
      'paused', s.pausa,
      'withdrawn', s.baja
    ),
    'finance', jsonb_build_object(
      'collected_month', m.total,
      'payment_count_month', m.movimientos,
      'average_ticket_month', m.ticket_promedio,
      'collected_today', m.total_hoy,
      'payment_count_today', m.movimientos_hoy,
      'collected_previous_month', pm.total,
      'month_change_percent', case
        when pm.total = 0 and m.total = 0 then 0
        when pm.total = 0 then null
        else round(((m.total - pm.total) / pm.total) * 100, 1)
      end,
      'collected_cycle', cp.total,
      'overdue_balance', ac.saldo_vencido,
      'overdue_charges', ac.cargos_vencidos,
      'students_with_overdue', ac.alumnos_con_adeudo,
      'total_receivable', ac.cartera_total,
      'due_next_30_days', ac.proximos_30_dias,
      'collection_rate', case
        when ac.devengado = 0 then 100
        else round((ac.devengado_pagado / ac.devengado) * 100, 1)
      end
    ),
    'scholarships', jsonb_build_object(
      'assignments', bs.asignaciones,
      'students', bs.alumnos,
      'average_percentage', round(bs.porcentaje_promedio, 1)
    ),
    'audit', jsonb_build_object(
      'edits_this_month', au.modificaciones,
      'deletions_this_month', au.eliminaciones
    ),
    'students_by_level', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'level', levels.nivel,
        'total', coalesce(data.total, 0),
        'active', coalesce(data.activos, 0),
        'collected_cycle', coalesce(data.recaudado, 0),
        'outstanding', coalesce(data.pendiente, 0)
      ) order by levels.orden), '[]'::jsonb)
      from (values
        (1, 'primaria'::public.nivel_escolar),
        (2, 'secundaria'::public.nivel_escolar),
        (3, 'bachillerato'::public.nivel_escolar)
      ) as levels(orden, nivel)
      left join lateral (
        select
          count(distinct a.id)::integer as total,
          count(distinct a.id) filter (where a.estado = 'activo')::integer as activos,
          coalesce((select sum(p.monto) from public.pagos p
            where p.nivel_cobro = levels.nivel
              and p.ciclo_escolar = p_ciclo_escolar), 0)::numeric as recaudado,
          coalesce((select sum(greatest(ec.monto_esperado - ec.monto_pagado, 0))
            from public.estado_cuenta ec
            join public.alumnos debtor on debtor.id = ec.alumno_id
            where debtor.nivel = levels.nivel
              and debtor.estado <> 'baja'), 0)::numeric as pendiente
        from public.alumnos a
        where a.nivel = levels.nivel
      ) data on true
    ),
    'payments_by_type', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', types.tipo,
        'amount', coalesce(data.total, 0),
        'count', coalesce(data.movimientos, 0)
      ) order by types.orden), '[]'::jsonb)
      from (values
        (1, 'inscripcion'::public.tipo_pago),
        (2, 'mensualidad'::public.tipo_pago)
      ) as types(orden, tipo)
      left join lateral (
        select coalesce(sum(p.monto), 0)::numeric as total,
          count(*)::integer as movimientos
        from public.pagos p
        where p.tipo_pago = types.tipo
          and p.fecha_pago >= v_month_start
          and p.fecha_pago < v_next_month_start
      ) data on true
    ),
    'payments_by_method', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'method', methods.metodo,
        'amount', coalesce(data.total, 0),
        'count', coalesce(data.movimientos, 0)
      ) order by methods.orden), '[]'::jsonb)
      from (values
        (1, 'efectivo'::public.metodo_pago),
        (2, 'tarjeta'::public.metodo_pago),
        (3, 'transferencia'::public.metodo_pago),
        (4, 'deposito'::public.metodo_pago)
      ) as methods(orden, metodo)
      left join lateral (
        select coalesce(sum(p.monto), 0)::numeric as total,
          count(*)::integer as movimientos
        from public.pagos p
        where p.metodo_pago = methods.metodo
          and p.fecha_pago >= v_month_start
          and p.fecha_pago < v_next_month_start
      ) data on true
    ),
    'account_status', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'status', status_data.estatus,
        'count', status_data.cantidad,
        'balance', status_data.saldo
      ) order by status_data.orden), '[]'::jsonb)
      from (
        select
          case
            when ec.monto_pagado >= ec.monto_esperado then 'pagado'
            when ec.monto_pagado > 0 then 'parcial'
            when ec.fecha_limite < v_today then 'vencido'
            else 'pendiente'
          end as estatus,
          case
            when ec.monto_pagado >= ec.monto_esperado then 1
            when ec.monto_pagado > 0 then 2
            when ec.fecha_limite < v_today then 3
            else 4
          end as orden,
          count(*)::integer as cantidad,
          coalesce(sum(greatest(ec.monto_esperado - ec.monto_pagado, 0)), 0)::numeric as saldo
        from public.estado_cuenta ec
        where public.ciclo_de_pago(ec.mes, ec.anio) = p_ciclo_escolar
        group by 1, 2
      ) status_data
    ),
    'monthly_trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(months.month_start, 'YYYY-MM'),
        'amount', coalesce(data.total, 0),
        'count', coalesce(data.movimientos, 0)
      ) order by months.month_start), '[]'::jsonb)
      from generate_series(
        date_trunc('month', v_today::timestamp) - interval '5 months',
        date_trunc('month', v_today::timestamp),
        interval '1 month'
      ) as months(month_start)
      left join lateral (
        select coalesce(sum(p.monto), 0)::numeric as total,
          count(*)::integer as movimientos
        from public.pagos p
        where timezone('America/Mexico_City', p.fecha_pago) >= months.month_start
          and timezone('America/Mexico_City', p.fecha_pago) < months.month_start + interval '1 month'
      ) data on true
    ),
    'recent_payments', (
      select coalesce(jsonb_agg(to_jsonb(recent) order by recent.fecha_pago desc), '[]'::jsonb)
      from (
        select
          p.id,
          concat_ws(' ', a.nombre, a.apellido_paterno, a.apellido_materno) as student_name,
          a.matricula,
          p.monto,
          p.tipo_pago,
          p.metodo_pago,
          p.fecha_pago
        from public.pagos p
        join public.alumnos a on a.id = p.alumno_id
        order by p.fecha_pago desc
        limit 5
      ) recent
    )
  ) into v_result
  from student_summary s
  cross join current_month_payments m
  cross join previous_month_payments pm
  cross join cycle_payments cp
  cross join account_summary ac
  cross join scholarship_summary bs
  cross join audit_summary au;

  return v_result;
end;
$$;

revoke all on function public.obtener_resumen_administrativo(text) from public;
grant execute on function public.obtener_resumen_administrativo(text)
  to authenticated;
