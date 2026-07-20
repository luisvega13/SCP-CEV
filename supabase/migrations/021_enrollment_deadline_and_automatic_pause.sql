-- Fecha limite de inscripcion por nivel/ciclo y pausa automatica.
alter table public.configuracion_costos
  add column if not exists fecha_limite_inscripcion date;

update public.configuracion_costos
set fecha_limite_inscripcion = make_date(
  split_part(ciclo_escolar, '-', 1)::integer,
  8,
  31
)
where fecha_limite_inscripcion is null;

alter table public.configuracion_costos
  alter column fecha_limite_inscripcion set not null;

alter table public.alumnos
  add column if not exists pausa_automatica_inscripcion boolean not null default false,
  add column if not exists fecha_pausa_inscripcion timestamptz;

create or replace function public.validar_fecha_limite_inscripcion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inicio integer;
begin
  v_inicio := split_part(new.ciclo_escolar, '-', 1)::integer;
  if new.fecha_limite_inscripcion is null then
    new.fecha_limite_inscripcion := make_date(v_inicio, 8, 31);
  end if;
  if extract(year from new.fecha_limite_inscripcion)::integer <> v_inicio
    or extract(month from new.fecha_limite_inscripcion)::integer <> 8 then
    raise exception 'La fecha limite de inscripcion debe estar dentro de agosto del inicio del ciclo escolar'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_fecha_limite_inscripcion
  on public.configuracion_costos;
create trigger validar_fecha_limite_inscripcion
  before insert or update of ciclo_escolar, fecha_limite_inscripcion
  on public.configuracion_costos
  for each row execute function public.validar_fecha_limite_inscripcion();

-- Distingue una pausa manual de la pausa creada por esta regla.
create or replace function public.conservar_origen_pausa_inscripcion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    if not (new.estado = 'pausa' and new.pausa_automatica_inscripcion) then
      new.pausa_automatica_inscripcion := false;
      new.fecha_pausa_inscripcion := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conservar_origen_pausa_inscripcion on public.alumnos;
create trigger conservar_origen_pausa_inscripcion
  before update of estado on public.alumnos
  for each row execute function public.conservar_origen_pausa_inscripcion();

create or replace function public.sincronizar_estado_con_deuda_inscripcion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := timezone('America/Mexico_City', now())::date;
  v_year integer := extract(year from timezone('America/Mexico_City', now()))::integer;
  v_month integer := extract(month from timezone('America/Mexico_City', now()))::integer;
  v_cycle text;
  v_deadline date;
begin
  v_cycle := case
    when v_month >= 8 then v_year::text || '-' || (v_year + 1)::text
    else (v_year - 1)::text || '-' || v_year::text
  end;
  select fecha_limite_inscripcion into v_deadline
  from public.configuracion_costos
  where nivel = new.nivel and ciclo_escolar = v_cycle;

  if new.estado = 'pausa'
    and new.pausa_automatica_inscripcion
    and new.deuda_inscripcion <= 0 then
    new.estado := 'activo';
    new.pausa_automatica_inscripcion := false;
    new.fecha_pausa_inscripcion := null;
  elsif new.estado = 'activo'
    and new.deuda_inscripcion > 0
    and v_deadline is not null
    and v_deadline < v_today then
    new.estado := 'pausa';
    new.pausa_automatica_inscripcion := true;
    new.fecha_pausa_inscripcion := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sincronizar_estado_con_deuda_inscripcion on public.alumnos;
create trigger sincronizar_estado_con_deuda_inscripcion
  before update of deuda_inscripcion on public.alumnos
  for each row execute function public.sincronizar_estado_con_deuda_inscripcion();

create or replace function public.aplicar_pausas_por_inscripcion_vencida()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := timezone('America/Mexico_City', now())::date;
  v_year integer := extract(year from timezone('America/Mexico_City', now()))::integer;
  v_month integer := extract(month from timezone('America/Mexico_City', now()))::integer;
  v_cycle text;
  v_paused integer := 0;
  v_reactivated integer := 0;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    and session_user not in ('postgres', 'service_role') then
    raise exception 'Solo un administrador puede aplicar esta regla'
      using errcode = '42501';
  end if;

  v_cycle := case
    when v_month >= 8 then v_year::text || '-' || (v_year + 1)::text
    else (v_year - 1)::text || '-' || v_year::text
  end;

  update public.alumnos alumno
  set estado = 'pausa',
      pausa_automatica_inscripcion = true,
      fecha_pausa_inscripcion = now()
  from public.configuracion_costos configuracion
  where configuracion.nivel = alumno.nivel
    and configuracion.ciclo_escolar = v_cycle
    and configuracion.fecha_limite_inscripcion < v_today
    and alumno.estado = 'activo'
    and alumno.deuda_inscripcion > 0;
  get diagnostics v_paused = row_count;

  -- Solo se reactiva una pausa creada automaticamente; las pausas manuales
  -- y las bajas institucionales nunca se modifican.
  update public.alumnos alumno
  set estado = 'activo',
      pausa_automatica_inscripcion = false,
      fecha_pausa_inscripcion = null
  where alumno.estado = 'pausa'
    and alumno.pausa_automatica_inscripcion
    and alumno.deuda_inscripcion <= 0;
  get diagnostics v_reactivated = row_count;

  return jsonb_build_object(
    'cycle', v_cycle,
    'paused', v_paused,
    'reactivated', v_reactivated,
    'evaluated_at', now()
  );
end;
$$;

-- Permite que un alumno pausado automaticamente liquide exclusivamente su
-- inscripcion. Las mensualidades, pausas manuales y bajas siguen bloqueadas.
create or replace function public.validar_estado_antes_de_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.estado_alumno;
  v_pausa_automatica boolean;
begin
  select estado, pausa_automatica_inscripcion
  into v_estado, v_pausa_automatica
  from public.alumnos
  where id = new.alumno_id
  for update;

  if not found then raise exception 'El alumno no existe'; end if;
  if v_estado = 'baja'
    or (v_estado = 'pausa' and not v_pausa_automatica)
    or (v_estado = 'pausa' and v_pausa_automatica and new.tipo_pago <> 'inscripcion') then
    raise exception 'El alumno no puede registrar este pago por su estado academico actual'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.actualizar_configuracion_escolar(
  p_nivel public.nivel_escolar,
  p_costo_inscripcion numeric,
  p_costo_mensualidad numeric,
  p_ciclo_escolar text,
  p_fecha_limite_inscripcion date
)
returns public.configuracion_costos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_configuracion public.configuracion_costos;
begin
  -- Esta función conserva todas las validaciones, bloqueo por pagos y
  -- recálculo transaccional de la función de costos existente.
  perform public.actualizar_configuracion_costos(
    p_nivel,
    p_costo_inscripcion,
    p_costo_mensualidad,
    p_ciclo_escolar
  );

  update public.configuracion_costos
  set fecha_limite_inscripcion = p_fecha_limite_inscripcion
  where nivel = p_nivel and ciclo_escolar = p_ciclo_escolar
  returning * into v_configuracion;

  perform public.aplicar_pausas_por_inscripcion_vencida();

  return v_configuracion;
end;
$$;

revoke all on function public.aplicar_pausas_por_inscripcion_vencida() from public;
grant execute on function public.aplicar_pausas_por_inscripcion_vencida()
  to authenticated;
revoke all on function public.actualizar_configuracion_escolar(
  public.nivel_escolar, numeric, numeric, text, date
) from public;
grant execute on function public.actualizar_configuracion_escolar(
  public.nivel_escolar, numeric, numeric, text, date
) to authenticated;

-- Supabase Cron (pg_cron) ejecuta la regla todos los dias a las 00:05 de
-- Ciudad de Mexico (06:05 UTC). La llamada manual del frontend sirve además
-- como respaldo inmediato cuando un administrador abre el sistema.
create extension if not exists pg_cron with schema pg_catalog;
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname = 'pausar-inscripciones-vencidas';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
select cron.schedule(
  'pausar-inscripciones-vencidas',
  '5 6 * * *',
  'select public.aplicar_pausas_por_inscripcion_vencida();'
);
