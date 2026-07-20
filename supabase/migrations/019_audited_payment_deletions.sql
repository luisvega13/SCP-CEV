create table if not exists public.auditoria_pagos_eliminados (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null,
  alumno_id uuid not null references public.alumnos(id) on delete restrict,
  monto numeric(12, 2) not null check (monto > 0),
  tipo_pago public.tipo_pago not null,
  metodo_pago public.metodo_pago not null,
  mes public.mes_pago not null,
  anio smallint not null,
  fecha_pago_original timestamptz not null,
  motivo text not null check (char_length(trim(motivo)) >= 5),
  eliminado_por uuid not null references auth.users(id) on delete restrict,
  fecha_eliminacion timestamptz not null default now()
);

create index if not exists auditoria_pagos_eliminados_alumno_fecha_idx
  on public.auditoria_pagos_eliminados (alumno_id, fecha_eliminacion desc);

alter table public.auditoria_pagos_eliminados enable row level security;
alter table public.auditoria_pagos_eliminados force row level security;
revoke all on table public.auditoria_pagos_eliminados from anon;
revoke insert, update, delete on table public.auditoria_pagos_eliminados
  from authenticated;
grant select on table public.auditoria_pagos_eliminados to authenticated;

drop policy if exists "Administradores consultan pagos eliminados"
  on public.auditoria_pagos_eliminados;
create policy "Administradores consultan pagos eliminados"
  on public.auditoria_pagos_eliminados
  for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.eliminar_pago_auditado(
  p_pago_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos;
  v_cuenta public.estado_cuenta;
  v_total_restante numeric(12, 2);
  v_ciclo text;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede eliminar pagos'
      using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'La sesion no es valida' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe contener al menos 5 caracteres'
      using errcode = '23514';
  end if;

  select * into v_pago
  from public.pagos
  where id = p_pago_id
  for update;
  if not found then raise exception 'El pago no existe' using errcode = 'P0002'; end if;

  v_ciclo := public.ciclo_de_pago(v_pago.mes, v_pago.anio);
  select * into v_cuenta
  from public.estado_cuenta
  where alumno_id = v_pago.alumno_id
    and tipo_pago = v_pago.tipo_pago
    and mes = v_pago.mes
    and anio = v_pago.anio
  for update;

  select coalesce(sum(monto), 0) into v_total_restante
  from public.pagos
  where alumno_id = v_pago.alumno_id
    and tipo_pago = v_pago.tipo_pago
    and mes = v_pago.mes
    and anio = v_pago.anio
    and id <> v_pago.id;

  if v_cuenta.id is not null and v_total_restante < v_cuenta.monto_esperado then
    if v_pago.tipo_pago = 'inscripcion' and exists (
      select 1 from public.pagos
      where alumno_id = v_pago.alumno_id
        and tipo_pago = 'mensualidad'
        and public.ciclo_de_pago(mes, anio) = v_ciclo
    ) then
      raise exception 'No se puede eliminar este pago de inscripcion porque ya existen mensualidades registradas en el ciclo'
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
        and public.ciclo_de_pago(pago_posterior.mes, pago_posterior.anio) = v_ciclo
    ) then
      raise exception 'No se puede eliminar esta mensualidad porque existen pagos de meses posteriores'
        using errcode = '23514';
    end if;
  end if;

  -- Una promocion no se revierte automaticamente porque afectaria grado y nivel.
  if v_pago.tipo_pago = 'inscripcion'
    and (v_cuenta.id is null or v_total_restante < v_cuenta.monto_esperado)
    and exists (
      select 1 from public.promociones_academicas
      where alumno_id = v_pago.alumno_id and ciclo_escolar = v_ciclo
    ) then
    raise exception 'No se puede eliminar el ultimo pago de inscripcion porque genero una promocion academica'
      using errcode = '23514';
  end if;

  insert into public.auditoria_pagos_eliminados (
    pago_id, alumno_id, monto, tipo_pago, metodo_pago, mes, anio,
    fecha_pago_original, motivo, eliminado_por
  ) values (
    v_pago.id, v_pago.alumno_id, v_pago.monto, v_pago.tipo_pago,
    v_pago.metodo_pago, v_pago.mes, v_pago.anio, v_pago.fecha_pago,
    trim(p_motivo), auth.uid()
  );

  delete from public.pagos where id = v_pago.id;
  perform public.recalcular_deuda_alumno(v_pago.alumno_id, v_ciclo);
end;
$$;

revoke all on function public.eliminar_pago_auditado(uuid, text) from public;
grant execute on function public.eliminar_pago_auditado(uuid, text)
  to authenticated;
