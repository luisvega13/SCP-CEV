-- Contactos familiares del alumno. El contacto 1 es obligatorio al capturar
-- esta sección y el contacto 2 es opcional.
do $$
begin
  create type public.relacion_tutor as enum ('madre', 'padre', 'tutor');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.tutores_alumnos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete cascade,
  posicion smallint not null,
  relacion public.relacion_tutor not null,
  nombre text not null,
  telefono text not null,
  correo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tutores_alumnos_posicion_check check (posicion in (1, 2)),
  constraint tutores_alumnos_nombre_check check (char_length(trim(nombre)) between 3 and 150),
  constraint tutores_alumnos_telefono_check check (
    char_length(regexp_replace(telefono, '[^0-9]', '', 'g')) between 10 and 15
  ),
  constraint tutores_alumnos_correo_check check (
    correo is null or correo ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  constraint tutores_alumnos_alumno_posicion_key unique (alumno_id, posicion)
);

create index if not exists tutores_alumnos_alumno_idx
  on public.tutores_alumnos (alumno_id, posicion);

create or replace function public.actualizar_fecha_tutor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists actualizar_fecha_tutor on public.tutores_alumnos;
create trigger actualizar_fecha_tutor
  before update on public.tutores_alumnos
  for each row execute function public.actualizar_fecha_tutor();

alter table public.tutores_alumnos enable row level security;
alter table public.tutores_alumnos force row level security;

revoke all on table public.tutores_alumnos from anon;
revoke insert, update, delete on table public.tutores_alumnos from authenticated;
grant select on table public.tutores_alumnos to authenticated;

drop policy if exists "Administradores y alumno consultan tutores"
  on public.tutores_alumnos;
create policy "Administradores y alumno consultan tutores"
  on public.tutores_alumnos
  for select
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1
      from public.alumnos
      where alumnos.id = tutores_alumnos.alumno_id
        and alumnos.usuario_id = (select auth.uid())
    )
  );

create or replace function public.guardar_tutores_alumno(
  p_alumno_id uuid,
  p_tutores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cantidad integer;
  v_item jsonb;
  v_posicion smallint;
  v_nombre text;
  v_telefono text;
  v_correo text;
  v_relacion public.relacion_tutor;
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede guardar los tutores del alumno'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.alumnos where id = p_alumno_id) then
    raise exception 'El alumno no existe' using errcode = 'P0002';
  end if;

  if p_tutores is null or jsonb_typeof(p_tutores) <> 'array' then
    raise exception 'La información de tutores debe enviarse como una lista';
  end if;

  v_cantidad := jsonb_array_length(p_tutores);
  if v_cantidad < 1 or v_cantidad > 2 then
    raise exception 'Debes registrar un tutor obligatorio y como máximo dos contactos';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_tutores) as elemento(valor)
    where elemento.valor ->> 'posicion' = '1'
  ) then
    raise exception 'El contacto principal es obligatorio';
  end if;

  -- Valida todos los datos antes de reemplazar los contactos existentes.
  for v_item in select value from jsonb_array_elements(p_tutores)
  loop
    begin
      v_posicion := (v_item ->> 'posicion')::smallint;
      v_relacion := (v_item ->> 'relacion')::public.relacion_tutor;
    exception
      when others then
        raise exception 'La posición o relación del tutor no es válida';
    end;

    v_nombre := trim(coalesce(v_item ->> 'nombre', ''));
    v_telefono := trim(coalesce(v_item ->> 'telefono', ''));
    v_correo := nullif(lower(trim(coalesce(v_item ->> 'correo', ''))), '');

    if v_posicion not in (1, 2) then
      raise exception 'La posición del tutor debe ser 1 o 2';
    end if;
    if char_length(v_nombre) < 3 then
      raise exception 'El nombre del tutor es obligatorio';
    end if;
    if char_length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) not between 10 and 15 then
      raise exception 'El teléfono debe contener entre 10 y 15 dígitos';
    end if;
    if v_correo is not null and v_correo !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'El correo del tutor no tiene un formato válido';
    end if;
  end loop;

  if (
    select count(distinct (elemento.valor ->> 'posicion'))
    from jsonb_array_elements(p_tutores) as elemento(valor)
  ) <> v_cantidad then
    raise exception 'Los contactos no pueden utilizar la misma posición';
  end if;

  delete from public.tutores_alumnos where alumno_id = p_alumno_id;

  for v_item in select value from jsonb_array_elements(p_tutores)
  loop
    insert into public.tutores_alumnos (
      alumno_id, posicion, relacion, nombre, telefono, correo
    ) values (
      p_alumno_id,
      (v_item ->> 'posicion')::smallint,
      (v_item ->> 'relacion')::public.relacion_tutor,
      trim(v_item ->> 'nombre'),
      trim(v_item ->> 'telefono'),
      nullif(lower(trim(coalesce(v_item ->> 'correo', ''))), '')
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.posicion), '[]'::jsonb)
  into v_resultado
  from public.tutores_alumnos as t
  where t.alumno_id = p_alumno_id;

  return v_resultado;
end;
$$;

revoke all on function public.guardar_tutores_alumno(uuid, jsonb) from public;
grant execute on function public.guardar_tutores_alumno(uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
