-- Los pagos históricos pueden superar el costo configurado actualmente.
-- Conservamos el monto realmente pagado y calculamos el saldo con un mínimo de cero.
alter table public.estado_cuenta
  drop constraint if exists estado_cuenta_monto_pagado_no_excede_check;
