-- Incluye las pausas temporales en el historial y reporte de bajas.

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

insert into public.alumnos_bajas (
  alumno_id, ciclo_escolar, fecha_baja, dado_baja_por,
  matricula, nombre, apellido_paterno, apellido_materno,
  nivel, grado, grupo, sexo, tipo_baja
)
select
  a.id,
  coalesce(nullif(a.ciclo_grado_actual, ''), public.ciclo_escolar_actual()),
  null,
  null,
  a.matricula,
  a.nombre,
  a.apellido_paterno,
  a.apellido_materno,
  a.nivel,
  a.grado,
  a.grupo,
  a.sexo,
  'pausa'::public.estado_alumno
from public.alumnos a
where a.estado = 'pausa'
on conflict (alumno_id, ciclo_escolar) do update set
  tipo_baja = excluded.tipo_baja,
  fecha_baja = excluded.fecha_baja,
  dado_baja_por = excluded.dado_baja_por,
  matricula = excluded.matricula,
  nombre = excluded.nombre,
  apellido_paterno = excluded.apellido_paterno,
  apellido_materno = excluded.apellido_materno,
  nivel = excluded.nivel,
  grado = excluded.grado,
  grupo = excluded.grupo,
  sexo = excluded.sexo;

create or replace function public.registrar_historial_baja_alumno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_es_nueva_salida boolean := false;
begin
  if tg_op = 'INSERT' then
    v_es_nueva_salida := new.estado in ('baja', 'pausa');
  elsif tg_op = 'UPDATE' then
    v_es_nueva_salida := new.estado in ('baja', 'pausa')
           and old.estado is distinct from new.estado;
  end if;

  if v_es_nueva_salida then
    insert into public.alumnos_bajas (
      alumno_id, ciclo_escolar, fecha_baja, dado_baja_por,
      matricula, nombre, apellido_paterno, apellido_materno,
      nivel, grado, grupo, sexo, tipo_baja
    ) values (
      new.id, public.ciclo_escolar_actual(), now(), auth.uid(),
      new.matricula, new.nombre, new.apellido_paterno, new.apellido_materno,
      new.nivel, new.grado, new.grupo, new.sexo, new.estado
    )
    on conflict (alumno_id, ciclo_escolar) do update set
      fecha_baja = excluded.fecha_baja,
      dado_baja_por = excluded.dado_baja_por,
      matricula = excluded.matricula,
      nombre = excluded.nombre,
      apellido_paterno = excluded.apellido_paterno,
      apellido_materno = excluded.apellido_materno,
      nivel = excluded.nivel,
      grado = excluded.grado,
      grupo = excluded.grupo,
      sexo = excluded.sexo,
      tipo_baja = excluded.tipo_baja;
  end if;

  return new;
end;
$$;

create or replace function public.consultar_bajas_alumnos(
  p_ciclo_escolar text,
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
  if p_grado is not null and (p_grado < 1 or p_grado > 6) then
    raise exception 'El grado no es válido' using errcode = '22023';
  end if;
  if p_limite < 1 or p_limite > 1000 or p_offset < 0 then
    raise exception 'La paginación no es válida' using errcode = '22023';
  end if;

  with filtradas as materialized (
    select b.*
    from public.alumnos_bajas b
    where b.ciclo_escolar = p_ciclo_escolar
      and (p_nivel is null or b.nivel = p_nivel)
      and (p_grado is null or b.grado = p_grado)
      and (nullif(trim(coalesce(p_grupo, '')), '') is null
        or lower(b.grupo) = lower(trim(p_grupo)))
      and (
        nullif(trim(coalesce(p_busqueda, '')), '') is null
        or b.matricula ilike '%' || trim(p_busqueda) || '%'
        or concat_ws(' ', b.nombre, b.apellido_paterno, b.apellido_materno)
          ilike '%' || trim(p_busqueda) || '%'
      )
  ), pagina as (
    select *
    from filtradas
    order by fecha_baja desc nulls last, registrado_en desc,
      apellido_paterno, apellido_materno, nombre
    limit p_limite offset p_offset
  ), grados_disponibles as (
    select distinct b.grado
    from public.alumnos_bajas b
    where b.ciclo_escolar = p_ciclo_escolar
      and (p_nivel is null or b.nivel = p_nivel)
  ), grupos_disponibles as (
    select distinct b.grupo
    from public.alumnos_bajas b
    where b.ciclo_escolar = p_ciclo_escolar
      and (p_nivel is null or b.nivel = p_nivel)
      and (p_grado is null or b.grado = p_grado)
  )
  select jsonb_build_object(
    'ciclo_escolar', p_ciclo_escolar,
    'total', (select count(*) from filtradas),
    'hombres', (select count(*) from filtradas where sexo = 'hombre'),
    'mujeres', (select count(*) from filtradas where sexo = 'mujer'),
    'grados_disponibles', coalesce((
      select jsonb_agg(grado order by grado) from grados_disponibles
    ), '[]'::jsonb),
    'grupos_disponibles', coalesce((
      select jsonb_agg(grupo order by grupo) from grupos_disponibles
    ), '[]'::jsonb),
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'alumno_id', p.alumno_id,
        'ciclo_escolar', p.ciclo_escolar,
        'fecha_baja', p.fecha_baja,
        'registrado_en', p.registrado_en,
        'matricula', p.matricula,
        'nombre', p.nombre,
        'apellido_paterno', p.apellido_paterno,
        'apellido_materno', p.apellido_materno,
        'nivel', p.nivel,
        'grado', p.grado,
        'grupo', p.grupo,
        'sexo', p.sexo,
        'tipo_baja', p.tipo_baja
      ) order by p.fecha_baja desc nulls last, p.registrado_en desc,
        p.apellido_paterno, p.apellido_materno, p.nombre)
      from pagina p
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

notify pgrst, 'reload schema';
