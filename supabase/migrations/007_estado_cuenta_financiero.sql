do $$
begin
  create type public.estatus_cobro as enum (
    'pagado',
    'vencido',
    'parcial',
    'pendiente'
  );
exception
  when duplicate_object then null;
end
$$;

create table public.estado_cuenta (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null
    references public.alumnos(id) on delete restrict,
  concepto text not null check (char_length(trim(concepto)) > 0),
  tipo_pago public.tipo_pago not null,
  mes public.mes_pago not null,
  anio smallint not null check (anio between 2020 and 2100),
  monto_esperado numeric(12, 2) not null
    check (monto_esperado >= 0),
  monto_pagado numeric(12, 2) not null default 0
    check (monto_pagado >= 0),
  fecha_limite date not null,
  estatus public.estatus_cobro not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estado_cuenta_periodo_unique
    unique (alumno_id, tipo_pago, mes, anio),
  constraint estado_cuenta_inscripcion_mes_check
    check (tipo_pago <> 'inscripcion' or mes = 'agosto')
);

create index estado_cuenta_estatus_fecha_idx
  on public.estado_cuenta (estatus, fecha_limite);

create index estado_cuenta_alumno_fecha_idx
  on public.estado_cuenta (alumno_id, fecha_limite);

alter table public.estado_cuenta enable row level security;
alter table public.estado_cuenta force row level security;

revoke all on table public.estado_cuenta from anon;
grant select, insert, update on table public.estado_cuenta to authenticated;

create policy "Administradores consultan todos los estados de cuenta"
  on public.estado_cuenta
  for select
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from public.alumnos
      where alumnos.id = estado_cuenta.alumno_id
        and alumnos.usuario_id = (select auth.uid())
    )
  );

create policy "Administradores crean estados de cuenta"
  on public.estado_cuenta
  for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Administradores actualizan estados de cuenta"
  on public.estado_cuenta
  for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create function public.calcular_estatus_cobro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.estatus := case
    when new.monto_pagado >= new.monto_esperado then 'pagado'
    when new.monto_pagado > 0 then 'parcial'
    when new.fecha_limite < current_date then 'vencido'
    else 'pendiente'
  end;
  new.updated_at := now();
  return new;
end;
$$;

create trigger calcular_estatus_estado_cuenta
  before insert or update of monto_esperado, monto_pagado, fecha_limite
  on public.estado_cuenta
  for each row
  execute function public.calcular_estatus_cobro();

create function public.recalcular_pago_estado_cuenta(
  p_alumno_id uuid,
  p_tipo_pago public.tipo_pago,
  p_mes public.mes_pago,
  p_anio smallint
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.estado_cuenta
  set monto_pagado = least(
    monto_esperado,
    coalesce((
      select sum(p.monto)
      from public.pagos as p
      where p.alumno_id = p_alumno_id
        and p.tipo_pago = p_tipo_pago
        and p.mes = p_mes
        and p.anio = p_anio
    ), 0)
  )
  where alumno_id = p_alumno_id
    and tipo_pago = p_tipo_pago
    and mes = p_mes
    and anio = p_anio;
$$;

revoke all on function public.recalcular_pago_estado_cuenta(
  uuid,
  public.tipo_pago,
  public.mes_pago,
  smallint
) from public;

create function public.sincronizar_pago_con_estado_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_pago_estado_cuenta(
      old.alumno_id,
      old.tipo_pago,
      old.mes,
      old.anio
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalcular_pago_estado_cuenta(
      new.alumno_id,
      new.tipo_pago,
      new.mes,
      new.anio
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger sincronizar_pago_estado_cuenta
  after insert or update or delete on public.pagos
  for each row
  execute function public.sincronizar_pago_con_estado_cuenta();

create function public.actualizar_estatus_estado_cuenta()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actualizados integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and session_user not in ('postgres', 'service_role') then
    raise exception 'Solo un administrador puede actualizar los estatus'
      using errcode = '42501';
  end if;

  update public.estado_cuenta
  set estatus = (
    case
      when monto_pagado >= monto_esperado then 'pagado'
      when monto_pagado > 0 then 'parcial'
      when fecha_limite < current_date then 'vencido'
      else 'pendiente'
    end
  )::public.estatus_cobro,
  updated_at = now()
  where id is not null;

  get diagnostics v_actualizados = row_count;
  return v_actualizados;
end;
$$;

revoke all on function public.actualizar_estatus_estado_cuenta() from public;
grant execute on function public.actualizar_estatus_estado_cuenta()
  to authenticated;

create function public.generar_estado_cuenta_ciclo(
  p_ciclo_escolar text,
  p_dia_limite integer default 10
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio smallint;
  v_fin smallint;
  v_afectados integer := 0;
  v_filas integer;
  v_alumno record;
  v_periodo record;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and session_user not in ('postgres', 'service_role') then
    raise exception 'Solo un administrador puede generar estados de cuenta'
      using errcode = '42501';
  end if;

  if p_ciclo_escolar !~ '^\d{4}-\d{4}$' then
    raise exception 'El ciclo escolar debe tener el formato AAAA-AAAA';
  end if;

  v_inicio := split_part(p_ciclo_escolar, '-', 1)::smallint;
  v_fin := split_part(p_ciclo_escolar, '-', 2)::smallint;
  if v_fin <> v_inicio + 1 then
    raise exception 'El ciclo escolar debe abarcar años consecutivos';
  end if;

  if p_dia_limite not between 1 and 28 then
    raise exception 'El día límite debe estar entre 1 y 28';
  end if;

  for v_alumno in
    select
      a.id,
      c.costo_inscripcion,
      c.costo_mensualidad
    from public.alumnos as a
    join public.configuracion_costos as c
      on c.nivel = a.nivel
     and c.ciclo_escolar = p_ciclo_escolar
    where a.estado = 'activo'
  loop
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
    values (
      v_alumno.id,
      'Inscripción ' || v_inicio,
      'inscripcion',
      'agosto',
      v_inicio,
      v_alumno.costo_inscripcion,
      coalesce((
        select sum(p.monto)
        from public.pagos as p
        where p.alumno_id = v_alumno.id
          and p.tipo_pago = 'inscripcion'
          and p.mes = 'agosto'
          and p.anio = v_inicio
      ), 0),
      make_date(v_inicio, 8, p_dia_limite)
    )
    on conflict (alumno_id, tipo_pago, mes, anio)
    do update set
      concepto = excluded.concepto,
      monto_esperado = excluded.monto_esperado,
      monto_pagado = excluded.monto_pagado,
      fecha_limite = excluded.fecha_limite;

    get diagnostics v_filas = row_count;
    v_afectados := v_afectados + v_filas;

    for v_periodo in
      select *
      from (values
        ('agosto'::public.mes_pago, 8, v_inicio),
        ('septiembre'::public.mes_pago, 9, v_inicio),
        ('octubre'::public.mes_pago, 10, v_inicio),
        ('noviembre'::public.mes_pago, 11, v_inicio),
        ('diciembre'::public.mes_pago, 12, v_inicio),
        ('enero'::public.mes_pago, 1, v_fin),
        ('febrero'::public.mes_pago, 2, v_fin),
        ('marzo'::public.mes_pago, 3, v_fin),
        ('abril'::public.mes_pago, 4, v_fin),
        ('mayo'::public.mes_pago, 5, v_fin),
        ('junio'::public.mes_pago, 6, v_fin),
        ('julio'::public.mes_pago, 7, v_fin)
      ) as periodos(mes, numero_mes, anio)
    loop
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
      values (
        v_alumno.id,
        'Colegiatura ' || initcap(v_periodo.mes::text),
        'mensualidad',
        v_periodo.mes,
        v_periodo.anio,
        v_alumno.costo_mensualidad,
        coalesce((
          select sum(p.monto)
          from public.pagos as p
          where p.alumno_id = v_alumno.id
            and p.tipo_pago = 'mensualidad'
            and p.mes = v_periodo.mes
            and p.anio = v_periodo.anio
        ), 0),
        make_date(v_periodo.anio, v_periodo.numero_mes, p_dia_limite)
      )
      on conflict (alumno_id, tipo_pago, mes, anio)
      do update set
        concepto = excluded.concepto,
        monto_esperado = excluded.monto_esperado,
        monto_pagado = excluded.monto_pagado,
        fecha_limite = excluded.fecha_limite;

      get diagnostics v_filas = row_count;
      v_afectados := v_afectados + v_filas;
    end loop;
  end loop;

  return v_afectados;
end;
$$;

revoke all on function public.generar_estado_cuenta_ciclo(text, integer)
  from public;
grant execute on function public.generar_estado_cuenta_ciclo(text, integer)
  to authenticated;

create function public.obtener_kpis_reportes_financieros()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_recaudado',
      coalesce((select sum(monto) from public.pagos), 0),
    'saldo_actual_vencido',
      coalesce((
        select sum(monto_esperado - monto_pagado)
        from public.estado_cuenta
        where estatus = 'vencido'
      ), 0),
    'proyeccion_ingresos',
      coalesce((
        select sum(monto_esperado - monto_pagado)
        from public.estado_cuenta
        where estatus <> 'pagado'
      ), 0),
    'alumnos_con_adeudo',
      coalesce((
        select count(distinct alumno_id)
        from public.estado_cuenta
        where estatus = 'vencido'
      ), 0)
  );
$$;

revoke all on function public.obtener_kpis_reportes_financieros()
  from public;
grant execute on function public.obtener_kpis_reportes_financieros()
  to authenticated;

-- Después de ejecutar la migración, genera el ciclo deseado una sola vez:
-- select public.generar_estado_cuenta_ciclo('2025-2026', 10);
