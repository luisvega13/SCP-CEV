-- Mensajes claros para RFC inválidos antes de llegar al CHECK de la tabla.
create or replace function public.validar_responsable_fiscal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regimen_valido boolean;
  v_uso_valido boolean;
begin
  new.rfc := upper(regexp_replace(trim(new.rfc), '[[:space:]-]', '', 'g'));
  new.nombre_razon_social := upper(trim(new.nombre_razon_social));
  new.codigo_postal_fiscal := trim(new.codigo_postal_fiscal);
  new.correo_facturacion := nullif(lower(trim(coalesce(new.correo_facturacion, ''))), '');
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.tipo_persona = 'fisica'
    and new.rfc !~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$' then
    raise exception 'RFC inválido para persona física. Debe tener 13 caracteres con formato AAAA######XXX'
      using errcode = '23514';
  end if;
  if new.tipo_persona = 'moral'
    and new.rfc !~ '^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$' then
    raise exception 'RFC inválido para persona moral. Debe tener 12 caracteres con formato AAA######XXX'
      using errcode = '23514';
  end if;

  select case when new.tipo_persona = 'fisica' then aplica_fisica else aplica_moral end
  into v_regimen_valido
  from public.catalogo_regimenes_fiscales
  where clave = new.regimen_fiscal and activo;
  if not coalesce(v_regimen_valido, false) then
    raise exception 'El régimen fiscal seleccionado no corresponde al tipo de persona'
      using errcode = '23514';
  end if;

  select case when new.tipo_persona = 'fisica' then aplica_fisica else aplica_moral end
  into v_uso_valido
  from public.catalogo_usos_cfdi
  where clave = new.uso_cfdi_predeterminado and activo;
  if not coalesce(v_uso_valido, false) then
    raise exception 'El uso de CFDI seleccionado no corresponde al tipo de persona'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
