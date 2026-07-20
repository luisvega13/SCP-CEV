-- Edicion auditada de pagos. La contrasena se valida en Supabase Auth desde
-- el servidor de Next.js y nunca se almacena ni se envia a esta funcion.
create table if not exists public.auditoria_pagos (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete restrict,
  monto_anterior numeric(12, 2) not null check (monto_anterior > 0),
  monto_nuevo numeric(12, 2) not null check (monto_nuevo > 0),
  motivo text not null check (char_length(trim(motivo)) >= 5),
  modificado_por uuid not null references auth.users(id) on delete restrict,
  fecha_modificacion timestamptz not null default now()
);

create index if not exists auditoria_pagos_pago_fecha_idx
  on public.auditoria_pagos (pago_id, fecha_modificacion desc);

alter table public.auditoria_pagos enable row level security;
alter table public.auditoria_pagos force row level security;

revoke all on table public.auditoria_pagos from anon;
revoke insert, update, delete on table public.auditoria_pagos from authenticated;
grant select on table public.auditoria_pagos to authenticated;

drop policy if exists "Administradores consultan auditoria de pagos"
  on public.auditoria_pagos;
create policy "Administradores consultan auditoria de pagos"
  on public.auditoria_pagos
  for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.modificar_pago_auditado(
  p_pago_id uuid,
  p_nuevo_monto numeric,
  p_motivo text
)
returns public.pagos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos;
  v_pago_actualizado public.pagos;
  v_cuenta public.estado_cuenta;
  v_total_con_cambio numeric(12, 2);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede modificar pagos'
      using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'La sesion no es valida' using errcode = '42501';
  end if;

  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero'
      using errcode = '23514';
  end if;

  if char_length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe contener al menos 5 caracteres'
      using errcode = '23514';
  end if;

  select * into v_pago
  from public.pagos
  where id = p_pago_id
  for update;

  if not found then
    raise exception 'El pago no existe' using errcode = 'P0002';
  end if;

  if v_pago.monto = round(p_nuevo_monto, 2) then
    raise exception 'El monto nuevo debe ser diferente al monto registrado'
      using errcode = '23514';
  end if;

  select * into v_cuenta
  from public.estado_cuenta
  where alumno_id = v_pago.alumno_id
    and tipo_pago = v_pago.tipo_pago
    and mes = v_pago.mes
    and anio = v_pago.anio
  for update;

  select coalesce(sum(monto), 0) + round(p_nuevo_monto, 2)
  into v_total_con_cambio
  from public.pagos
  where alumno_id = v_pago.alumno_id
    and tipo_pago = v_pago.tipo_pago
    and mes = v_pago.mes
    and anio = v_pago.anio
    and id <> v_pago.id;

  if v_cuenta.id is not null
    and p_nuevo_monto > v_pago.monto
    and v_total_con_cambio > v_cuenta.monto_esperado then
    raise exception 'El nuevo monto excede el costo del concepto'
      using errcode = '23514';
  end if;

  -- No permite que una correccion rompa la secuencia financiera existente.
  if v_cuenta.id is not null and v_total_con_cambio < v_cuenta.monto_esperado then
    if v_pago.tipo_pago = 'inscripcion' and exists (
      select 1
      from public.pagos as pago_posterior
      where pago_posterior.alumno_id = v_pago.alumno_id
        and pago_posterior.tipo_pago = 'mensualidad'
        and public.ciclo_de_pago(pago_posterior.mes, pago_posterior.anio) =
          public.ciclo_de_pago(v_pago.mes, v_pago.anio)
    ) then
      raise exception 'No se puede dejar incompleta la inscripcion porque ya existen mensualidades posteriores'
        using errcode = '23514';
    end if;

    if v_pago.tipo_pago = 'mensualidad' and exists (
      select 1
      from public.pagos as pago_posterior
      join public.estado_cuenta as cuenta_posterior
        on cuenta_posterior.alumno_id = pago_posterior.alumno_id
       and cuenta_posterior.tipo_pago = pago_posterior.tipo_pago
       and cuenta_posterior.mes = pago_posterior.mes
       and cuenta_posterior.anio = pago_posterior.anio
      where pago_posterior.alumno_id = v_pago.alumno_id
        and pago_posterior.tipo_pago = 'mensualidad'
        and cuenta_posterior.fecha_limite > v_cuenta.fecha_limite
        and public.ciclo_de_pago(pago_posterior.mes, pago_posterior.anio) =
          public.ciclo_de_pago(v_pago.mes, v_pago.anio)
    ) then
      raise exception 'No se puede dejar incompleta esta mensualidad porque ya existen pagos de meses posteriores'
        using errcode = '23514';
    end if;
  end if;

  update public.pagos
  set monto = round(p_nuevo_monto, 2)
  where id = v_pago.id
  returning * into v_pago_actualizado;

  insert into public.auditoria_pagos (
    pago_id,
    monto_anterior,
    monto_nuevo,
    motivo,
    modificado_por
  ) values (
    v_pago.id,
    v_pago.monto,
    v_pago_actualizado.monto,
    trim(p_motivo),
    auth.uid()
  );

  perform public.recalcular_deuda_alumno(
    v_pago.alumno_id,
    public.ciclo_de_pago(v_pago.mes, v_pago.anio)
  );

  return v_pago_actualizado;
end;
$$;

revoke all on function public.modificar_pago_auditado(uuid, numeric, text)
  from public;
grant execute on function public.modificar_pago_auditado(uuid, numeric, text)
  to authenticated;

