-- Plantilla administrable para los recordatorios de cartera enviados por WhatsApp.

create table if not exists public.configuracion_mensajes (
  clave text primary key,
  plantilla text not null check (char_length(btrim(plantilla)) between 1 and 4000),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.configuracion_mensajes enable row level security;

insert into public.configuracion_mensajes (clave, plantilla)
values (
  'recordatorio_whatsapp_adeudo',
  E'Hola {{nombre_tutor}}. Le enviamos un recordatorio del estado de cuenta de {{nombre_alumno}}. El saldo vencido total es de {{monto_total}}, correspondiente a:\n\n{{detalle_adeudo}}\n\nSi ya realizó alguno de estos pagos, por favor ignore este mensaje o comuníquese con administración para una aclaración.'
)
on conflict (clave) do nothing;

create or replace function public.obtener_plantilla_recordatorio_whatsapp()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plantilla text;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede consultar la plantilla de WhatsApp'
      using errcode = '42501';
  end if;

  select cm.plantilla
  into v_plantilla
  from public.configuracion_mensajes cm
  where cm.clave = 'recordatorio_whatsapp_adeudo';

  if v_plantilla is null then
    raise exception 'No se encontró la plantilla de recordatorio de WhatsApp';
  end if;
  return v_plantilla;
end;
$$;

create or replace function public.actualizar_plantilla_recordatorio_whatsapp(
  p_plantilla text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plantilla text := btrim(coalesce(p_plantilla, ''));
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede modificar la plantilla de WhatsApp'
      using errcode = '42501';
  end if;
  if char_length(v_plantilla) < 1 then
    raise exception 'El mensaje no puede quedar vacío' using errcode = '22023';
  end if;
  if char_length(v_plantilla) > 4000 then
    raise exception 'El mensaje no puede superar los 4000 caracteres' using errcode = '22023';
  end if;

  insert into public.configuracion_mensajes (
    clave,
    plantilla,
    updated_at,
    updated_by
  ) values (
    'recordatorio_whatsapp_adeudo',
    v_plantilla,
    now(),
    auth.uid()
  )
  on conflict (clave) do update
  set plantilla = excluded.plantilla,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return v_plantilla;
end;
$$;

revoke all on table public.configuracion_mensajes from anon, authenticated;
revoke all on function public.obtener_plantilla_recordatorio_whatsapp() from public;
revoke all on function public.actualizar_plantilla_recordatorio_whatsapp(text) from public;
grant execute on function public.obtener_plantilla_recordatorio_whatsapp() to authenticated;
grant execute on function public.actualizar_plantilla_recordatorio_whatsapp(text) to authenticated;

notify pgrst, 'reload schema';
