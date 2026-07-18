-- Indices para las consultas de navegación más frecuentes.
-- No modifican datos ni políticas RLS.
create index if not exists alumnos_nombre_orden_idx
  on public.alumnos (apellido_paterno, apellido_materno, nombre);

create index if not exists pagos_fecha_desc_idx
  on public.pagos (fecha_pago desc);
