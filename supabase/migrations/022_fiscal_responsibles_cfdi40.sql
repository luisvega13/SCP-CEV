-- Expediente fiscal relacional de responsables para CFDI 4.0 (México).
-- Los catálogos conservan las claves SAT; deben revisarse cuando el SAT
-- publique una nueva versión de sus catálogos.
do $$ begin
  create type public.tipo_persona_fiscal as enum ('fisica', 'moral');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.relacion_responsable_fiscal as enum (
    'madre', 'padre', 'tutor', 'alumno', 'empresa', 'otro'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.catalogo_regimenes_fiscales (
  clave text primary key check (clave ~ '^\d{3}$'),
  descripcion text not null,
  aplica_fisica boolean not null default false,
  aplica_moral boolean not null default false,
  activo boolean not null default true
);

insert into public.catalogo_regimenes_fiscales
  (clave, descripcion, aplica_fisica, aplica_moral)
values
  ('601', 'General de Ley Personas Morales', false, true),
  ('603', 'Personas Morales con Fines no Lucrativos', false, true),
  ('605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', true, false),
  ('606', 'Arrendamiento', true, false),
  ('607', 'Régimen de Enajenación o Adquisición de Bienes', true, false),
  ('608', 'Demás ingresos', true, false),
  ('610', 'Residentes en el Extranjero sin Establecimiento Permanente en México', true, true),
  ('611', 'Ingresos por Dividendos (socios y accionistas)', true, false),
  ('612', 'Personas Físicas con Actividades Empresariales y Profesionales', true, false),
  ('614', 'Ingresos por intereses', true, false),
  ('615', 'Régimen de los ingresos por obtención de premios', true, false),
  ('616', 'Sin obligaciones fiscales', true, false),
  ('620', 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', false, true),
  ('621', 'Incorporación Fiscal', true, false),
  ('622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', true, true),
  ('623', 'Opcional para Grupos de Sociedades', false, true),
  ('624', 'Coordinados', false, true),
  ('625', 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', true, false),
  ('626', 'Régimen Simplificado de Confianza', true, true)
on conflict (clave) do update set
  descripcion = excluded.descripcion,
  aplica_fisica = excluded.aplica_fisica,
  aplica_moral = excluded.aplica_moral,
  activo = true;

create table if not exists public.catalogo_usos_cfdi (
  clave text primary key check (clave ~ '^[A-Z]{1,2}\d{2}$'),
  descripcion text not null,
  aplica_fisica boolean not null default false,
  aplica_moral boolean not null default false,
  activo boolean not null default true
);

insert into public.catalogo_usos_cfdi
  (clave, descripcion, aplica_fisica, aplica_moral)
values
  ('G01', 'Adquisición de mercancías', true, true),
  ('G02', 'Devoluciones, descuentos o bonificaciones', true, true),
  ('G03', 'Gastos en general', true, true),
  ('I01', 'Construcciones', true, true),
  ('I02', 'Mobiliario y equipo de oficina por inversiones', true, true),
  ('I03', 'Equipo de transporte', true, true),
  ('I04', 'Equipo de cómputo y accesorios', true, true),
  ('I05', 'Dados, troqueles, moldes, matrices y herramental', true, true),
  ('I06', 'Comunicaciones telefónicas', true, true),
  ('I07', 'Comunicaciones satelitales', true, true),
  ('I08', 'Otra maquinaria y equipo', true, true),
  ('D01', 'Honorarios médicos, dentales y gastos hospitalarios', true, false),
  ('D02', 'Gastos médicos por incapacidad o discapacidad', true, false),
  ('D03', 'Gastos funerales', true, false),
  ('D04', 'Donativos', true, false),
  ('D05', 'Intereses reales efectivamente pagados por créditos hipotecarios', true, false),
  ('D06', 'Aportaciones voluntarias al SAR', true, false),
  ('D07', 'Primas por seguros de gastos médicos', true, false),
  ('D08', 'Gastos de transportación escolar obligatoria', true, false),
  ('D09', 'Depósitos en cuentas para el ahorro y primas de pensiones', true, false),
  ('D10', 'Pagos por servicios educativos (colegiaturas)', true, false),
  ('S01', 'Sin efectos fiscales', true, true),
  ('CP01', 'Pagos', true, true),
  ('CN01', 'Nómina', true, false)
on conflict (clave) do update set
  descripcion = excluded.descripcion,
  aplica_fisica = excluded.aplica_fisica,
  aplica_moral = excluded.aplica_moral,
  activo = true;

create table if not exists public.responsables_fiscales (
  id uuid primary key default gen_random_uuid(),
  tipo_persona public.tipo_persona_fiscal not null,
  rfc text not null unique,
  nombre_razon_social text not null,
  codigo_postal_fiscal text not null,
  regimen_fiscal text not null references public.catalogo_regimenes_fiscales(clave),
  uso_cfdi_predeterminado text not null references public.catalogo_usos_cfdi(clave),
  correo_facturacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint responsables_fiscales_rfc_check check (
    rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  ),
  constraint responsables_fiscales_nombre_check check (
    char_length(trim(nombre_razon_social)) between 2 and 254
  ),
  constraint responsables_fiscales_cp_check check (
    codigo_postal_fiscal ~ '^[0-9]{5}$'
  ),
  constraint responsables_fiscales_correo_check check (
    correo_facturacion is null
    or correo_facturacion ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create table if not exists public.alumnos_responsables_fiscales (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos(id) on delete cascade,
  responsable_fiscal_id uuid not null references public.responsables_fiscales(id) on delete restrict,
  relacion public.relacion_responsable_fiscal not null,
  es_predeterminado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (alumno_id, responsable_fiscal_id)
);

create unique index if not exists alumnos_responsable_fiscal_predeterminado_idx
  on public.alumnos_responsables_fiscales (alumno_id)
  where es_predeterminado;
create index if not exists alumnos_responsables_fiscales_responsable_idx
  on public.alumnos_responsables_fiscales (responsable_fiscal_id);

create table if not exists public.auditoria_responsables_fiscales (
  id uuid primary key default gen_random_uuid(),
  responsable_fiscal_id uuid not null,
  datos_anteriores jsonb,
  datos_nuevos jsonb not null,
  modificado_por uuid references auth.users(id) on delete set null,
  fecha_modificacion timestamptz not null default now()
);

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

drop trigger if exists validar_responsable_fiscal on public.responsables_fiscales;
create trigger validar_responsable_fiscal
  before insert or update on public.responsables_fiscales
  for each row execute function public.validar_responsable_fiscal();

create or replace function public.auditar_responsable_fiscal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria_responsables_fiscales (
    responsable_fiscal_id, datos_anteriores, datos_nuevos, modificado_por
  ) values (
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists auditar_responsable_fiscal on public.responsables_fiscales;
create trigger auditar_responsable_fiscal
  after insert or update on public.responsables_fiscales
  for each row execute function public.auditar_responsable_fiscal();

alter table public.responsables_fiscales enable row level security;
alter table public.responsables_fiscales force row level security;
alter table public.alumnos_responsables_fiscales enable row level security;
alter table public.alumnos_responsables_fiscales force row level security;
alter table public.auditoria_responsables_fiscales enable row level security;
alter table public.auditoria_responsables_fiscales force row level security;

revoke all on public.responsables_fiscales from anon;
revoke all on public.alumnos_responsables_fiscales from anon;
revoke all on public.auditoria_responsables_fiscales from anon;
revoke insert, update, delete on public.responsables_fiscales from authenticated;
revoke insert, update, delete on public.alumnos_responsables_fiscales from authenticated;
revoke insert, update, delete on public.auditoria_responsables_fiscales from authenticated;
grant select on public.responsables_fiscales to authenticated;
grant select on public.alumnos_responsables_fiscales to authenticated;
grant select on public.auditoria_responsables_fiscales to authenticated;
grant select on public.catalogo_regimenes_fiscales to authenticated;
grant select on public.catalogo_usos_cfdi to authenticated;

alter table public.catalogo_regimenes_fiscales enable row level security;
alter table public.catalogo_regimenes_fiscales force row level security;
alter table public.catalogo_usos_cfdi enable row level security;
alter table public.catalogo_usos_cfdi force row level security;
revoke all on public.catalogo_regimenes_fiscales from anon;
revoke all on public.catalogo_usos_cfdi from anon;
drop policy if exists "Usuarios autenticados consultan regimenes fiscales"
  on public.catalogo_regimenes_fiscales;
create policy "Usuarios autenticados consultan regimenes fiscales"
  on public.catalogo_regimenes_fiscales for select to authenticated
  using (true);
drop policy if exists "Usuarios autenticados consultan usos CFDI"
  on public.catalogo_usos_cfdi;
create policy "Usuarios autenticados consultan usos CFDI"
  on public.catalogo_usos_cfdi for select to authenticated
  using (true);

drop policy if exists "Administradores consultan responsables fiscales" on public.responsables_fiscales;
create policy "Administradores consultan responsables fiscales"
  on public.responsables_fiscales for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Administradores consultan relaciones fiscales" on public.alumnos_responsables_fiscales;
create policy "Administradores consultan relaciones fiscales"
  on public.alumnos_responsables_fiscales for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Administradores consultan auditoria fiscal" on public.auditoria_responsables_fiscales;
create policy "Administradores consultan auditoria fiscal"
  on public.auditoria_responsables_fiscales for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.guardar_responsable_fiscal_alumno(
  p_alumno_id uuid,
  p_responsable_id uuid,
  p_tipo_persona public.tipo_persona_fiscal,
  p_rfc text,
  p_nombre_razon_social text,
  p_codigo_postal_fiscal text,
  p_regimen_fiscal text,
  p_uso_cfdi text,
  p_correo_facturacion text,
  p_relacion public.relacion_responsable_fiscal,
  p_es_predeterminado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_responsable public.responsables_fiscales;
  v_relacion public.alumnos_responsables_fiscales;
  v_es_primero boolean;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo un administrador puede guardar información fiscal'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.alumnos where id = p_alumno_id) then
    raise exception 'El alumno no existe' using errcode = 'P0002';
  end if;

  if p_responsable_id is not null then
    if not exists (
      select 1 from public.alumnos_responsables_fiscales
      where alumno_id = p_alumno_id
        and responsable_fiscal_id = p_responsable_id
    ) then
      raise exception 'El responsable fiscal no está relacionado con este alumno'
        using errcode = '42501';
    end if;
    update public.responsables_fiscales set
      tipo_persona = p_tipo_persona,
      rfc = p_rfc,
      nombre_razon_social = p_nombre_razon_social,
      codigo_postal_fiscal = p_codigo_postal_fiscal,
      regimen_fiscal = p_regimen_fiscal,
      uso_cfdi_predeterminado = p_uso_cfdi,
      correo_facturacion = p_correo_facturacion
    where id = p_responsable_id
    returning * into v_responsable;
  else
    select * into v_responsable from public.responsables_fiscales
    where rfc = upper(regexp_replace(trim(p_rfc), '[[:space:]-]', '', 'g'))
    for update;
    if found then
      update public.responsables_fiscales set
        tipo_persona = p_tipo_persona,
        nombre_razon_social = p_nombre_razon_social,
        codigo_postal_fiscal = p_codigo_postal_fiscal,
        regimen_fiscal = p_regimen_fiscal,
        uso_cfdi_predeterminado = p_uso_cfdi,
        correo_facturacion = p_correo_facturacion
      where id = v_responsable.id
      returning * into v_responsable;
    else
      insert into public.responsables_fiscales (
        tipo_persona, rfc, nombre_razon_social, codigo_postal_fiscal,
        regimen_fiscal, uso_cfdi_predeterminado, correo_facturacion
      ) values (
        p_tipo_persona, p_rfc, p_nombre_razon_social, p_codigo_postal_fiscal,
        p_regimen_fiscal, p_uso_cfdi, p_correo_facturacion
      ) returning * into v_responsable;
    end if;
  end if;

  select not exists (
    select 1 from public.alumnos_responsables_fiscales
    where alumno_id = p_alumno_id
  ) into v_es_primero;

  if p_es_predeterminado or v_es_primero then
    update public.alumnos_responsables_fiscales
    set es_predeterminado = false
    where alumno_id = p_alumno_id;
  end if;

  insert into public.alumnos_responsables_fiscales (
    alumno_id, responsable_fiscal_id, relacion, es_predeterminado
  ) values (
    p_alumno_id, v_responsable.id, p_relacion,
    p_es_predeterminado or v_es_primero
  )
  on conflict (alumno_id, responsable_fiscal_id)
  do update set
    relacion = excluded.relacion,
    es_predeterminado = case
      when p_es_predeterminado then true
      else public.alumnos_responsables_fiscales.es_predeterminado
    end
  returning * into v_relacion;

  return jsonb_build_object(
    'relation_id', v_relacion.id,
    'responsible_id', v_responsable.id
  );
end;
$$;

revoke all on function public.guardar_responsable_fiscal_alumno(
  uuid, uuid, public.tipo_persona_fiscal, text, text, text, text, text,
  text, public.relacion_responsable_fiscal, boolean
) from public;
grant execute on function public.guardar_responsable_fiscal_alumno(
  uuid, uuid, public.tipo_persona_fiscal, text, text, text, text, text,
  text, public.relacion_responsable_fiscal, boolean
) to authenticated;

-- Fuerza a PostgREST a reconocer inmediatamente tablas, relaciones y RPC.
grant usage on schema public to authenticated;
notify pgrst, 'reload schema';
