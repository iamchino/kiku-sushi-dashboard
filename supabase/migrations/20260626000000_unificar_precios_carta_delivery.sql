-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Unificar precios entre Carta (salón) y Delivery / Take Away
-- ════════════════════════════════════════════════════════════════════════════
--
-- Objetivo: que un mismo producto cueste lo mismo en la carta de salón y en
-- delivery/take away. Para cada producto que aparece en AMBAS listas (mismo
-- nombre), se toma el PRECIO MÁS ALTO de las dos y se deja ese precio en las dos.
--
-- Emparejamiento: por NOMBRE normalizado (sin distinguir mayúsculas ni acentos
-- ni espacios de más). Solo se unifican los productos cuyo nombre coincide en
-- carta y delivery; los que no coinciden quedan EXACTAMENTE como están.
--
-- Alcance: solo la columna `precio` (precio único por producto). No toca las
-- variantes (menu_item_variantes).
--
-- ⚠️ Cómo correrlo en el SQL Editor de Supabase:
--    1) PASO 1 — Previsualización: seleccioná y ejecutá SOLO el bloque "PASO 1".
--       Revisá la columna precio_unificado y que los matches tengan sentido.
--    2) PASO 2 — Aplicar: si está todo ok, seleccioná y ejecutá el bloque "PASO 2".
--    Es idempotente: si lo corrés de nuevo, no cambia nada (ya quedan iguales).
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — PREVISUALIZACIÓN (no modifica nada)
-- Muestra cada producto que existe en carta y en delivery, sus dos precios y el
-- precio unificado que se va a aplicar (el más alto).
-- ─────────────────────────────────────────────────────────────────────────────
with norm as (
  select
    id, tipo, nombre, precio,
    lower(btrim(regexp_replace(
      translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
      '\s+', ' ', 'g'
    ))) as k
  from public.menu_items
  where tipo in ('carta', 'delivery')
    and precio is not null
),
maxp as (
  select k, max(precio) as precio_unificado
  from norm
  group by k
  having count(distinct tipo) = 2   -- existe en carta Y en delivery
)
select
  n.k                                       as nombre_normalizado,
  max(n.nombre) filter (where n.tipo = 'carta')    as nombre_carta,
  max(n.precio) filter (where n.tipo = 'carta')    as precio_carta,
  max(n.nombre) filter (where n.tipo = 'delivery') as nombre_delivery,
  max(n.precio) filter (where n.tipo = 'delivery') as precio_delivery,
  m.precio_unificado
from norm n
join maxp m on m.k = n.k
group by n.k, m.precio_unificado
order by n.k;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — APLICAR (deja ambos al precio más alto)
-- ─────────────────────────────────────────────────────────────────────────────
with norm as (
  select id, tipo, precio,
    lower(btrim(regexp_replace(
      translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
      '\s+', ' ', 'g'
    ))) as k
  from public.menu_items
  where tipo in ('carta', 'delivery')
    and precio is not null
),
maxp as (
  select k, max(precio) as precio_unificado
  from norm
  group by k
  having count(distinct tipo) = 2
)
update public.menu_items m
set precio = maxp.precio_unificado
from norm n
join maxp on maxp.k = n.k
where m.id = n.id
  and m.precio is distinct from maxp.precio_unificado;
