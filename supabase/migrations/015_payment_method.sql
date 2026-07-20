do $$
begin
  create type public.metodo_pago as enum (
    'efectivo',
    'tarjeta',
    'transferencia',
    'deposito'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.pagos
  add column if not exists metodo_pago public.metodo_pago
  not null default 'efectivo';

create index if not exists pagos_metodo_fecha_idx
  on public.pagos (metodo_pago, fecha_pago desc);

