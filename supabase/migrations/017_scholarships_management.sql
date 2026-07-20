create table if not exists public.becas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(trim(nombre)) between 3 and 100),
  porcentaje numeric(5, 2) not null check (porcentaje > 0 and porcentaje <= 100),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alumnos_becas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete restrict,
  beca_id uuid not null references public.becas(id) on delete restrict,
  ciclo_escolar text not null check (ciclo_escolar ~ '^\d{4}-\d{4}$'),
  observaciones text not null default '' check (char_length(observaciones) <= 500),
  fecha_asignacion timestamptz not null default now(),
  constraint alumnos_becas_ciclo_consecutivo_check check (
    split_part(ciclo_escolar, '-', 2)::integer =
      split_part(ciclo_escolar, '-', 1)::integer + 1
  ),
  unique (alumno_id, ciclo_escolar)
);

create index if not exists alumnos_becas_ciclo_fecha_idx
  on public.alumnos_becas (ciclo_escolar, fecha_asignacion desc);
create index if not exists alumnos_becas_beca_idx
  on public.alumnos_becas (beca_id);

create or replace function public.actualizar_updated_at_beca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists actualizar_updated_at_beca on public.becas;
create trigger actualizar_updated_at_beca
  before update on public.becas
  for each row
  execute function public.actualizar_updated_at_beca();

alter table public.becas enable row level security;
alter table public.becas force row level security;
alter table public.alumnos_becas enable row level security;
alter table public.alumnos_becas force row level security;

revoke all on table public.becas from anon;
revoke all on table public.alumnos_becas from anon;
grant select, insert, update, delete on table public.becas to authenticated;
grant select, insert, update, delete on table public.alumnos_becas to authenticated;

drop policy if exists "Administradores gestionan becas" on public.becas;
create policy "Administradores gestionan becas"
  on public.becas
  for all
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Administradores gestionan asignaciones de becas"
  on public.alumnos_becas;
create policy "Administradores gestionan asignaciones de becas"
  on public.alumnos_becas
  for all
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
