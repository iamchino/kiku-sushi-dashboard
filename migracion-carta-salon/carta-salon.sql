-- ============================================================
-- Importacion de CARTA SALON - Kiku Sushi
-- Productos: 95  (con imagen: 57)
-- Ejecutar en: Supabase -> SQL Editor -> New query -> Run
-- imagen_url -> bucket menu-images/carta/<slug>.jpg
-- ============================================================

begin;

-- ------------------------------------------------------------
-- REEMPLAZO SEGURO de la carta salon anterior.
-- (Si solo queres AGREGAR sin tocar lo existente, borra estas dos sentencias.)
-- No se pueden borrar items con pedidos (FK pedido_items):
--   1) ocultamos los referenciados (preserva historial)
--   2) borramos solo los no referenciados
-- ------------------------------------------------------------
update public.menu_items
   set activo = false
 where tipo = 'carta'
   and id in (select menu_item_id from public.pedido_items where menu_item_id is not null);

delete from public.menu_items
 where tipo = 'carta'
   and id not in (select menu_item_id from public.pedido_items where menu_item_id is not null);

insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
values
  ('carta', 'Especiales de Temporada', NULL, 'Kiku Otoñal', '2 pzas rebozadas (korokke, langostinos furai o harumaki) + 8 pzas de sushi omakase + bebida (cerveza, gaseosa o copa de vino). No se combinan variedades.', 30000, NULL, true, 0, NULL),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Kiku 12 pzas', 'Sin sashimi • Ebi Roll | Philadelphia Roll | Ahumado Roll | New York Roll', 31900, NULL, true, 1, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/kiku-12-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Kiku 15 pzas', 'Ebi Roll | Philadelphia Roll | Ahumado Roll | New York Roll | Sashimi', 34600, NULL, true, 2, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/kiku-15-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Fusión 12 pzas', 'Sin tiradito de Salmón • Sake Roll | Tartar Sake Roll | Guacamole Roll | Ebi Roll | Spicy Roll', 30200, NULL, true, 3, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/fusion-12-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Fusión 15 pzas', 'Tiradito de Salmón | Sake Roll | Tartar Sake Roll | Guacamole Roll | Ebi Roll | Spicy Roll', 31700, NULL, true, 4, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/fusion-15-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Nikkei 12 pzas', 'Sin Tiradito de Pulpo • Sake Roll | Tempura Roll | Acevichado Roll | Ebi Roll | Nikkei Roll', 35000, NULL, true, 5, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/nikkei-12-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Nikkei 15 pzas', 'Tiradito de Pulpo | Sake Roll | Tempura Roll | Acevichado Roll | Ebi Roll | Nikkei Roll', 38000, NULL, true, 6, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/nikkei-15-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Exotic 12 pzas', 'Phila Nipón Roll | Fancy Roll | Ebi Mango Roll | Niguiri Thai | Tiradito Nipón', 27600, NULL, true, 7, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/exotic-12-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Exotic 15 pzas', 'Phila Nipón Roll | Fancy Roll | Ebi Mango Roll | Niguiri Thai | Tiradito Nipón', 32000, NULL, true, 8, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/exotic-15-pzas.jpg'),
  ('carta', 'Combinados', 'Surtidos de 12 y 15 piezas', 'Veggie 15 pzas', 'Ponzu Roll | Maki Vegan Roll | Bajiru Roll | Arrolladitos Primavera Veggie. Ponzu Roll: relleno de hongos confitados, rúcula, zanahoria y tomates en juliana, envuelto en alga nori y arroz, cubierto de un colchón de paltas, bañado en salsa ponzu. Maki Vegan Roll: arroz relleno de guacamole y espinaca, cubierto de alga nori, con top de tartar vegano (mayonesa spicy y chauchas). Bajiru Roll: relleno de queso, mix de tomates confitados y albahaca fresca, envuelto en arroz y alga nori, con mayonesa de olivo trufada.', 24300, NULL, true, 9, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/veggie-15-pzas.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas de langostinos', '4 unidades de empanadillas de trigo japonesas, relleno de langostinos al curry. Selladas y al vapor. Acompañado de salsa china agridulce.', 13900, NULL, true, 10, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-de-langostinos.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas de ternera', '4 unidades de empanadillas de trigo japonesas, relleno de ternera. Selladas y al vapor. Acompañado de salsa de soja cítrica.', 13500, NULL, true, 11, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-de-ternera.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas tako', '4 unidades de empanadillas de trigo japonesas, relleno de vegetales y pulpo. Selladas y al vapor. Acompañado de salsa china agridulce.', 13900, NULL, true, 12, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-tako.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas chiken teriyaki', '4 unidades de empanadillas de trigo japonesas, relleno de pollo y teriyaki. Selladas y al vapor. Acompañado de salsa teriyaki y negui.', 13900, NULL, true, 13, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-chiken-teriyaki.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas veggie', '4 unidades de empanadillas de trigo japonesas, relleno de vegetales. Selladas y al vapor. Acompañado de salsa china agridulce.', 11000, NULL, true, 14, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-veggie.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas acevichadas', '4 unidades de empanadillas japonesas fritas, rellenas de pesca blanca, cebolla morada y cilantro. Fritas, acompañadas de salsa tonkatsu.', 13900, NULL, true, 15, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-acevichadas.jpg'),
  ('carta', 'Gyozas', 'Empanadillas japonesas · 4 unidades', 'Gyozas de cerdo', '4 unidades de empanadillas de trigo japonesas, relleno de carne de cerdo. Selladas y al vapor. Acompañado de salsa china agridulce.', 13000, NULL, true, 16, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/gyozas-de-cerdo.jpg'),
  ('carta', 'Harumakis', NULL, 'Harumakis de carne', '4 unidades de arrollados primavera de carne fritos. Acompañado de salsa china agridulce.', 11500, NULL, true, 17, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/harumakis-de-carne.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', '2 Langostinos furai', '2 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', 9000, NULL, true, 18, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/2-langostinos-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', '4 Langostinos furai', '4 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', 14000, NULL, true, 19, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/4-langostinos-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', '6 Langostinos furai', '6 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', 22000, NULL, true, 20, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/6-langostinos-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', '2 Maki furai', '2 pzas de Maki de salmón, apanado y frito. Top de guacamole y vieiras rancheras.', 12300, NULL, true, 21, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/2-maki-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', '4 Maki furai', '4 pzas de Maki de salmón, apanado y frito. Top de guacamole y vieiras rancheras.', 17000, NULL, true, 22, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/4-maki-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', 'Dupla furai', 'Dupla de un ceviche de vieiras y maíz chulpi. Un tartar de salmón sobre colchón de shari furai.', 18000, NULL, true, 23, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/dupla-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', 'Oniguiri furai', 'Dupla de triángulos de shari, envueltos en alga nori, rebozado en panco y frito, relleno de salmón cocido. Coronado de mayo japo y salsa brava.', 16000, NULL, true, 24, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/oniguiri-furai.jpg'),
  ('carta', 'Rebozados', 'Apanados en panco y fritos', 'Vieiras furai', 'Callos de vieiras apanadas en panco y fritas. Acompañadas de salsa brava.', 13000, NULL, true, 25, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/vieiras-furai.jpg'),
  ('carta', 'Korokkes', NULL, 'Korokke de pulpo', '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y pulpo. Acompañado de salsa brava.', 17000, NULL, true, 26, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/korokke-de-pulpo.jpg'),
  ('carta', 'Korokkes', NULL, 'Korokke de salmón', '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y salmón. Acompañado de salsa brava.', 16000, NULL, true, 27, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/korokke-de-salmon.jpg'),
  ('carta', 'Korokkes', NULL, 'Korokke de shitake', '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y shitake. Acompañado de salsa brava.', 14000, NULL, true, 28, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/korokke-de-shitake.jpg'),
  ('carta', 'Tempura', '2 personas', 'Tempura Pacifico (2 personas)', 'Trozos tamaño bocado fritos en una masa estilo japonesa de vegetales, salmón y langostinos. Acompañado de salsa spicy.', 22000, NULL, true, 29, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tempura-pacifico-2-personas.jpg'),
  ('carta', 'Tempura', '2 personas', 'Tempura Veggie', 'Trozos tamaño bocado fritos en una masa estilo japonesa de vegetales. Acompañado de salsa spicy.', 17000, NULL, true, 30, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tempura-veggie.jpg'),
  ('carta', 'Tiraditos', NULL, 'Tiradito nipón', 'Láminas de salmón, acompañado de chimi nipón, espolvoreado de maíz chulpi.', 21000, NULL, true, 31, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tiradito-nipon.jpg'),
  ('carta', 'Tiraditos', NULL, 'Tiradito maracuyá', 'Láminas de salmón, acompañado de salsa maracuyá. Coronado de plátano frito.', 20000, NULL, true, 32, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tiradito-maracuya.jpg'),
  ('carta', 'Tiraditos', NULL, 'Tiradito confitados', 'Láminas de pesca del día. Acompañado de leche de tigre confitada. Topping acevichado y maíz chulpi.', 18000, NULL, true, 33, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/tiradito-confitados.jpg'),
  ('carta', 'Rolls de Sushi', NULL, '8 Tamago roll', 'Queso, palmitos y salmón. Envuelto en lámina de tamago. Coronado en salsa maracuyá. Top de hilos de boniato frito.', 16000, NULL, true, 34, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/8-tamago-roll.jpg'),
  ('carta', 'Rolls de Sushi', NULL, '8 Tamago palta roll', 'Queso, palmito y palta. Envuelto en lámina de tamago. Salsa maracuyá, coronado de hilos de boniato frito.', 16000, NULL, true, 35, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/8-tamago-palta-roll.jpg'),
  ('carta', 'Rolls de Sushi', NULL, '8 Tamago ebi furai roll', 'Queso cítrico y ebi furai. Envuelto en lámina de tamago. Coronado en salsa maracuyá. Top de hilos de boniato frito.', 16500, NULL, true, 36, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/8-tamago-ebi-furai-roll.jpg'),
  ('carta', 'Rolls de Sushi', NULL, '9 Huanca Roll', 'Langostinos furai y palta. Semicubierto de salmón. Coronado en salsa huancaína y polvo de aceituna.', 16000, NULL, true, 37, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/9-huanca-roll.jpg'),
  ('carta', 'Niguiris', 'Moriawases', '6 Niguiri de salmón', 'Bocado de arroz, cubierto por una lonja de salmón rosado.', 23000, NULL, true, 38, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/6-niguiri-de-salmon.jpg'),
  ('carta', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi Cerdo', 'Arroz salteado con vegetales, huevo, trozos de cerdo y salsa de soja.', 18500, NULL, true, 39, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-cerdo.jpg'),
  ('carta', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi de Langostinos', 'Arroz salteado con vegetales, huevo, langostinos y salsa de soja. Espolvoreado con katsuobushi.', 21500, NULL, true, 40, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-de-langostinos.jpg'),
  ('carta', 'Yakimeshis', 'Platos de cocina', 'Yakimeshi Veggie', 'Arroz salteado con vegetales, huevo y salsa de soja.', 18000, NULL, true, 41, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakimeshi-veggie.jpg'),
  ('carta', 'Yakisobas', 'Platos de cocina', 'Yakisoba de Cerdo', 'Fideos salteados con vegetales, carne de cerdo y salsa yakisoba.', 19500, NULL, true, 42, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-de-cerdo.jpg'),
  ('carta', 'Yakisobas', 'Platos de cocina', 'Yakisoba de Langostinos', 'Fideos salteados con vegetales, langostinos y salsa yakisoba. Espolvoreado de katsuobushi.', 21500, NULL, true, 43, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-de-langostinos.jpg'),
  ('carta', 'Yakisobas', 'Platos de cocina', 'Yakisoba Veggie', 'Fideos salteados con vegetales y salsa yakisoba.', 18000, NULL, true, 44, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/yakisoba-veggie.jpg'),
  ('carta', 'Salteados', 'Platos de cocina', 'Salteado de Lomo', 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake. Salsa de soja y aceite de sésamo.', 19000, NULL, true, 45, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/saltado-de-lomo.jpg'),
  ('carta', 'Salteados', 'Platos de cocina', 'Salteado de Pollo', 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake. Miel, mostaza y aceite de sésamo.', 19000, NULL, true, 46, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/saltado-de-pollo.jpg'),
  ('carta', 'Salteados', 'Platos de cocina', 'Salteado Veggie', 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake.', 16000, NULL, true, 47, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/saltado-veggie.jpg'),
  ('carta', 'Postres', NULL, 'Copa Dulce', '', 8500, NULL, true, 48, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/copa-dulce.jpg'),
  ('carta', 'Postres', NULL, 'Taiyaki', 'Buñuelo japonés.', 6700, NULL, true, 49, NULL),
  ('carta', 'Postres', NULL, 'Taiyaki Cream', 'Buñuelo japonés con bocha de helado.', 7900, NULL, true, 50, NULL),
  ('carta', 'Postres', NULL, 'Aisu', 'Helado en tempura frío.', 9000, NULL, true, 51, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/aisu.jpg'),
  ('carta', 'Bebidas sin alcohol', NULL, 'Agua c/gas', '', 3800, NULL, true, 52, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Agua s/gas', '', 3800, NULL, true, 53, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Jarra de Limonada', '', 15000, NULL, true, 54, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Coca cola lata', '', 4000, NULL, true, 55, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Coca cola zero lata', '', 4000, NULL, true, 56, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Sprite lata', '', 4000, NULL, true, 57, NULL),
  ('carta', 'Bebidas sin alcohol', NULL, 'Vaso de limonada', '', 5000, NULL, true, 58, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Cynar Pomelo', 'Pomelo.', 6500, NULL, true, 59, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Cynar Soda', '', 6500, NULL, true, 60, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Aperol Spritz', '', 6900, NULL, true, 61, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Soju Tonic', '', 8500, NULL, true, 62, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Gin La Salvaje Tónica', '', 6800, NULL, true, 63, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Gin Dry Yugen Tónica', '', 9500, NULL, true, 64, NULL),
  ('carta', 'Tragos', 'Con alcohol', 'Somek', 'Dos cervezas a elección, una botella de soju.', 30000, NULL, true, 65, NULL),
  ('carta', 'Cervezas', NULL, 'Cerveza Heineken 330ml', 'Lager.', 6000, NULL, true, 66, NULL),
  ('carta', 'Cervezas', NULL, 'Cerveza Corona 330ml', 'Mexican Lager.', 5500, NULL, true, 67, NULL),
  ('carta', 'Cervezas', NULL, 'Cerveza Sapporo 330ml', 'Japón. Hokkaido, cerveza malteada.', 9500, NULL, true, 68, NULL),
  ('carta', 'Cervezas', NULL, 'Cerveza Tsingtao 330ml', 'China.', 8500, NULL, true, 69, NULL),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Torrontés Dulce Natural', '', 21000, NULL, true, 70, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-torrontes-dulce-natural.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Chac Chac Malbec Rosé', '', 22000, NULL, true, 71, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/chac-chac-malbec-rose.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Malbec', '', 28000, NULL, true, 72, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-malbec.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Sauvignon Blanc', '', 28000, NULL, true, 73, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-sauvignon-blanc.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Pinot Noir', '', 28000, NULL, true, 74, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-pinot-noir.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Riesling de Viña Las Perdices', '', 38000, NULL, true, 75, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/riesling-de-vina-las-perdices.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Albariño de Viña Las Perdices', '', 38000, NULL, true, 76, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/albarino-de-vina-las-perdices.jpg'),
  ('carta', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Extra Brut Método Tradicional', 'Espumante.', 40000, NULL, true, 77, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-extra-brut-metodo-tradicional.jpg'),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Reserva Chardonnay', '', 26000, NULL, true, 78, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Reserva Sauvignon Blanc', '', 26500, NULL, true, 79, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Reserva Malbec', '', 24000, NULL, true, 80, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Brut Nature', 'Espumante.', 30000, NULL, true, 81, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Brut Rosé', 'Espumante.', 30000, NULL, true, 82, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Extra Brut', 'Espumante.', 30000, NULL, true, 83, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Blanc de Blancs', 'Espumante.', 30000, NULL, true, 84, NULL),
  ('carta', 'Vinos · Salentein', NULL, 'Salentein Doux', 'Espumante.', 30000, NULL, true, 85, NULL),
  ('carta', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Sauvignon Blanc', '', 27000, NULL, true, 86, NULL),
  ('carta', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Chardonnay', '', 36000, NULL, true, 87, NULL),
  ('carta', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Sauvignon Blanc', '', 36000, NULL, true, 88, NULL),
  ('carta', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Rosé', '', 36000, NULL, true, 89, NULL),
  ('carta', 'Vinos · Catena Zapata', NULL, 'DV Catena Chardonnay', '', 40000, NULL, true, 90, NULL),
  ('carta', 'Vinos · Rutini Wines', NULL, 'Rutini Wines Sauvignon Blanc', '', 45000, NULL, true, 91, NULL),
  ('carta', 'Vinos · Rutini Wines', NULL, 'Rutini Malbec', '', 45000, NULL, true, 92, NULL),
  ('carta', 'Vinos por Copa', NULL, 'Copa Vino Blanco', '', 7500, NULL, true, 93, NULL),
  ('carta', 'Vinos por Copa', NULL, 'Copa Vino Malbec', '', 7500, NULL, true, 94, NULL);

commit;
