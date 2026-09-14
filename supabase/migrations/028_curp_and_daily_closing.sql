-- CURP como identificador institucional editable, con auditoria, y corte diario.

create or replace function public.curp_es_valida(p_curp text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_curp text := upper(trim(p_curp));
  v_diccionario constant text := '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  v_suma integer := 0;
  v_indice integer;
  v_anio integer;
  v_mes integer;
  v_dia integer;
  v_fecha date;
begin
  if v_curp !~ '^[A-ZÑ][AEIOUX][A-ZÑ]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-ZÑ]{3}[A-Z0-9][0-9]$' then
    return false;
  end if;

  v_anio := substring(v_curp from 5 for 2)::integer;
  v_mes := substring(v_curp from 7 for 2)::integer;
  v_dia := substring(v_curp from 9 for 2)::integer;

  begin
    v_fecha := make_date(
      case when substring(v_curp from 17 for 1) ~ '^[0-9]$'
        then 1900 + v_anio else 2000 + v_anio end,
      v_mes,
      v_dia
    );
  exception when others then
    return false;
  end;

  for v_indice in 1..17 loop
    v_suma := v_suma
      + (strpos(v_diccionario, substring(v_curp from v_indice for 1)) - 1)
      * (19 - v_indice);
  end loop;

  return substring(v_curp from 18 for 1)::integer = (10 - (v_suma % 10)) % 10;
end;
$$;

alter table public.alumnos
  drop constraint if exists alumnos_matricula_formato_check;

-- Los registros demo/legados existentes se conservan. Todo registro nuevo y toda
-- modificación de matrícula debe contener una CURP válida.
create or replace function public.validar_curp_alumno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.matricula is not distinct from old.matricula then
    return new;
  end if;

  new.matricula := upper(trim(new.matricula));
  if not public.curp_es_valida(new.matricula) then
    raise exception 'La CURP debe ser válida y contener 18 caracteres'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_curp_alumno on public.alumnos;
create trigger validar_curp_alumno
  before insert or update of matricula on public.alumnos
  for each row execute function public.validar_curp_alumno();

comment on column public.alumnos.matricula is
  'CURP del alumno utilizada como identificador institucional único. Los valores legados se conservan hasta su corrección.';

create table if not exists public.auditoria_curp_alumnos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete restrict,
  curp_anterior text not null,
  curp_nueva text not null,
  modificado_por uuid not null references auth.users(id) on delete restrict,
  fecha_modificacion timestamptz not null default now()
);

create index if not exists auditoria_curp_alumnos_alumno_fecha_idx
  on public.auditoria_curp_alumnos (alumno_id, fecha_modificacion desc);

alter table public.auditoria_curp_alumnos enable row level security;
alter table public.auditoria_curp_alumnos force row level security;
revoke all on table public.auditoria_curp_alumnos from anon, authenticated;
grant select on table public.auditoria_curp_alumnos to authenticated;

drop policy if exists "Administradores consultan auditoria CURP"
  on public.auditoria_curp_alumnos;
create policy "Administradores consultan auditoria CURP"
  on public.auditoria_curp_alumnos
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.actualizar_curp_alumno(
  p_alumno_id uuid,
  p_curp text
)
returns public.alumnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alumno public.alumnos;
  v_curp_anterior text;
  v_curp text := upper(trim(p_curp));
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede modificar la CURP'
      using errcode = '42501';
  end if;
  if not public.curp_es_valida(v_curp) then
    raise exception 'La CURP capturada no es válida' using errcode = '23514';
  end if;

  select matricula into v_curp_anterior
  from public.alumnos
  where id = p_alumno_id
  for update;

  if not found then
    raise exception 'El alumno no existe' using errcode = 'P0002';
  end if;
  if v_curp_anterior = v_curp then
    select * into v_alumno from public.alumnos where id = p_alumno_id;
    return v_alumno;
  end if;
  if exists (
    select 1 from public.alumnos
    where matricula = v_curp and id <> p_alumno_id
  ) then
    raise exception 'La CURP ya está registrada para otro alumno'
      using errcode = '23505';
  end if;

  update public.alumnos
  set matricula = v_curp
  where id = p_alumno_id
  returning * into v_alumno;

  insert into public.auditoria_curp_alumnos (
    alumno_id, curp_anterior, curp_nueva, modificado_por
  ) values (p_alumno_id, v_curp_anterior, v_curp, auth.uid());

  return v_alumno;
end;
$$;

revoke all on function public.actualizar_curp_alumno(uuid, text) from public;
grant execute on function public.actualizar_curp_alumno(uuid, text) to authenticated;

create or replace function public.obtener_corte_diario(p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede generar cortes diarios'
      using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > timezone('America/Mexico_City', now())::date then
    raise exception 'Selecciona una fecha válida que no sea futura';
  end if;

  with pagos_dia as (
    select
      p.id,
      p.fecha_pago,
      p.monto,
      p.tipo_pago,
      p.metodo_pago,
      p.mes,
      p.anio,
      a.matricula,
      concat_ws(' ', a.nombre, a.apellido_paterno, nullif(a.apellido_materno, '')) as alumno
    from public.pagos p
    join public.alumnos a on a.id = p.alumno_id
    where timezone('America/Mexico_City', p.fecha_pago)::date = p_fecha
  ), metodos as (
    select * from (values
      (1, 'efectivo'::public.metodo_pago),
      (2, 'tarjeta'::public.metodo_pago),
      (3, 'transferencia'::public.metodo_pago),
      (4, 'deposito'::public.metodo_pago)
    ) as m(orden, metodo)
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'generado_en', now(),
    'total_movimientos', (select count(*) from pagos_dia),
    'total_recaudado', coalesce((select sum(monto) from pagos_dia), 0),
    'por_metodo', (
      select jsonb_agg(jsonb_build_object(
        'metodo', m.metodo,
        'movimientos', (select count(*) from pagos_dia p where p.metodo_pago = m.metodo),
        'total', coalesce((select sum(p.monto) from pagos_dia p where p.metodo_pago = m.metodo), 0)
      ) order by m.orden)
      from metodos m
    ),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'fecha_pago', p.fecha_pago,
        'hora_local', to_char(timezone('America/Mexico_City', p.fecha_pago), 'HH24:MI:SS'),
        'alumno', p.alumno,
        'curp', p.matricula,
        'tipo_pago', p.tipo_pago,
        'periodo', initcap(p.mes::text) || ' ' || p.anio,
        'metodo_pago', p.metodo_pago,
        'monto', p.monto
      ) order by p.fecha_pago, p.id)
      from pagos_dia p
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.obtener_corte_diario(date) from public;
grant execute on function public.obtener_corte_diario(date) to authenticated;

notify pgrst, 'reload schema';
