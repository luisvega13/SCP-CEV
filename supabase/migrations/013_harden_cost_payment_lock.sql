-- Validacion defensiva del bloqueo de costos.
-- Algunos pagos historicos pueden haber sido creados antes de nivel_cobro o
-- quedar asociados a un alumno cuyo nivel cambio. El bloqueo considera todas
-- las fuentes financieras disponibles para evitar recalculos destructivos.
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
  select
    exists (
      select 1
      from public.pagos as pago
      join public.alumnos as alumno
        on alumno.id = pago.alumno_id
      where public.ciclo_de_pago(pago.mes, pago.anio) = p_ciclo_escolar
        and (
          pago.nivel_cobro = p_nivel
          or alumno.nivel = p_nivel
          or exists (
            select 1
            from public.promociones_academicas as promocion
            where promocion.alumno_id = pago.alumno_id
              and promocion.ciclo_escolar = p_ciclo_escolar
              and promocion.nivel_nuevo = p_nivel
          )
        )
    )
    or exists (
      select 1
      from public.estado_cuenta as cuenta
      join public.alumnos as alumno
        on alumno.id = cuenta.alumno_id
      where alumno.nivel = p_nivel
        and cuenta.monto_pagado > 0
        and public.ciclo_de_pago(cuenta.mes, cuenta.anio) = p_ciclo_escolar
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

-- Permite comprobar el resultado desde el SQL Editor despues de la migracion:
-- select nivel, public.existen_pagos_nivel_ciclo(nivel, '2025-2026') bloqueado
-- from unnest(enum_range(null::public.nivel_escolar)) as nivel;
