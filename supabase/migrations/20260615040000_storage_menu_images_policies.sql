-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Storage: permitir subir imágenes desde el dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- SÍNTOMA: al crear/editar un producto (deli/take) o un especial, SIN foto
--          guarda, pero CON foto falla. El formato (jpg/png) da igual.
--
-- CAUSA:   la subida va a Supabase Storage (bucket `menu-images`). Storage
--          también tiene RLS (sobre storage.objects) y al bucket le faltan las
--          policies de escritura para usuarios logueados. Las fotos que ya
--          están se subieron por script (service role, que saltea RLS), por eso
--          no se notaba. Desde el dashboard, el upload se rechaza.
--
-- Este script (idempotente, seguro de re-correr):
--   1. Asegura que el bucket `menu-images` exista y sea público (para mostrar).
--   2. Crea las policies de storage.objects: lectura pública + escritura para
--      usuarios autenticados (subir / reemplazar / borrar) en ese bucket.
--
-- Pegar tal cual en Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Bucket público ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

-- ─── 2. Policies sobre storage.objects para el bucket menu-images ───────────
-- (storage.objects ya tiene RLS activado por defecto en Supabase.)

-- Lectura pública: cualquiera puede ver las imágenes (web pública + dashboard).
drop policy if exists "menu-images lectura publica" on storage.objects;
create policy "menu-images lectura publica"
  on storage.objects
  for select
  to public
  using (bucket_id = 'menu-images');

-- Subir: cualquier usuario autenticado del dashboard.
drop policy if exists "menu-images subir (auth)" on storage.objects;
create policy "menu-images subir (auth)"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'menu-images');

-- Reemplazar (upsert usa update): el código sube con upsert=true.
drop policy if exists "menu-images reemplazar (auth)" on storage.objects;
create policy "menu-images reemplazar (auth)"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'menu-images')
  with check (bucket_id = 'menu-images');

-- Borrar: por si se limpia una imagen vieja desde el dashboard.
drop policy if exists "menu-images borrar (auth)" on storage.objects;
create policy "menu-images borrar (auth)"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'menu-images');

-- ─── 3. Diagnóstico ─────────────────────────────────────────────────────────
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'menu-images%'
order by policyname;
