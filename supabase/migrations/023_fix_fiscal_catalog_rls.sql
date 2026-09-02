-- Los catálogos SAT no contienen información personal. Se permite su lectura
-- a cualquier sesión autenticada, mientras las escrituras siguen reservadas
-- para migraciones/administración de base de datos.
alter table public.catalogo_regimenes_fiscales enable row level security;
alter table public.catalogo_regimenes_fiscales force row level security;
alter table public.catalogo_usos_cfdi enable row level security;
alter table public.catalogo_usos_cfdi force row level security;

revoke all on table public.catalogo_regimenes_fiscales from anon;
revoke all on table public.catalogo_usos_cfdi from anon;
revoke insert, update, delete on table public.catalogo_regimenes_fiscales
  from authenticated;
revoke insert, update, delete on table public.catalogo_usos_cfdi
  from authenticated;
grant select on table public.catalogo_regimenes_fiscales to authenticated;
grant select on table public.catalogo_usos_cfdi to authenticated;

drop policy if exists "Usuarios autenticados consultan regimenes fiscales"
  on public.catalogo_regimenes_fiscales;
create policy "Usuarios autenticados consultan regimenes fiscales"
  on public.catalogo_regimenes_fiscales
  for select
  to authenticated
  using (true);

drop policy if exists "Usuarios autenticados consultan usos CFDI"
  on public.catalogo_usos_cfdi;
create policy "Usuarios autenticados consultan usos CFDI"
  on public.catalogo_usos_cfdi
  for select
  to authenticated
  using (true);

notify pgrst, 'reload schema';
