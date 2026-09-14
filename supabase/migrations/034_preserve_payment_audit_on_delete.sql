-- Permite eliminar pagos sin destruir su historial de modificaciones.
-- pago_id se conserva como identificador histórico, aunque el pago original ya no exista.

alter table public.auditoria_pagos
  drop constraint if exists auditoria_pagos_pago_id_fkey;

comment on column public.auditoria_pagos.pago_id is
  'Identificador histórico del pago. No usa FK para que la auditoría sobreviva a la eliminación.';

alter table public.auditoria_pagos_eliminados
  add column if not exists facturado boolean not null default false;

create or replace function public.completar_factura_pago_eliminado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_facturado boolean;
begin
  select facturado into v_facturado
  from public.pagos
  where id = new.pago_id;

  if found then
    new.facturado := v_facturado;
  end if;
  return new;
end;
$$;

drop trigger if exists completar_factura_pago_eliminado
  on public.auditoria_pagos_eliminados;
create trigger completar_factura_pago_eliminado
  before insert on public.auditoria_pagos_eliminados
  for each row execute function public.completar_factura_pago_eliminado();

notify pgrst, 'reload schema';
