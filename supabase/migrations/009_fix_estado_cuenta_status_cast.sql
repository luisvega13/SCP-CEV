create or replace function public.actualizar_estatus_estado_cuenta()
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
