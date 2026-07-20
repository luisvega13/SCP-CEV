alter table public.auditoria_pagos
  add column if not exists metodo_anterior public.metodo_pago,
  add column if not exists metodo_nuevo public.metodo_pago;

drop function if exists public.modificar_pago_auditado(uuid, numeric, text);

create or replace function public.modificar_pago_auditado(
  p_pago_id uuid,
  p_nuevo_monto numeric,
  p_metodo_pago public.metodo_pago,
  p_motivo text
)
returns public.pagos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos;
  v_pago_actualizado public.pagos;
  v_cuenta public.estado_cuenta;
  v_total_con_cambio numeric(12, 2);
  v_monto_redondeado numeric(12, 2);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede modificar pagos'
      using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'La sesion no es valida' using errcode = '42501';
  end if;

  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero'
      using errcode = '23514';
  end if;

  if p_metodo_pago is null then
    raise exception 'Selecciona un metodo de pago valido'
      using errcode = '23514';
  end if;

  if char_length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe contener al menos 5 caracteres'
      using errcode = '23514';
  end if;

  v_monto_redondeado := round(p_nuevo_monto, 2);

  select * into v_pago
  from public.pagos
  where id = p_pago_id
  for update;

  if not found then
    raise exception 'El pago no existe' using errcode = 'P0002';
  end if;

  if v_pago.monto = v_monto_redondeado
    and v_pago.metodo_pago = p_metodo_pago then
    raise exception 'Modifica el monto o el metodo de pago antes de guardar'
      using errcode = '23514';
  end if;

  -- Las reglas financieras solo se vuelven a validar si cambia el monto.
  if v_pago.monto <> v_monto_redondeado then
    select * into v_cuenta
    from public.estado_cuenta
    where alumno_id = v_pago.alumno_id
      and tipo_pago = v_pago.tipo_pago
      and mes = v_pago.mes
      and anio = v_pago.anio
    for update;

    select coalesce(sum(monto), 0) + v_monto_redondeado
    into v_total_con_cambio
    from public.pagos
    where alumno_id = v_pago.alumno_id
      and tipo_pago = v_pago.tipo_pago
      and mes = v_pago.mes
      and anio = v_pago.anio
      and id <> v_pago.id;

    if v_cuenta.id is not null
      and v_monto_redondeado > v_pago.monto
      and v_total_con_cambio > v_cuenta.monto_esperado then
      raise exception 'El nuevo monto excede el costo del concepto'
        using errcode = '23514';
    end if;

    if v_cuenta.id is not null
      and v_total_con_cambio < v_cuenta.monto_esperado then
      if v_pago.tipo_pago = 'inscripcion' and exists (
        select 1
        from public.pagos as pago_posterior
        where pago_posterior.alumno_id = v_pago.alumno_id
          and pago_posterior.tipo_pago = 'mensualidad'
          and public.ciclo_de_pago(pago_posterior.mes, pago_posterior.anio) =
            public.ciclo_de_pago(v_pago.mes, v_pago.anio)
      ) then
        raise exception 'No se puede dejar incompleta la inscripcion porque ya existen mensualidades posteriores'
          using errcode = '23514';
      end if;

      if v_pago.tipo_pago = 'mensualidad' and exists (
        select 1
        from public.pagos as pago_posterior
        join public.estado_cuenta as cuenta_posterior
          on cuenta_posterior.alumno_id = pago_posterior.alumno_id
         and cuenta_posterior.tipo_pago = pago_posterior.tipo_pago
         and cuenta_posterior.mes = pago_posterior.mes
         and cuenta_posterior.anio = pago_posterior.anio
        where pago_posterior.alumno_id = v_pago.alumno_id
          and pago_posterior.tipo_pago = 'mensualidad'
          and cuenta_posterior.fecha_limite > v_cuenta.fecha_limite
          and public.ciclo_de_pago(pago_posterior.mes, pago_posterior.anio) =
            public.ciclo_de_pago(v_pago.mes, v_pago.anio)
      ) then
        raise exception 'No se puede dejar incompleta esta mensualidad porque ya existen pagos de meses posteriores'
          using errcode = '23514';
      end if;
    end if;
  end if;

  update public.pagos
  set monto = v_monto_redondeado,
      metodo_pago = p_metodo_pago
  where id = v_pago.id
  returning * into v_pago_actualizado;

  insert into public.auditoria_pagos (
    pago_id,
    monto_anterior,
    monto_nuevo,
    metodo_anterior,
    metodo_nuevo,
    motivo,
    modificado_por
  ) values (
    v_pago.id,
    v_pago.monto,
    v_pago_actualizado.monto,
    v_pago.metodo_pago,
    v_pago_actualizado.metodo_pago,
    trim(p_motivo),
    auth.uid()
  );

  if v_pago.monto <> v_pago_actualizado.monto then
    perform public.recalcular_deuda_alumno(
      v_pago.alumno_id,
      public.ciclo_de_pago(v_pago.mes, v_pago.anio)
    );
  end if;

  return v_pago_actualizado;
end;
$$;

revoke all on function public.modificar_pago_auditado(
  uuid,
  numeric,
  public.metodo_pago,
  text
) from public;
grant execute on function public.modificar_pago_auditado(
  uuid,
  numeric,
  public.metodo_pago,
  text
) to authenticated;

