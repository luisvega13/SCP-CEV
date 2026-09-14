-- Separa el estado vigente del historial auditable de cambios académicos.

-- Compatibilidad: permite ejecutar esta migración aunque la 049 no haya
-- alcanzado a crear la clasificación en alumnos_bajas.
alter table public.alumnos_bajas
  add column if not exists tipo_baja public.estado_alumno;

update public.alumnos_bajas
set tipo_baja = 'baja'
where tipo_baja is null;

alter table public.alumnos_bajas
  alter column tipo_baja set not null;

alter table public.alumnos_bajas
  drop constraint if exists alumnos_bajas_tipo_baja_check;
alter table public.alumnos_bajas
  add constraint alumnos_bajas_tipo_baja_check
  check (tipo_baja in ('baja', 'pausa'));

create table if not exists public.historial_estados_alumnos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete restrict,
  ciclo_escolar text not null check (
    ciclo_escolar ~ '^[0-9]{4}-[0-9]{4}$'
    and split_part(ciclo_escolar, '-', 2)::integer
      = split_part(ciclo_escolar, '-', 1)::integer + 1
  ),
  estado_anterior public.estado_alumno,
  estado_nuevo public.estado_alumno not null,
  fecha_evento timestamptz,
  registrado_en timestamptz not null default now(),
  modificado_por uuid references auth.users(id) on delete set null,
  dato_historico boolean not null default false,
  origen_baja_id uuid unique references public.alumnos_bajas(id) on delete set null,
  matricula text not null,
  nombre text not null,
  apellido_paterno text not null default '',
  apellido_materno text not null default '',
  nivel public.nivel_escolar not null,
  grado smallint not null check (grado between 1 and 6),
  grupo text not null,
  sexo public.sexo_alumno not null
);

create index if not exists historial_estados_alumno_fecha_idx
  on public.historial_estados_alumnos (alumno_id, registrado_en desc);
create index if not exists historial_estados_ciclo_trayectoria_idx
  on public.historial_estados_alumnos
  (ciclo_escolar, estado_nuevo, nivel, grado, grupo);

alter table public.historial_estados_alumnos enable row level security;
alter table public.historial_estados_alumnos force row level security;
revoke all on table public.historial_estados_alumnos from anon, authenticated;
grant select on table public.historial_estados_alumnos to authenticated;

drop policy if exists "Administradores consultan historial de estados"
  on public.historial_estados_alumnos;
create policy "Administradores consultan historial de estados"
  on public.historial_estados_alumnos
  for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Conserva los registros creados por las migraciones 048 y 049.
insert into public.historial_estados_alumnos (
  alumno_id, ciclo_escolar, estado_anterior, estado_nuevo,
  fecha_evento, registrado_en, modificado_por, dato_historico,
  origen_baja_id, matricula, nombre, apellido_paterno,
  apellido_materno, nivel, grado, grupo, sexo
)
select
  b.alumno_id,
  b.ciclo_escolar,
  null,
  b.tipo_baja,
  b.fecha_baja,
  b.registrado_en,
  b.dado_baja_por,
  b.fecha_baja is null,
  b.id,
  b.matricula,
  b.nombre,
  b.apellido_paterno,
  b.apellido_materno,
  b.nivel,
  b.grado,
  b.grupo,
  b.sexo
from public.alumnos_bajas b
on conflict (origen_baja_id) do update set
  estado_nuevo = excluded.estado_nuevo,
  fecha_evento = excluded.fecha_evento,
  modificado_por = excluded.modificado_por,
  matricula = excluded.matricula,
  nombre = excluded.nombre,
  apellido_paterno = excluded.apellido_paterno,
  apellido_materno = excluded.apellido_materno,
  nivel = excluded.nivel,
  grado = excluded.grado,
  grupo = excluded.grupo,
  sexo = excluded.sexo;

-- Corrige el último estado conocido sin inventar una fecha histórica.
insert into public.historial_estados_alumnos (
  alumno_id, ciclo_escolar, estado_anterior, estado_nuevo,
  fecha_evento, modificado_por, dato_historico,
  matricula, nombre, apellido_paterno, apellido_materno,
  nivel, grado, grupo, sexo
)
select
  a.id,
  coalesce(ultimo.ciclo_escolar, nullif(a.ciclo_grado_actual, ''),
    public.ciclo_escolar_actual()),
  ultimo.estado_nuevo,
  a.estado,
  null,
  null,
  true,
  a.matricula,
  a.nombre,
  a.apellido_paterno,
  a.apellido_materno,
  a.nivel,
  a.grado,
  a.grupo,
  a.sexo
from public.alumnos a
left join lateral (
  select h.estado_nuevo, h.ciclo_escolar
  from public.historial_estados_alumnos h
  where h.alumno_id = a.id
  order by h.registrado_en desc, h.id desc
  limit 1
) ultimo on true
where (
    ultimo.estado_nuevo is null
    and a.estado in ('baja', 'pausa')
  ) or (
    ultimo.estado_nuevo is not null
    and ultimo.estado_nuevo is distinct from a.estado
  );

drop trigger if exists registrar_historial_baja_alumno on public.alumnos;

create or replace function public.registrar_transicion_estado_alumno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.estado = 'activo' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
    return new;
  end if;

  insert into public.historial_estados_alumnos (
    alumno_id, ciclo_escolar, estado_anterior, estado_nuevo,
    fecha_evento, modificado_por, dato_historico,
    matricula, nombre, apellido_paterno, apellido_materno,
    nivel, grado, grupo, sexo
  ) values (
    new.id,
    public.ciclo_escolar_actual(),
    case when tg_op = 'UPDATE' then old.estado else null end,
    new.estado,
    now(),
    auth.uid(),
    false,
    new.matricula,
    new.nombre,
    new.apellido_paterno,
    new.apellido_materno,
    new.nivel,
    new.grado,
    new.grupo,
    new.sexo
  );

  return new;
end;
$$;

drop trigger if exists registrar_transicion_estado_alumno on public.alumnos;
create trigger registrar_transicion_estado_alumno
  after insert or update of estado on public.alumnos
  for each row execute function public.registrar_transicion_estado_alumno();

drop function if exists public.consultar_bajas_alumnos(
  text, public.nivel_escolar, smallint, text, text, integer, integer
);

create function public.consultar_bajas_alumnos(
  p_ciclo_escolar text,
  p_tipo_baja text default null,
  p_nivel public.nivel_escolar default null,
  p_grado smallint default null,
  p_grupo text default null,
  p_busqueda text default '',
  p_limite integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar las bajas'
      using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer
      <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es válido' using errcode = '22023';
  end if;
  if p_tipo_baja is not null and p_tipo_baja not in ('baja', 'pausa') then
    raise exception 'El tipo de baja no es válido' using errcode = '22023';
  end if;
  if p_grado is not null and (p_grado < 1 or p_grado > 6) then
    raise exception 'El grado no es válido' using errcode = '22023';
  end if;
  if p_limite < 1 or p_limite > 1000 or p_offset < 0 then
    raise exception 'La paginación no es válida' using errcode = '22023';
  end if;

  with ultimo_estado as materialized (
    select distinct on (h.alumno_id) h.*
    from public.historial_estados_alumnos h
    order by h.alumno_id, h.registrado_en desc, h.id desc
  ), filtradas as materialized (
    select h.*
    from ultimo_estado h
    join public.alumnos a on a.id = h.alumno_id
    where a.estado in ('baja', 'pausa')
      and h.estado_nuevo = a.estado
      and h.ciclo_escolar = p_ciclo_escolar
      and (p_tipo_baja is null or h.estado_nuevo::text = p_tipo_baja)
      and (p_nivel is null or h.nivel = p_nivel)
      and (p_grado is null or h.grado = p_grado)
      and (nullif(trim(coalesce(p_grupo, '')), '') is null
        or lower(h.grupo) = lower(trim(p_grupo)))
      and (
        nullif(trim(coalesce(p_busqueda, '')), '') is null
        or h.matricula ilike '%' || trim(p_busqueda) || '%'
        or concat_ws(' ', h.nombre, h.apellido_paterno, h.apellido_materno)
          ilike '%' || trim(p_busqueda) || '%'
      )
  ), pagina as (
    select * from filtradas
    order by fecha_evento desc nulls last, registrado_en desc,
      apellido_paterno, apellido_materno, nombre
    limit p_limite offset p_offset
  ), grados_disponibles as (
    select distinct h.grado
    from ultimo_estado h
    join public.alumnos a on a.id = h.alumno_id
    where a.estado in ('baja', 'pausa')
      and h.estado_nuevo = a.estado
      and h.ciclo_escolar = p_ciclo_escolar
      and (p_tipo_baja is null or h.estado_nuevo::text = p_tipo_baja)
      and (p_nivel is null or h.nivel = p_nivel)
  ), grupos_disponibles as (
    select distinct h.grupo
    from ultimo_estado h
    join public.alumnos a on a.id = h.alumno_id
    where a.estado in ('baja', 'pausa')
      and h.estado_nuevo = a.estado
      and h.ciclo_escolar = p_ciclo_escolar
      and (p_tipo_baja is null or h.estado_nuevo::text = p_tipo_baja)
      and (p_nivel is null or h.nivel = p_nivel)
      and (p_grado is null or h.grado = p_grado)
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'total', (select count(*) from filtradas),
    'hombres', (select count(*) from filtradas where sexo = 'hombre'),
    'mujeres', (select count(*) from filtradas where sexo = 'mujer'),
    'grados_disponibles', coalesce((select jsonb_agg(grado order by grado)
      from grados_disponibles), '[]'::jsonb),
    'grupos_disponibles', coalesce((select jsonb_agg(grupo order by grupo)
      from grupos_disponibles), '[]'::jsonb),
    'registros', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'alumno_id', p.alumno_id,
      'ciclo_escolar', p.ciclo_escolar,
      'fecha_baja', p.fecha_evento,
      'registrado_en', p.registrado_en,
      'matricula', p.matricula,
      'nombre', p.nombre,
      'apellido_paterno', p.apellido_paterno,
      'apellido_materno', p.apellido_materno,
      'nivel', p.nivel,
      'grado', p.grado,
      'grupo', p.grupo,
      'sexo', p.sexo,
      'tipo_baja', p.estado_nuevo
    ) order by p.fecha_evento desc nulls last, p.registrado_en desc,
      p.apellido_paterno, p.apellido_materno, p.nombre) from pagina p),
      '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

create or replace function public.consultar_historial_bajas_alumnos(
  p_ciclo_escolar text,
  p_tipo_baja text default null,
  p_nivel public.nivel_escolar default null,
  p_grado smallint default null,
  p_grupo text default null,
  p_busqueda text default '',
  p_limite integer default 1000,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar el historial'
      using errcode = '42501';
  end if;
  if p_ciclo_escolar !~ '^[0-9]{4}-[0-9]{4}$'
    or split_part(p_ciclo_escolar, '-', 2)::integer
      <> split_part(p_ciclo_escolar, '-', 1)::integer + 1 then
    raise exception 'El ciclo escolar no es válido' using errcode = '22023';
  end if;
  if p_tipo_baja is not null and p_tipo_baja not in ('baja', 'pausa') then
    raise exception 'El tipo de baja no es válido' using errcode = '22023';
  end if;
  if p_grado is not null and (p_grado < 1 or p_grado > 6) then
    raise exception 'El grado no es válido' using errcode = '22023';
  end if;
  if p_limite < 1 or p_limite > 1000 or p_offset < 0 then
    raise exception 'La paginación no es válida' using errcode = '22023';
  end if;

  with filtradas as materialized (
    select h.*
    from public.historial_estados_alumnos h
    where h.ciclo_escolar = p_ciclo_escolar
      and (
        h.estado_nuevo in ('baja', 'pausa')
        or (h.estado_nuevo = 'activo'
          and h.estado_anterior in ('baja', 'pausa'))
      )
      and (
        p_tipo_baja is null
        or h.estado_nuevo::text = p_tipo_baja
        or (h.estado_nuevo = 'activo' and h.estado_anterior::text = p_tipo_baja)
      )
      and (p_nivel is null or h.nivel = p_nivel)
      and (p_grado is null or h.grado = p_grado)
      and (nullif(trim(coalesce(p_grupo, '')), '') is null
        or lower(h.grupo) = lower(trim(p_grupo)))
      and (
        nullif(trim(coalesce(p_busqueda, '')), '') is null
        or h.matricula ilike '%' || trim(p_busqueda) || '%'
        or concat_ws(' ', h.nombre, h.apellido_paterno, h.apellido_materno)
          ilike '%' || trim(p_busqueda) || '%'
      )
  ), pagina as (
    select * from filtradas
    order by fecha_evento desc nulls last, registrado_en desc, id desc
    limit p_limite offset p_offset
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'total_eventos', (select count(*) from filtradas),
    'total_salidas', (select count(*) from filtradas
      where estado_nuevo in ('baja', 'pausa')),
    'alumnos_reactivados', (select count(distinct alumno_id) from filtradas
      where estado_nuevo = 'activo' and estado_anterior in ('baja', 'pausa')),
    'total_reactivaciones', (select count(*) from filtradas
      where estado_nuevo = 'activo' and estado_anterior in ('baja', 'pausa')),
    'registros', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'alumno_id', p.alumno_id,
      'ciclo_escolar', p.ciclo_escolar,
      'estado_anterior', p.estado_anterior,
      'estado_nuevo', p.estado_nuevo,
      'fecha_evento', p.fecha_evento,
      'registrado_en', p.registrado_en,
      'dato_historico', p.dato_historico,
      'matricula', p.matricula,
      'nombre', p.nombre,
      'apellido_paterno', p.apellido_paterno,
      'apellido_materno', p.apellido_materno,
      'nivel', p.nivel,
      'grado', p.grado,
      'grupo', p.grupo,
      'sexo', p.sexo
    ) order by p.fecha_evento desc nulls last, p.registrado_en desc, p.id desc)
      from pagina p), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.registrar_transicion_estado_alumno() from public;
revoke all on function public.consultar_bajas_alumnos(
  text, text, public.nivel_escolar, smallint, text, text, integer, integer
) from public;
revoke all on function public.consultar_historial_bajas_alumnos(
  text, text, public.nivel_escolar, smallint, text, text, integer, integer
) from public;
grant execute on function public.consultar_bajas_alumnos(
  text, text, public.nivel_escolar, smallint, text, text, integer, integer
) to authenticated;
grant execute on function public.consultar_historial_bajas_alumnos(
  text, text, public.nivel_escolar, smallint, text, text, integer, integer
) to authenticated;

notify pgrst, 'reload schema';
