-- Estado de la contraseña predeterminada del alumno.
-- La contraseña no se almacena: se reconstruye con las iniciales y su clave de acceso.

alter table public.alumnos
  add column if not exists iniciales_clave_temporal text,
  add column if not exists contrasena_temporal_activa boolean not null default false,
  add column if not exists contrasena_actualizada_at timestamptz;

alter table public.alumnos
  drop constraint if exists alumnos_iniciales_clave_temporal_check;

alter table public.alumnos
  add constraint alumnos_iniciales_clave_temporal_check
  check (
    iniciales_clave_temporal is null
    or iniciales_clave_temporal ~ '^[A-Z]{2}$'
  );

comment on column public.alumnos.iniciales_clave_temporal is
  'Iniciales usadas para reconstruir la contraseña predeterminada sin almacenarla.';

comment on column public.alumnos.contrasena_temporal_activa is
  'Indica si el alumno aún utiliza la contraseña predeterminada o fue restablecida a ella.';

comment on column public.alumnos.contrasena_actualizada_at is
  'Fecha del último cambio o restablecimiento de contraseña.';
