-- ============================================================
-- 08 · SALÓN (carta) · Spicy roll que faltaba
--   '4 Spicy roll' ($12.100) y '8 Spicy roll' ($18.000 salón).
--   Imágenes = reusan las del bucket 'delivery/' (ya subidas).
-- Add-only / idempotente: si el ítem ya existe, no lo duplica.
-- ============================================================
begin;

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'carta', 'Rebozados', 'Apanados en panco y fritos', '4 Spicy roll',
       '4 pzas de rebozado envuelto en arroz sin alga, relleno de salmón rosado, palta y queso. Coronado de mayonesa spicy.',
       12100, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/delivery/4-spicy-roll.jpg'
where not exists (
  select 1 from public.menu_items where tipo='carta' and nombre='4 Spicy roll'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'carta', 'Rebozados', 'Apanados en panco y fritos', '8 Spicy roll',
       '8 pzas de roll rebozado envuelto en arroz sin alga, relleno de salmón rosado, palta y queso. Coronado de mayonesa spicy.',
       18000, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/delivery/8-spicy.jpg'
where not exists (
  select 1 from public.menu_items where tipo='carta' and nombre='8 Spicy roll'
);

commit;