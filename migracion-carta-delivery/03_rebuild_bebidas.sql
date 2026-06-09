-- ============================================================
-- 03 · DELIVERY · Bebidas reconstruidas (espejo del salón)
-- Cambios pedidos:
--   · Saca aguas c/s gas, jarra de limonada, tragos y copas de vino.
--   · Espeja la carta de vinos del salón (todas las bodegas).
--     Viña Las Perdices con foto; el resto en modo lista (sin foto).
--   · Queda agrupado: SIN ALCOHOL (gaseosas) → CON ALCOHOL
--     (cervezas + bodegas), por orden.
-- Reemplazo seguro: oculta las bebidas viejas con pedidos
-- asociados (preserva historial) y borra el resto, antes de
-- insertar la lista nueva.
-- ============================================================
begin;

-- 1) Ocultar bebidas viejas referenciadas por pedidos (no se pueden borrar)
update public.menu_items
   set activo = false
 where tipo = 'delivery'
   and categoria in ('Bebidas sin alcohol',
         'Cervezas',
         'Vinos Sauvignon Blanc',
         'Vinos Chardonnay',
         'Vinos Rosados',
         'Vinos Tintos',
         'Espumantes')
   and id in (select menu_item_id from public.pedido_items where menu_item_id is not null);

-- 2) Borrar las bebidas viejas no referenciadas
delete from public.menu_items
 where tipo = 'delivery'
   and categoria in ('Bebidas sin alcohol',
         'Cervezas',
         'Vinos Sauvignon Blanc',
         'Vinos Chardonnay',
         'Vinos Rosados',
         'Vinos Tintos',
         'Espumantes')
   and id not in (select menu_item_id from public.pedido_items where menu_item_id is not null);

-- 3) Insertar la carta de bebidas nueva
insert into public.menu_items
  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)
values
  ('delivery', 'Bebidas sin alcohol', NULL, 'Coca cola lata', '', 4000, NULL, true, 95, NULL),
  ('delivery', 'Bebidas sin alcohol', NULL, 'Coca cola zero lata', '', 4000, NULL, true, 96, NULL),
  ('delivery', 'Bebidas sin alcohol', NULL, 'Sprite lata', '', 4000, NULL, true, 97, NULL),
  ('delivery', 'Bebidas sin alcohol', NULL, 'Vaso de limonada', '', 5000, NULL, true, 98, NULL),
  ('delivery', 'Cervezas', NULL, 'Cerveza Heineken 330ml', 'Lager.', 6000, NULL, true, 99, NULL),
  ('delivery', 'Cervezas', NULL, 'Cerveza Corona 330ml', 'Mexican Lager.', 5500, NULL, true, 100, NULL),
  ('delivery', 'Cervezas', NULL, 'Cerveza Sapporo 330ml', 'Japón. Hokkaido, cerveza malteada.', 9500, NULL, true, 101, NULL),
  ('delivery', 'Cervezas', NULL, 'Cerveza Tsingtao 330ml', 'China.', 8500, NULL, true, 102, NULL),
  ('delivery', 'Cervezas', NULL, 'Cerveza Orion Lata', 'Internacional Rice Lager. Okinawa, arroz y maíz. Japón.', 8500, NULL, true, 103, NULL),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Torrontés Dulce Natural', '', 21000, NULL, true, 104, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-torrontes-dulce-natural.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Chac Chac Malbec Rosé', '', 22000, NULL, true, 105, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/chac-chac-malbec-rose.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Malbec', '', 28000, NULL, true, 106, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-malbec.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Sauvignon Blanc', '', 28000, NULL, true, 107, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-sauvignon-blanc.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Reserva Pinot Noir', '', 28000, NULL, true, 108, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-reserva-pinot-noir.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Riesling de Viña Las Perdices', '', 38000, NULL, true, 109, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/riesling-de-vina-las-perdices.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Albariño de Viña Las Perdices', '', 38000, NULL, true, 110, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/albarino-de-vina-las-perdices.jpg'),
  ('delivery', 'Vinos · Viña Las Perdices', NULL, 'Las Perdices Extra Brut Método Tradicional', 'Espumante.', 40000, NULL, true, 111, 'https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/carta/las-perdices-extra-brut-metodo-tradicional.jpg'),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Reserva Chardonnay', '', 26000, NULL, true, 112, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Reserva Sauvignon Blanc', '', 26500, NULL, true, 113, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Reserva Malbec', '', 24000, NULL, true, 114, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Brut Nature', 'Espumante.', 30000, NULL, true, 115, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Brut Rosé', 'Espumante.', 30000, NULL, true, 116, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Extra Brut', 'Espumante.', 30000, NULL, true, 117, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Blanc de Blancs', 'Espumante.', 30000, NULL, true, 118, NULL),
  ('delivery', 'Vinos · Salentein', NULL, 'Salentein Doux', 'Espumante.', 30000, NULL, true, 119, NULL),
  ('delivery', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Sauvignon Blanc', '', 27000, NULL, true, 120, NULL),
  ('delivery', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Chardonnay', '', 27000, NULL, true, 121, NULL),
  ('delivery', 'Vinos · Escorihuela Gascón', NULL, 'Escorihuela Gascón Malbec', '', 28000, NULL, true, 122, NULL),
  ('delivery', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Chardonnay', '', 36000, NULL, true, 123, NULL),
  ('delivery', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Sauvignon Blanc', '', 36000, NULL, true, 124, NULL),
  ('delivery', 'Vinos · Luigi Bosca', NULL, 'Luigi Bosca Rosé', '', 36000, NULL, true, 125, NULL),
  ('delivery', 'Vinos · Catena Zapata', NULL, 'DV Catena Chardonnay', '', 40000, NULL, true, 126, NULL),
  ('delivery', 'Vinos · Rutini Wines', NULL, 'Rutini Wines Sauvignon Blanc', '', 45000, NULL, true, 127, NULL),
  ('delivery', 'Vinos · Rutini Wines', NULL, 'Rutini Malbec', '', 45000, NULL, true, 128, NULL),
  ('delivery', 'Vinos · Rutini Wines', NULL, 'Rutini Encuentro Brut Nature Pinot Noir', '', 55000, NULL, true, 129, NULL);

commit;
