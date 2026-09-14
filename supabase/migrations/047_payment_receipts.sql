-- Folio único, persistente e inmutable para comprobantes de pago.

create sequence if not exists public.folios_pago_seq;

create or replace function public.generar_folio_pago()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select concat(
    'CEV-',
    to_char(timezone('America/Mexico_City', now()), 'YYYYMMDD'),
    '-',
    lpad(nextval('public.folios_pago_seq'::regclass)::text, 8, '0')
  );
$$;

alter table public.pagos
  add column if not exists folio_comprobante text;

update public.pagos
set folio_comprobante = public.generar_folio_pago()
where folio_comprobante is null;

alter table public.pagos
  alter column folio_comprobante set default public.generar_folio_pago(),
  alter column folio_comprobante set not null;

create unique index if not exists pagos_folio_comprobante_uidx
  on public.pagos (folio_comprobante);

comment on column public.pagos.folio_comprobante is
  'Folio único e inmutable utilizado para emitir y reimprimir el comprobante del pago.';

alter table public.auditoria_pagos_eliminados
  add column if not exists folio_comprobante text;

create or replace function public.completar_factura_pago_eliminado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_facturado boolean;
  v_folio text;
begin
  select facturado, folio_comprobante
  into v_facturado, v_folio
  from public.pagos
  where id = new.pago_id;

  if found then
    new.facturado := v_facturado;
    new.folio_comprobante := v_folio;
  end if;
  return new;
end;
$$;

create or replace function public.impedir_cambio_folio_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folio_comprobante is distinct from old.folio_comprobante then
    raise exception 'El folio del comprobante no puede modificarse'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists impedir_cambio_folio_pago on public.pagos;
create trigger impedir_cambio_folio_pago
  before update of folio_comprobante on public.pagos
  for each row execute function public.impedir_cambio_folio_pago();

revoke all on function public.generar_folio_pago() from public;
grant execute on function public.generar_folio_pago() to authenticated;
revoke all on function public.impedir_cambio_folio_pago() from public;

notify pgrst, 'reload schema';
