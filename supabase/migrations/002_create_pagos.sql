create type public.tipo_pago as enum ('inscripcion', 'mensualidad');

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null
    references public.alumnos(id) on delete restrict,
  monto numeric(12, 2) not null check (monto > 0),
  tipo_pago public.tipo_pago not null,
  fecha_pago timestamptz not null default now()
);

create index pagos_alumno_fecha_idx
  on public.pagos (alumno_id, fecha_pago desc);

alter table public.pagos enable row level security;
alter table public.pagos force row level security;

revoke all on table public.pagos from anon;
grant select, insert on table public.pagos to authenticated;
grant update on table public.alumnos to authenticated;

create policy "Administradores registran pagos"
  on public.pagos
  for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Usuarios consultan pagos autorizados"
  on public.pagos
  for select
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from public.alumnos
      where alumnos.id = pagos.alumno_id
        and alumnos.usuario_id = (select auth.uid())
    )
  );

create policy "Administradores actualizan saldos"
  on public.alumnos
  for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create function public.descontar_saldo_al_registrar_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  saldo_actual numeric(12, 2);
begin
  if new.tipo_pago = 'mensualidad' then
    select deuda_mensualidad
      into saldo_actual
      from public.alumnos
      where id = new.alumno_id
      for update;
  else
    select deuda_inscripcion
      into saldo_actual
      from public.alumnos
      where id = new.alumno_id
      for update;
  end if;

  if not found then
    raise exception 'El alumno no existe';
  end if;

  if new.monto > saldo_actual then
    raise exception 'El pago (%) excede el saldo pendiente (%)',
      new.monto, saldo_actual;
  end if;

  if new.tipo_pago = 'mensualidad' then
    update public.alumnos
      set deuda_mensualidad = deuda_mensualidad - new.monto
      where id = new.alumno_id;
  else
    update public.alumnos
      set deuda_inscripcion = deuda_inscripcion - new.monto
      where id = new.alumno_id;
  end if;

  return new;
end;
$$;

create trigger descontar_saldo_despues_de_pago
  after insert on public.pagos
  for each row
  execute function public.descontar_saldo_al_registrar_pago();
