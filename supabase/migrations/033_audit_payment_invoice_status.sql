-- Permite corregir de forma auditada si un pago se factura o no.

alter table public.auditoria_pagos
  add column if not exists facturado_anterior boolean,
  add column if not exists facturado_nuevo boolean;

drop function if exists public.modificar_pago_auditado(
  uuid, numeric, public.metodo_pago, boolean, text
);

create function public.modificar_pago_auditado(
  p_pago_id uuid,
  p_nuevo_monto numeric,
  p_metodo_pago public.metodo_pago,
  p_facturado boolean,
  p_motivo text
)
returns public.pagos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago_anterior public.pagos;
  v_pago_actualizado public.pagos;
  v_auditoria_id uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin'
    or auth.uid() is null then
    raise exception 'Solo un administrador puede modificar pagos'
      using errcode = '42501';
  end if;
  if p_facturado is null then
    raise exception 'Indica si el pago se factura o no'
      using errcode = '23514';
  end if;
  if p_nuevo_monto is null or p_nuevo_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero'
      using errcode = '23514';
  end if;
  if p_metodo_pago is null then
    raise exception 'Selecciona un método de pago válido'
      using errcode = '23514';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'El motivo debe contener al menos 5 caracteres'
      using errcode = '23514';
  end if;

  select * into v_pago_anterior
  from public.pagos
  where id = p_pago_id
  for update;

  if not found then
    raise exception 'El pago no existe' using errcode = 'P0002';
  end if;

  if v_pago_anterior.monto = round(p_nuevo_monto, 2)
    and v_pago_anterior.metodo_pago = p_metodo_pago
    and v_pago_anterior.facturado = p_facturado then
    raise exception 'Modifica el monto, el método o la condición de factura antes de guardar'
      using errcode = '23514';
  end if;

  if v_pago_anterior.monto <> round(p_nuevo_monto, 2)
    or v_pago_anterior.metodo_pago <> p_metodo_pago then
    v_pago_actualizado := public.modificar_pago_auditado(
      p_pago_id,
      p_nuevo_monto,
      p_metodo_pago,
      p_motivo
    );

    if v_pago_anterior.facturado <> p_facturado then
      update public.pagos
      set facturado = p_facturado
      where id = p_pago_id
      returning * into v_pago_actualizado;

      select id into v_auditoria_id
      from public.auditoria_pagos
      where pago_id = p_pago_id
        and modificado_por = auth.uid()
      order by fecha_modificacion desc, id desc
      limit 1;

      update public.auditoria_pagos
      set facturado_anterior = v_pago_anterior.facturado,
          facturado_nuevo = p_facturado
      where id = v_auditoria_id;
    end if;
  else
    update public.pagos
    set facturado = p_facturado
    where id = p_pago_id
    returning * into v_pago_actualizado;

    insert into public.auditoria_pagos (
      pago_id,
      monto_anterior,
      monto_nuevo,
      metodo_anterior,
      metodo_nuevo,
      facturado_anterior,
      facturado_nuevo,
      motivo,
      modificado_por
    ) values (
      p_pago_id,
      v_pago_anterior.monto,
      v_pago_anterior.monto,
      v_pago_anterior.metodo_pago,
      v_pago_anterior.metodo_pago,
      v_pago_anterior.facturado,
      p_facturado,
      trim(p_motivo),
      auth.uid()
    );
  end if;

  return v_pago_actualizado;
end;
$$;

revoke all on function public.modificar_pago_auditado(
  uuid, numeric, public.metodo_pago, boolean, text
) from public;
grant execute on function public.modificar_pago_auditado(
  uuid, numeric, public.metodo_pago, boolean, text
) to authenticated;

notify pgrst, 'reload schema';
