-- Correos cortos y unicos para el acceso de alumnos.

alter table public.alumnos
  add column if not exists correo_acceso text;

update public.alumnos as alumno
set correo_acceso = lower(usuario.email)
from auth.users as usuario
where usuario.id = alumno.usuario_id
  and alumno.correo_acceso is null;

create unique index if not exists alumnos_correo_acceso_unique_idx
  on public.alumnos (lower(correo_acceso))
  where correo_acceso is not null;

create sequence if not exists public.correo_acceso_alumno_seq
  as bigint start with 1 increment by 1 no cycle;

revoke all on sequence public.correo_acceso_alumno_seq from public;

create or replace function public.generar_correo_acceso_alumno()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero bigint;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo un administrador puede generar accesos'
      using errcode = '42501';
  end if;

  v_numero := nextval('public.correo_acceso_alumno_seq');
  return 'a' || lpad(v_numero::text, 6, '0') || '@alumno.cev.mx';
end;
$$;

revoke all on function public.generar_correo_acceso_alumno() from public;
grant execute on function public.generar_correo_acceso_alumno()
  to authenticated, service_role;

comment on column public.alumnos.correo_acceso is
  'Correo corto utilizado exclusivamente para iniciar sesion en el portal.';

