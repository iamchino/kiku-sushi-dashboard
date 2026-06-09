-- ============================================================================
-- Gestión de productos (menu_items) — herramientas para el SQL Editor de Supabase
-- ----------------------------------------------------------------------------
-- Problema: no se puede borrar un producto que ya fue usado en un pedido porque
-- pedido_items.menu_item_id apunta a menu_items.id con una FK que lo protege
-- (ON DELETE NO ACTION). Esto es a propósito: borrarlo rompería el historial.
--
-- Estrategia elegida: SOFT-DELETE. En vez de borrar, marcamos activo = false
-- (el producto desaparece de la carta pero se conserva todo el historial).
-- Los pedidos viejos igual guardan nombre y precio_unitario, así que los
-- reportes de ventas no se ven afectados.
--
-- Ejecutá cada bloque por separado en: Supabase → SQL Editor.
-- ============================================================================


-- 1) DIAGNÓSTICO ─────────────────────────────────────────────────────────────
-- ¿Qué productos están referenciados en pedidos y cuántas veces?
-- (estos son los que NO se pueden borrar de verdad, solo ocultar)
select
  m.id,
  m.nombre,
  m.tipo,
  m.activo,
  count(pi.id) as veces_vendido
from menu_items m
left join pedido_items pi on pi.menu_item_id = m.id
group by m.id, m.nombre, m.tipo, m.activo
order by veces_vendido desc, m.nombre;


-- 2) OCULTAR UN PRODUCTO (soft-delete) por id ────────────────────────────────
-- Reemplazá el UUID por el del producto que querés ocultar.
update menu_items
set activo = false
where id = '00580a6e-77be-4df4-a4bc-d7995d9be749';


-- 3) OCULTAR varios productos por nombre (ejemplo) ────────────────────────────
-- update menu_items
-- set activo = false
-- where nombre in ('Producto A', 'Producto B');


-- 4) VOLVER A MOSTRAR un producto oculto ──────────────────────────────────────
-- update menu_items
-- set activo = true
-- where id = '00580a6e-77be-4df4-a4bc-d7995d9be749';


-- 5) BORRAR DE VERDAD un producto SIN ventas ──────────────────────────────────
-- Solo funciona si el producto nunca se usó en un pedido. Si tiene ventas,
-- la base de datos lo va a bloquear (usá el soft-delete del punto 2).
-- delete from menu_items
-- where id = 'UUID-DEL-PRODUCTO'
--   and not exists (select 1 from pedido_items pi where pi.menu_item_id = menu_items.id);


-- ============================================================================
-- OPCIONAL — Si en el futuro querés poder BORRAR productos con ventas
-- conservando igual el historial (los pedidos guardarían el link en NULL pero
-- mantienen nombre y precio), podés cambiar la regla de la FK a SET NULL.
-- ⚠️ Esto es un cambio de esquema; ejecutalo solo si estás seguro.
-- ----------------------------------------------------------------------------
-- alter table pedido_items
--   drop constraint pedido_items_menu_item_id_fkey;
--
-- alter table pedido_items
--   add constraint pedido_items_menu_item_id_fkey
--   foreign key (menu_item_id) references menu_items(id)
--   on delete set null;
-- ============================================================================
