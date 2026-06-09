-- ============================================================
-- 01 · DELIVERY · Productos que faltaban
--   a) Alta de '9 Philadelphia roll' (foto = la del de 5)
--   b) Foto de 'Nikkei 12 pzas' = la de 'Nikkei 15 pzas'
-- Add-only / idempotente. Requiere las columnas de badges
-- (01_alter_menu_items_badges.sql del salón). Por las dudas se
-- agregan con IF NOT EXISTS.
-- ============================================================
begin;

alter table public.menu_items
  add column if not exists picante      smallint not null default 0,
  add column if not exists vegano       boolean  not null default false,
  add column if not exists vegetariano  boolean  not null default false,
  add column if not exists sin_tacc     boolean  not null default false;

-- a) 9 Philadelphia roll  ($22.200) — misma foto que el de 5
insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Rolls de Sushi', NULL, '9 Philadelphia roll',
       'Relleno de salmón y queso. Envuelto en alga nori y arroz. Cubierto de sésamo blanco.',
       22200, NULL, true, 28, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/delivery/5-philadelphia-roll.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='9 Philadelphia roll'
);

-- b) Foto del Nikkei 12 pzas = misma que el Nikkei 15 pzas
update public.menu_items
   set imagen_url = 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/delivery/nikkei-15-pzas.jpg'
 where tipo='delivery' and nombre='Nikkei 12 pzas';

commit;
