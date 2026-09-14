-- Garantiza el orden correcto despues de insertar, editar o eliminar un pago:
-- 1. sincronizar estado_cuenta; 2. recalcular la deuda del alumno.

create or replace function public.sincronizar_pago_con_estado_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalcular_pago_estado_cuenta(
      old.alumno_id,
      old.tipo_pago,
      old.mes,
      old.anio
    );
    perform public.recalcular_deuda_alumno(
      old.alumno_id,
      public.ciclo_de_pago(old.mes, old.anio)
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalcular_pago_estado_cuenta(
      new.alumno_id,
      new.tipo_pago,
      new.mes,
      new.anio
    );
    perform public.recalcular_deuda_alumno(
      new.alumno_id,
      public.ciclo_de_pago(new.mes, new.anio)
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Este trigger antiguo recalculaba antes de que estado_cuenta estuviera listo.
drop trigger if exists recalcular_deuda_despues_de_pago on public.pagos;

-- Repara saldos que hayan quedado desincronizados por el orden anterior.
do $$
declare
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_inicio integer;
  v_ciclo text;
  v_alumno record;
begin
  v_inicio := case
    when extract(month from v_hoy) >= 8 then extract(year from v_hoy)::integer
    else extract(year from v_hoy)::integer - 1
  end;
  v_ciclo := v_inicio::text || '-' || (v_inicio + 1)::text;

  for v_alumno in select id from public.alumnos loop
    perform public.recalcular_deuda_alumno(v_alumno.id, v_ciclo);
  end loop;
end
$$;

