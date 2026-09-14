-- Claves de acceso de ocho caracteres: CE + generacion + consecutivo.
-- Ejemplo para el ciclo 2026-2027: CE260001.

create table if not exists public.contadores_acceso_alumnos (
  generacion smallint primary key,
  ultimo_numero integer not null default 0
    check (ultimo_numero between 0 and 9999)
);

revoke all on table public.contadores_acceso_alumnos from public;

create or replace function public.generar_correo_acceso_alumno()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_local date := timezone('America/Mexico_City', now())::date;
  v_inicio_ciclo integer;
  v_generacion smallint;
  v_numero integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo un administrador puede generar accesos'
      using errcode = '42501';
  end if;

  v_inicio_ciclo := extract(year from v_fecha_local)::integer
    - case when extract(month from v_fecha_local)::integer < 8 then 1 else 0 end;
  v_generacion := mod(v_inicio_ciclo, 100)::smallint;

  insert into public.contadores_acceso_alumnos as contador (
    generacion,
    ultimo_numero
  )
  values (v_generacion, 1)
  on conflict (generacion)
  do update set ultimo_numero = contador.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  if v_numero > 9999 then
    raise exception 'Se agotaron las claves disponibles para la generacion %', v_generacion;
  end if;

  return lower(
    'CE'
    || lpad(v_generacion::text, 2, '0')
    || lpad(v_numero::text, 4, '0')
    || '@alumno.cev.mx'
  );
end;
$$;

revoke all on function public.generar_correo_acceso_alumno() from public;
grant execute on function public.generar_correo_acceso_alumno()
  to authenticated, service_role;

comment on function public.generar_correo_acceso_alumno() is
  'Genera un correo interno con clave CE, generacion y consecutivo unico.';
