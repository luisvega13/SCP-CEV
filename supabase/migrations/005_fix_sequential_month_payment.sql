-- Corrige la validacion secuencial a partir de septiembre.
-- En PostgreSQL, smallint - integer produce integer; la conversion explicita
-- permite llamar correctamente a mes_desde_numero(smallint).
create or replace function public.descontar_saldo_al_registrar_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nivel public.nivel_escolar;
  v_deuda_inscripcion numeric(12, 2);
  v_ciclo text;
  v_costo_inscripcion numeric(12, 2);
  v_costo_mensualidad numeric(12, 2);
  v_mes_numero smallint;
  v_mes_anterior public.mes_pago;
  v_anio_anterior smallint;
  v_pagado_actual numeric(12, 2);
  v_pagado_anterior numeric(12, 2);
begin
  select nivel, deuda_inscripcion
    into v_nivel, v_deuda_inscripcion
    from public.alumnos
    where id = new.alumno_id
    for update;

  if not found then
    raise exception 'El alumno no existe';
  end if;

  v_ciclo := public.ciclo_de_pago(new.mes, new.anio);

  select costo_inscripcion, costo_mensualidad
    into v_costo_inscripcion, v_costo_mensualidad
    from public.configuracion_costos
    where nivel = v_nivel
      and ciclo_escolar = v_ciclo;

  if not found then
    raise exception 'Configura los costos de % para el ciclo %',
      v_nivel, v_ciclo;
  end if;

  select coalesce(sum(monto), 0)
    into v_pagado_actual
    from public.pagos
    where alumno_id = new.alumno_id
      and tipo_pago = new.tipo_pago
      and mes = new.mes
      and anio = new.anio;

  if new.tipo_pago = 'inscripcion' then
    if new.mes <> 'agosto' then
      raise exception 'La inscripcion solo puede registrarse en agosto';
    end if;

    if v_pagado_actual + new.monto > v_costo_inscripcion then
      raise exception 'El pago excede el saldo de inscripcion';
    end if;
  else
    if v_deuda_inscripcion > 0 then
      raise exception 'Debe liquidarse la inscripcion antes de pagar mensualidades';
    end if;

    if v_pagado_actual + new.monto > v_costo_mensualidad then
      raise exception 'El pago excede el costo de la mensualidad';
    end if;

    v_mes_numero := public.numero_mes(new.mes);

    -- Agosto inicia el ciclo; los demas meses requieren liquidar el anterior.
    if v_mes_numero <> 8 then
      if v_mes_numero = 1 then
        v_mes_anterior := 'diciembre';
        v_anio_anterior := new.anio - 1;
      else
        v_mes_anterior := public.mes_desde_numero(
          (v_mes_numero - 1)::smallint
        );
        v_anio_anterior := new.anio;
      end if;

      select coalesce(sum(monto), 0)
        into v_pagado_anterior
        from public.pagos
        where alumno_id = new.alumno_id
          and tipo_pago = 'mensualidad'
          and mes = v_mes_anterior
          and anio = v_anio_anterior;

      if v_pagado_anterior < v_costo_mensualidad then
        raise exception 'Debe liquidarse % de % antes de continuar',
          v_mes_anterior, v_anio_anterior;
      end if;
    end if;
  end if;

  return new;
end;
$$;
