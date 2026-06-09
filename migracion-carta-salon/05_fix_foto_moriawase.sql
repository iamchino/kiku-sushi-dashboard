-- ============================================================
-- 05 · '8 Moriawase de sashimis' usa la MISMA foto que la de 12 pzas
-- (su asset propio estaba caido en Cloudinary).
-- ============================================================
update public.menu_items
   set imagen_url = 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/12-moriawase-de-sashimis.jpg'
 where tipo='carta' and nombre='8 Moriawase de sashimis';
