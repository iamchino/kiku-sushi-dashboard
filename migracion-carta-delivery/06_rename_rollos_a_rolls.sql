-- ============================================================
-- 06 · Renombrar categoría "Rollos" → "Rolls"
-- Aplica a TODA la tabla (delivery, carta/salón, take away,
-- cualquier tipo). Solo cambia el nombre de la categoría.
-- Seguro de re-correr.
-- ============================================================
begin;

update public.menu_items
   set categoria = 'Rolls de Sushi'
 where categoria = 'Rollos de Sushi';

update public.menu_items
   set categoria = 'Rolls Veggie'
 where categoria = 'Rollos Veggie';

commit;
