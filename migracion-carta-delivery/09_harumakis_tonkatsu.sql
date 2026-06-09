-- ============================================================
-- 09 · DELIVERY · Harumakis tonkatsu + Tonkatsu (desde carta)
--   Precios delivery/take away (Manu): $11.500 y $21.000.
--   Imágenes reusan el bucket 'carta/'. Add-only / idempotente.
-- ============================================================
begin;

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url, picante)
select 'delivery', 'Harumakis', NULL, 'Harumakis tonkatsu',
       '4 unidades de arrollados primavera de tonkatsu (milanesa de cerdo) fritos. Acompañado de salsa china agridulce.',
       11500, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/harumakis-tonkatsu.jpg', 1
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Harumakis tonkatsu'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url, picante)
select 'delivery', 'Tonkatsu', NULL, 'Tonkatsu',
       'Carré de cerdo rebozado en panko y salsa tonkatsu. Acompañado de arroz al vapor y repollo en juliana.',
       21000, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tonkatsu.jpg', 0
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Tonkatsu'
);

commit;