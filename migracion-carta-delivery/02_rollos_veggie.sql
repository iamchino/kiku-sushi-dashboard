-- ============================================================
-- 02 · DELIVERY · Sección aparte 'Rolls Veggie'
-- Mueve 3 rolls que YA existen (no los re-crea) a su propia
-- categoría, en el orden: Bajiru → Tamago palta → Maki vegan.
-- El orden global definitivo lo fija 05_orden_delivery.sql.
-- ============================================================
begin;

update public.menu_items set categoria='Rolls Veggie'
 where tipo='delivery' and nombre in
   ('9 Bajiru Roll','8 Tamago palta roll','9 Maki vegan roll');

commit;
