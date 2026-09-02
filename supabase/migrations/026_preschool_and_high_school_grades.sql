-- Reglas académicas por nivel: preescolar 3 grados, primaria 6,
-- secundaria 3 y bachillerato 6 semestres.
alter table public.alumnos
  drop constraint if exists alumnos_nivel_grado_check;

alter table public.alumnos
  add constraint alumnos_nivel_grado_check check (
    (nivel = 'preescolar' and grado between 1 and 3)
    or (nivel = 'primaria' and grado between 1 and 6)
    or (nivel = 'secundaria' and grado between 1 and 3)
    or (nivel = 'bachillerato' and grado between 1 and 6)
  );

create or replace function public.promover_alumno_por_reinscripcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alumno public.alumnos;
  v_ciclo text;
  v_nivel_nuevo public.nivel_escolar;
  v_grado_nuevo smallint;
begin
  if new.tipo_pago <> 'inscripcion' then return new; end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);
  select * into v_alumno
  from public.alumnos
  where id = new.alumno_id
  for update;

  if not v_alumno.promocion_habilitada then
    update public.alumnos
    set ciclo_grado_actual = v_ciclo,
        promocion_habilitada = true
    where id = new.alumno_id;
    return new;
  end if;

  if v_ciclo <= v_alumno.ciclo_grado_actual then return new; end if;
  if exists (
    select 1 from public.promociones_academicas
    where alumno_id = new.alumno_id and ciclo_escolar = v_ciclo
  ) then return new; end if;

  if v_alumno.nivel = 'preescolar' and v_alumno.grado >= 3 then
    v_nivel_nuevo := 'primaria'; v_grado_nuevo := 1;
  elsif v_alumno.nivel = 'primaria' and v_alumno.grado >= 6 then
    v_nivel_nuevo := 'secundaria'; v_grado_nuevo := 1;
  elsif v_alumno.nivel = 'secundaria' and v_alumno.grado >= 3 then
    v_nivel_nuevo := 'bachillerato'; v_grado_nuevo := 1;
  elsif v_alumno.nivel = 'bachillerato' and v_alumno.grado >= 6 then
    raise exception 'El alumno ya se encuentra en el semestre máximo de bachillerato'
      using errcode = '23514';
  else
    v_nivel_nuevo := v_alumno.nivel;
    v_grado_nuevo := v_alumno.grado + 1;
  end if;

  insert into public.promociones_academicas (
    alumno_id, ciclo_escolar, nivel_anterior, grado_anterior,
    nivel_nuevo, grado_nuevo
  ) values (
    new.alumno_id, v_ciclo, v_alumno.nivel, v_alumno.grado,
    v_nivel_nuevo, v_grado_nuevo
  );

  update public.alumnos
  set nivel = v_nivel_nuevo,
      grado = v_grado_nuevo,
      ciclo_grado_actual = v_ciclo
  where id = new.alumno_id;

  return new;
end;
$$;

-- La función del dashboard creada en la migración 020 contiene una lista
-- ordenada de niveles. Se amplía sin duplicar toda su implementación.
do $$
declare
  v_original text;
  v_actualizada text;
begin
  select pg_get_functiondef(
    'public.obtener_resumen_administrativo(text)'::regprocedure
  ) into v_original;

  v_actualizada := regexp_replace(
    v_original,
    '\(1, ''primaria''::public\.nivel_escolar\),[[:space:]]*\(2, ''secundaria''::public\.nivel_escolar\),[[:space:]]*\(3, ''bachillerato''::public\.nivel_escolar\)',
    E'(1, ''preescolar''::public.nivel_escolar),\n        (2, ''primaria''::public.nivel_escolar),\n        (3, ''secundaria''::public.nivel_escolar),\n        (4, ''bachillerato''::public.nivel_escolar)'
  );

  if v_actualizada = v_original then
    raise exception 'No fue posible ampliar el resumen administrativo con preescolar';
  end if;

  execute v_actualizada;
end
$$;
