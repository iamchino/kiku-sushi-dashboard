-- ============================================================
-- 07 · DELIVERY · Cocina que faltaba (info traída desde carta)
--   Gyozas chiken teriyaki + Yakisobas (3) + Yakimeshis (3)
--   Precios = delivery/take away (los pasó Manu).
--   Imágenes = reusan las del bucket 'carta/' (ya subidas).
-- Add-only / idempotente: si el ítem ya existe, no lo duplica.
-- ============================================================
begin;

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Gyozas', NULL, 'Gyozas chiken teriyaki',
       '4 unidades de empanadillas de trigo japonesas, relleno de pollo y teriyaki. Selladas y al vapor. Acompañado de salsa teriyaki y negui.',
       13900, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-chiken-teriyaki.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Gyozas chiken teriyaki'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi Veggie',
       'Arroz salteado con vegetales, huevo y salsa de soja.',
       15000, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-veggie.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakimeshi Veggie'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi Cerdo',
       'Arroz salteado con vegetales, huevo, trozos de cerdo y salsa de soja.',
       16500, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-cerdo.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakimeshi Cerdo'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi de Langostinos',
       'Arroz salteado con vegetales, huevo, langostinos y salsa de soja. Espolvoreado con katsuobushi.',
       21500, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-de-langostinos.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakimeshi de Langostinos'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakisobas', 'Platos de cocina', 'Yakisoba Veggie',
       'Fideos salteados con vegetales y salsa yakisoba.',
       15000, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-veggie.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakisoba Veggie'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakisobas', 'Platos de cocina', 'Yakisoba de Cerdo',
       'Fideos salteados con vegetales, carne de cerdo y salsa yakisoba.',
       16500, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-de-cerdo.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakisoba de Cerdo'
);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
select 'delivery', 'Yakisobas', 'Platos de cocina', 'Yakisoba de Langostinos',
       'Fideos salteados con vegetales, langostinos y salsa yakisoba. Espolvoreado de katsuobushi.',
       21500, NULL, true, 200, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-de-langostinos.jpg'
where not exists (
  select 1 from public.menu_items where tipo='delivery' and nombre='Yakisoba de Langostinos'
);

commit;