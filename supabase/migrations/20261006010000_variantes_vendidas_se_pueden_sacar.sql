-- ────────────────────────────────────────────────────────────────────────────
-- Menú: sacar una variante que ya se vendió no rompe la edición del producto.
--
-- pedido_items.variante_id apuntaba a menu_item_variantes sin ON DELETE, así
-- que borrar una variante con ventas fallaba (23503) y el producto no se podía
-- guardar. El front ahora actualiza las variantes por id (editar precio o
-- nombre no borra nada); esto cubre el caso de SACAR una variante vendida:
-- el pedido conserva nombre ("Roll X (9p)") y precio, y la referencia queda
-- en null.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.pedido_items
  drop constraint if exists pedido_items_variante_id_fkey;

alter table public.pedido_items
  add constraint pedido_items_variante_id_fkey
  foreign key (variante_id) references public.menu_item_variantes(id)
  on delete set null;
