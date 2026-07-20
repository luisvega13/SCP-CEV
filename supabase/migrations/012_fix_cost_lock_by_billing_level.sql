-- Conserva el nivel al que pertenece cada cobro. El nivel actual del alumno
-- puede cambiar por una promocion y no es una fuente historica confiable.
alter table public.pagos
  add column if not exists nivel_cobro public.nivel_escolar;

-- Reconstruye el nivel de pagos existentes usando el historial de promociones.
-- En el ciclo de una promocion, la inscripcion y mensualidades corresponden al
-- nivel nuevo. Para ciclos anteriores se usa el nivel previo a la promocion.
update public.pagos as pago
set nivel_cobro = coalesce(
  (
    select promocion.nivel_nuevo
    from public.promociones_academicas as promocion
    where promocion.alumno_id = pago.alumno_id
      and promocion.ciclo_escolar = public.ciclo_de_pago(pago.mes, pago.anio)
    limit 1
  ),
  (
    select promocion.nivel_anterior
    from public.promociones_academicas as promocion
    where promocion.alumno_id = pago.alumno_id
      and promocion.ciclo_escolar > public.ciclo_de_pago(pago.mes, pago.anio)
    order by promocion.ciclo_escolar
    limit 1
  ),
  (
    select alumno.nivel
    from public.alumnos as alumno
    where alumno.id = pago.alumno_id
  )
)
where pago.nivel_cobro is null;

alter table public.pagos
  alter column nivel_cobro set not null;

create index if not exists pagos_nivel_ciclo_idx
  on public.pagos (nivel_cobro, anio, mes);

-- Este trigger se ejecuta despues de a_promover_alumno_por_reinscripcion por
-- el orden alfabetico de los triggers BEFORE de PostgreSQL. Por eso captura el
-- nivel nuevo cuando el pago de inscripcion produce una promocion.
create or replace function public.asignar_nivel_cobro_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select alumno.nivel
  into new.nivel_cobro
  from public.alumnos as alumno
  where alumno.id = new.alumno_id;

  if new.nivel_cobro is null then
    raise exception 'No fue posible determinar el nivel del cobro';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_asignar_nivel_cobro_pago on public.pagos;
create trigger zz_asignar_nivel_cobro_pago
  before insert or update of alumno_id
  on public.pagos
  for each row
  execute function public.asignar_nivel_cobro_pago();

-- Comprueba el ciclo a partir de mes/anio para incluir tambien pagos antiguos
-- aunque la columna ciclo_escolar no haya sido rellenada correctamente.
create or replace function public.existen_pagos_nivel_ciclo(
  p_nivel public.nivel_escolar,
  p_ciclo_escolar text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.pagos as pago
    where pago.nivel_cobro = p_nivel
      and public.ciclo_de_pago(pago.mes, pago.anio) = p_ciclo_escolar
  );
$$;

revoke all on function public.existen_pagos_nivel_ciclo(
  public.nivel_escolar,
  text
) from public;
grant execute on function public.existen_pagos_nivel_ciclo(
  public.nivel_escolar,
  text
) to authenticated;

