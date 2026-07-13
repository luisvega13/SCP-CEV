alter table public.alumnos
  add column matricula text;

alter table public.alumnos
  add constraint alumnos_matricula_formato_check
  check (
    matricula is null
    or matricula ~ '^[A-Z0-9]{4,30}$'
  );

create unique index alumnos_matricula_unique_idx
  on public.alumnos (matricula)
  where matricula is not null;

grant insert on table public.alumnos to authenticated;

create policy "Administradores registran alumnos"
  on public.alumnos
  for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

comment on column public.alumnos.matricula is
  'Identificador escolar único en mayúsculas. Es nullable solo para conservar registros históricos.';
