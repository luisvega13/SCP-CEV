-- Preferencia fiscal del alumno para localizar a quienes solicitan factura habitualmente.

alter table public.alumnos
  add column if not exists factura_habitual boolean not null default false;

comment on column public.alumnos.factura_habitual is
  'Indica que el alumno o su responsable suele solicitar factura de sus pagos.';

create index if not exists alumnos_factura_habitual_idx
  on public.alumnos (factura_habitual)
  where factura_habitual;

create or replace function public.actualizar_preferencia_facturacion_alumno(
  p_alumno_id uuid,
  p_factura_habitual boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede actualizar la preferencia de facturación'
      using errcode = '42501';
  end if;

  if p_factura_habitual is null then
    raise exception 'Indica si el alumno suele solicitar factura'
      using errcode = '22004';
  end if;

  update public.alumnos
  set factura_habitual = p_factura_habitual
  where id = p_alumno_id;

  if not found then
    raise exception 'El alumno no existe'
      using errcode = 'P0002';
  end if;

  return p_factura_habitual;
end;
$$;

revoke all on function public.actualizar_preferencia_facturacion_alumno(uuid, boolean)
  from public;
grant execute on function public.actualizar_preferencia_facturacion_alumno(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';
