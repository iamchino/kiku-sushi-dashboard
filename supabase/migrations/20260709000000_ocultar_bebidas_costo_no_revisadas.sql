-- ============================================================================
-- KIKU SUSHI — Ocultar de la venta las bebidas cargadas a PRECIO DE COSTO
-- ----------------------------------------------------------------------------
-- SÍNTOMA (reportado desde Mesas → "Adicionar productos"):
--   Al buscar una bebida aparecen DOS resultados: el producto de carta real
--   (ej. "Chac Chac Malbec Rosé" · Vinos · $26.600) y otro de proveedor/lista
--   (ej. "CHAC CHAC Malbec Rose Las Perdices" · BEBIDAS · $6.460). Un mozo puede
--   agregar el segundo y vender al PRECIO DE COSTO por error.
--
-- CAUSA:
--   La migración 20260702000000_descuento_stock_venta_y_bebidas_al_menu.sql
--   (Parte B) da de alta, por cada bebida del inventario, un producto de menú
--   con:
--       categoria = 'Bebidas', tipo = 'carta',
--       precio    = costo × markup   (markup por defecto = 1.0 → EL COSTO),
--       activo    = false,  solo_salon = true
--   El flag `solo_salon = true` hace que —aunque estén ocultas en la web— SÍ
--   aparezcan en el salón (mesas / órdenes), y encima al precio de costo. La
--   propia migración avisaba "revisá el precio antes de mostrarlas", pero al
--   dejarlas en solo_salon=true ya quedaron expuestas para la venta.
--
-- QUÉ HACE ESTE SCRIPT:
--   Quita `solo_salon` (y asegura `activo=false`) SOLO en esos borradores
--   auto-creados que siguen SIN revisar: bebidas de categoría 'Bebidas',
--   ocultas de la web (activo=false), ligadas 1:1 a un ítem de inventario por
--   receta, y cuyo precio TODAVÍA coincide con el costo (no fueron re-preciadas).
--   Así dejan de aparecer en Mesas/Órdenes, pero NO se borran: quedan como
--   producto oculto. Cuando quieras vender una bebida, editá su precio de venta
--   real en Menú y marcala visible / solo_salón; ahí vuelve a aparecer.
--
--   NO toca: productos con precio ya corregido, ni ítems solo_salón legítimos
--   (Cubierto, Kiku Libre, etc.), ni nada que esté activo=true en la web.
--
-- CÓMO USARLO (Supabase → SQL Editor):
--   1) Corré SOLO el SELECT de diagnóstico (Paso 0) para ver qué se va a ocultar.
--   2) Si estás conforme, corré el UPDATE (Paso 1).
--   Es idempotente y reversible (solo cambia flags; no borra filas).
-- ============================================================================


-- ── Paso 0 — DIAGNÓSTICO (corré SOLO esta consulta primero) ─────────────────
-- Lista las bebidas "borrador" que se van a ocultar de la venta, con su precio
-- actual (de costo) y el costo del inventario, para que confirmes antes.
select
  m.id,
  m.nombre,
  m.categoria,
  m.precio_num                    as precio_actual,
  s.precio_unitario               as costo_inventario,
  m.activo,
  m.solo_salon
from public.menu_items m
join public.recetas r               on r.menu_item_id = m.id
join public.receta_ingredientes ri  on ri.receta_id   = r.id
join public.stock s                 on s.id           = ri.stock_id
where m.tipo = 'carta'
  and lower(translate(coalesce(m.categoria,''), 'ÁÉÍÓÚÑ', 'AEIOUN')) = 'bebidas'
  and m.solo_salon = true
  and coalesce(m.activo, false) = false
  -- Solo las que siguen al costo (no re-preciadas): tolera el redondeo del alta.
  and abs(coalesce(m.precio_num, 0) - round(coalesce(s.precio_unitario, 0))) <= 1
order by m.nombre;


-- ── Paso 1 — CORRECCIÓN (quita la exposición en salón) ──────────────────────
-- Reversible: solo apaga los flags de visibilidad; la fila y su receta quedan.
update public.menu_items m
set solo_salon = false,
    activo     = false
from public.recetas r
join public.receta_ingredientes ri on ri.receta_id = r.id
join public.stock s                on s.id         = ri.stock_id
where r.menu_item_id = m.id
  and m.tipo = 'carta'
  and lower(translate(coalesce(m.categoria,''), 'ÁÉÍÓÚÑ', 'AEIOUN')) = 'bebidas'
  and m.solo_salon = true
  and coalesce(m.activo, false) = false
  and abs(coalesce(m.precio_num, 0) - round(coalesce(s.precio_unitario, 0))) <= 1;

-- Refrescar el cache de PostgREST.
notify pgrst, 'reload schema';

-- ============================================================================
-- DESPUÉS DE CORRERLO:
--   • En Mesas → "Adicionar productos" ya NO aparecen las bebidas a precio de
--     costo; solo quedan los productos de carta reales.
--   • Para vender una bebida del inventario: editá su producto en Menú, poné el
--     PRECIO DE VENTA real y marcala "Visible en la carta" o disponible en
--     salón. Recién ahí vuelve a ofrecerse (ya con el precio correcto).
-- ============================================================================
