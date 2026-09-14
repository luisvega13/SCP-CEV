-- Distingue una reactivacion institucional de la activacion automatica que
-- ocurre cuando un alumno nuevo liquida su inscripcion.

create or replace function public.marcar_cobro_completo_al_reactivar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
begin
  if (
      old.estado = 'baja'
      or (
        old.estado = 'pausa'
        and not old.pausa_automatica_inscripcion
      )
    )
    and new.estado = 'activo' then
    v_inicio := case
      when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
      else extract(year from v_hoy)::integer - 1
    end;
    new.ciclo_cobro_completo := v_inicio::text || '-' || (v_inicio + 1)::text;
  elsif old.estado = 'pausa'
    and old.pausa_automatica_inscripcion
    and new.estado = 'activo' then
    new.ciclo_cobro_completo := null;
  end if;
  return new;
end;
$$;

-- Repara alumnos nuevos del ciclo vigente que pudieron ser marcados como
-- ciclo completo al pagar una inscripcion vencida.
do $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
  v_ciclo text;
  v_inicio_ciclo date;
  v_alumno record;
begin
  v_inicio := case
    when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
    else extract(year from v_hoy)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;
  v_inicio_ciclo := make_date(v_inicio, 8, 1);

  for v_alumno in
    select id, fecha_alta
    from public.alumnos
    where ciclo_cobro_completo = v_ciclo
      and fecha_alta >= v_inicio_ciclo
  loop
    update public.alumnos
    set ciclo_cobro_completo = null
    where id = v_alumno.id;

    delete from public.estado_cuenta
    where alumno_id = v_alumno.id
      and tipo_pago = 'mensualidad'
      and monto_pagado = 0
      and public.ciclo_de_pago(mes, anio) = v_ciclo
      and make_date(anio, public.numero_mes(mes), 1)
          < date_trunc('month', v_alumno.fecha_alta)::date;

    perform public.aplicar_beca_estado_cuenta(v_alumno.id, v_ciclo);
  end loop;

  perform public.actualizar_estatus_estado_cuenta();
end
$$;
