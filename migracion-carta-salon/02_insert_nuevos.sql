-- ============================================================
-- 02 · ALTA de los 40 items NUEVOS (add-only, idempotente).
-- Requiere 01. descripcion NOT NULL -> '' si vacio.
-- '8 Moriawase de sashimis' sin imagen propia (ver 05 para la foto).
-- ============================================================
begin;

insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Harumakis', 'Arrollados primavera · 4 unidades', 'Harumakis veggie', '4 unidades de arrollados primavera de vegetales (zanahoria, repollo, cebolla) fritos. Acompañado de salsa china agridulce.', 11500, NULL, true, 18, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/harumakis-veggie.jpg', 0, true, true, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Harumakis veggie');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Harumakis', 'Arrollados primavera · 4 unidades', 'Harumakis tonkatsu', '4 unidades de arrollados primavera de tonkatsu (milanesa de cerdo) fritos. Acompañado de salsa china agridulce.', 11500, NULL, true, 19, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/harumakis-tonkatsu.jpg', 1, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Harumakis tonkatsu');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Causas Limeñas', NULL, 'Causa Limeña de Salmón', 'Puré de papa y ají amarillo. Relleno de huevo, cebolla morada y mayo. Sobre colchón de palta fresca.', 22000, NULL, true, 33, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/causa-limena-de-salmon.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Causa Limeña de Salmón');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Causas Limeñas', NULL, 'Causa Limeña de Langostinos', 'Puré de papa y ají amarillo. Relleno de huevo, cebolla morada y mayo. Sobre colchón de palta fresca.', 21500, NULL, true, 34, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/causa-limena-de-langostinos.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Causa Limeña de Langostinos');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Causas Limeñas', NULL, 'Causa Limeña de Centolla', 'Puré de papa y ají amarillo. Relleno de huevo, cebolla morada y mayo. Sobre colchón de palta fresca.', 26000, NULL, true, 35, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/causa-limena-de-centolla.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Causa Limeña de Centolla');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Causas Limeñas', NULL, 'Causa Limeña Veggie', 'Puré de papa y ají amarillo. Relleno de huevo, cebolla morada y mayo. Sobre colchón de palta fresca.', 13000, NULL, true, 36, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/causa-limena-veggie.jpg', 0, false, true, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Causa Limeña Veggie');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Carpaccios', NULL, 'Carpaccio de Salmón y Atún Rojo', 'Láminas finas de salmón y atún rojo. Coronados con aceite de oliva y cítricos. Rodajas de rabanitos y durazno sellado. Trozos de higo. Polvo de pistacho.', 22000, NULL, true, 37, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/carpaccio-de-salmon-y-atun-rojo.jpg', 0, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Carpaccio de Salmón y Atún Rojo');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Carpaccios', NULL, 'Carpaccio de Langostinos Blancos', 'Láminas finas de langostinos. Coronados con aceite de oliva y cilantro, lima, mango y crocante de almendras.', 22000, NULL, true, 38, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/carpaccio-de-langostinos-blancos.jpg', 0, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Carpaccio de Langostinos Blancos');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ceviches', NULL, 'Ceviche de pesca blanca', 'Marinada de pesca blanca en leche de tigre. Coronado con maíz peruano morado, plátano frito, maíz chulpi, cebolla morada y ajíes.', 19500, NULL, true, 39, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ceviche-de-pesca-blanca.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ceviche de pesca blanca');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ceviches', NULL, 'Ceviche mixto', 'Marinada de pesca blanca y langostinos en leche de tigre confitada. Coronado de boniato, maíz chulpi, cebolla morada y ajíes.', 19000, NULL, true, 40, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ceviche-mixto.jpg', 2, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ceviche mixto');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ceviches', NULL, 'Ceviche Frito', 'Trozos de pesca blanca, previamente marinado en cítrico, rebozado en panco. Coronado de salsa acevichada, cebolla morada, ajíes y maíz chulpi.', 16000, NULL, true, 41, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ceviche-frito.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ceviche Frito');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Tiraditos', NULL, 'Tiradito de pejerrey', 'Láminas de pejerrey en leche confitada. Aliñado en aceites cítricos. Coronado en trozos de palta y ananá sellados.', 23000, NULL, true, 45, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tiradito-de-pejerrey.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Tiradito de pejerrey');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Tiraditos', NULL, 'Papas a la huancaína y pulpo', 'Papas bañadas en salsa de ajíes peruano y polvo de aceitunas negras. Coronado con trozos de pulpo sellado.', 22000, NULL, true, 46, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/papas-a-la-huancaina-y-pulpo.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Papas a la huancaína y pulpo');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas', NULL, 'Ensalada sunomono de salmón', 'Ensalada de pepino aliñado en Su (vinagreta dulce). Top de sésamos tostados. Coronado de trozos de salmón.', 18000, NULL, true, 47, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-sunomono-de-salmon.jpg', 0, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada sunomono de salmón');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas', NULL, 'Ensalada sunomono tofu', 'Ensalada de pepino aliñado en Su (vinagreta dulce). Top de sésamos tostados. Coronado de trozos de tofu marinado.', 16000, NULL, true, 48, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-sunomono-tofu.jpg', 0, true, true, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada sunomono tofu');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas', NULL, 'Ensalada de centolla', 'Hojas de estación, pepino, zanahoria y repollo. Coronado de mayo japo y centolla al limón.', 18000, NULL, true, 49, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-de-centolla.jpg', 1, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada de centolla');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas de Gyozas', NULL, 'Ensalada de gyozas veggie', 'Hojas de estación, pepino machacado, zanahorias y rabanitos. Aliñado con aceites cítricos. Acompañado de gyozas selladas y al vapor.', 14000, NULL, true, 50, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-de-gyozas-veggie.jpg', 0, true, true, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada de gyozas veggie');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas de Gyozas', NULL, 'Ensalada de gyozas de cerdo', 'Hojas de estación, pepino machacado, zanahorias y rabanitos. Aliñado con aceites cítricos. Acompañado de gyozas selladas y al vapor.', 15000, NULL, true, 51, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-de-gyozas-de-cerdo.jpg', 1, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada de gyozas de cerdo');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Ensaladas de Gyozas', NULL, 'Ensalada de gyozas de ternera', 'Hojas de estación, pepino machacado, zanahorias y rabanitos. Aliñado con aceites cítricos. Acompañado de gyozas selladas y al vapor.', 16000, NULL, true, 52, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/ensalada-de-gyozas-de-ternera.jpg', 1, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Ensalada de gyozas de ternera');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Tatakis', NULL, 'Tataki de Atún Rojo', 'Trozos de atún rojo, sellado brevemente (marcado por fuera, crudo por dentro). Cubierto de sésamo. Sobre emulsión de palta y wasabi.', 18000, NULL, true, 53, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tataki-de-atun-rojo.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Tataki de Atún Rojo');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Rolls de Sushi', NULL, '9 maguro roll', 'Tartar de atún rojo y paltas selladas. Semicubierto de salmón, coronado de salsa brava.', 20000, NULL, true, 58, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/9-maguro-roll.jpg', 3, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='9 maguro roll');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Rolls de Sushi', NULL, '9 Momo ebi roll', 'Langostinos rancheros, queso y manzana en juliana. Semicubierto en láminas de durazno tibio, coronado en salsa acevichada y trozos de pistachos.', 18000, NULL, true, 59, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/9-momo-ebi-roll.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='9 Momo ebi roll');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Rolls de Sushi', NULL, '4 Maki ceviche roll', 'Langos furai, queso y palta. Envuelto en arroz y alga por fuera. Apanado y frito. Coronado de ceviche de pesca blanca, ajíes, cilantro.', 18000, NULL, true, 60, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/4-maki-ceviche-roll.jpg', 2, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='4 Maki ceviche roll');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Sashimis', 'Moriawases', '12 Moriawase de sashimis', 'Variedad de cortes de salmón, langostinos, atún rojo y pulpo.', 32600, NULL, true, 61, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/12-moriawase-de-sashimis.jpg', 0, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='12 Moriawase de sashimis');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Sashimis', 'Moriawases', '8 Moriawase de sashimis', 'Variedad de cortes de salmón, langostinos, atún rojo y pulpo.', 22000, NULL, true, 62, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='8 Moriawase de sashimis');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Niguiris', 'Moriawases', '12 Moriawase de niguiris', 'Variedad de bocado de arroz y láminas de salmón, langostinos, pulpo y pesca blanca.', 32600, NULL, true, 63, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/12-moriawase-de-niguiris.jpg', 0, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='12 Moriawase de niguiris');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Niguiris', 'Moriawases', '8 Moriawase de niguiris', 'Variedad de bocado de arroz y láminas de salmón, langostinos, pulpo y pesca blanca.', 22000, NULL, true, 64, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/8-moriawase-de-niguiris.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='8 Moriawase de niguiris');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Pescados', 'Platos de cocina', 'Trucha A La Plancha', 'Sellado en manteca especiada. Acompañado de ensalada de estación tibia.', 25000, NULL, true, 66, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/trucha-a-la-plancha.jpg', 1, false, false, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Trucha A La Plancha');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Pescados', 'Platos de cocina', 'Pesca blanca a la plancha y setas', 'Pesca blanca a la plancha con salsa de setas, acompañada de arroz gohan.', 23000, NULL, true, 67, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/pesca-blanca-a-la-plancha-y-setas.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Pesca blanca a la plancha y setas');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Pescados', 'Platos de cocina', 'Pulpo con Salsa Brava', 'Grillado con aceite de pimentón ahumado acompañado de papines y salsa brava | Papas huancaína, coronado de polvo de aceituna.', 33000, NULL, true, 68, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Pulpo con Salsa Brava');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Tonkatsu', NULL, 'Tonkatsu', 'Carré de cerdo rebozado en panko y salsa tonkatsu. Acompañado de arroz al vapor y repollo en juliana.', 22000, NULL, true, 78, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tonkatsu.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Tonkatsu');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Yakitoris', NULL, 'Yakitori de Langostinos y hongos', 'Arroz gohan acompañado de pinchos anticucheros de langostinos y hongos.', 17000, NULL, true, 79, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakitori-de-langostinos-y-hongos.jpg', 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Yakitori de Langostinos y hongos');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Yakitoris', NULL, 'Yakitori Veggie', 'Arroz gohan acompañado de pinchos anticucheros de hongos y zucchinis.', 15500, NULL, true, 80, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakitori-veggie.jpg', 1, true, true, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Yakitori Veggie');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Acompañamientos', NULL, 'Arroz shari', 'Al vapor y aderezado.', 8000, NULL, true, 81, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/arroz-shari.jpg', 0, true, true, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Arroz shari');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Acompañamientos', NULL, 'Arroz gohan', 'Arroz al vapor sin aderezo. Acompañado de furikake japonés (opcional).', 8000, NULL, true, 82, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/arroz-gohan.jpg', 0, true, true, true
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Arroz gohan');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Bebidas sin alcohol', NULL, 'Agua saborizada', '', 3700, NULL, true, 89, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Agua saborizada');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Cervezas', NULL, 'Cerveza Orion Lata', 'Internacional Rice Lager. Okinawa, arroz y maíz. Japón.', 8500, NULL, true, 106, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Cerveza Orion Lata');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Chardonnay', '', 27000, NULL, true, 123, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Escorihuela Gascón Chardonnay');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Malbec', '', 28000, NULL, true, 125, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Escorihuela Gascón Malbec');
insert into public.menu_items (tipo,categoria,subtitulo,nombre,descripcion,precio,etiqueta,activo,orden,imagen_url,picante,vegano,vegetariano,sin_tacc)
select 'carta', 'Vinos · Rutini Wines', 'Espumantes', 'Rutini Encuentro Brut Nature Pinot Noir', '', 55000, NULL, true, 132, NULL, 0, false, false, false
where not exists (select 1 from public.menu_items where tipo='carta' and nombre='Rutini Encuentro Brut Nature Pinot Noir');

commit;