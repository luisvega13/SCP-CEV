create type public.nivel_escolar as enum (
  'primaria',
  'secundaria',
  'bachillerato'
);

create type public.estado_alumno as enum ('activo', 'baja');
create type public.sexo_alumno as enum ('hombre', 'mujer');

create table public.alumnos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) >= 2),
  nivel public.nivel_escolar not null,
  grado smallint not null check (grado between 1 and 6),
  grupo text not null check (char_length(trim(grupo)) >= 1),
  estado public.estado_alumno not null default 'activo',
  deuda_mensualidad numeric(12, 2) not null default 0
    check (deuda_mensualidad >= 0),
  deuda_inscripcion numeric(12, 2) not null default 0
    check (deuda_inscripcion >= 0),
  sexo public.sexo_alumno not null,
  usuario_id uuid not null unique
    references auth.users(id) on delete restrict
);

create index alumnos_nivel_grado_grupo_idx
  on public.alumnos (nivel, grado, grupo);

alter table public.alumnos enable row level security;
alter table public.alumnos force row level security;

revoke all on table public.alumnos from anon;
grant select on table public.alumnos to authenticated;

-- El alumno lee su fila; el admin autenticado puede leer todas.
-- app_metadata.role debe asignarse únicamente desde un servidor confiable.
create policy "Alumnos leen su registro; administradores leen todos"
  on public.alumnos
  for select
  to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
