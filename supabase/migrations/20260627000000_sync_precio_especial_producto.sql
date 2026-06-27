-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Sync bidireccional de precio: Especial ↔ Producto de delivery
-- ════════════════════════════════════════════════════════════════════════════
--
-- Objetivo: cuando un especial de la web (tabla `especiales`) está vinculado a un
-- producto de delivery (su botón "Pedir" → `cta_tipo='pedir'` con `cta_producto_id`),
-- el precio de ambos se mantiene SIEMPRE igual. Si cambia uno, el otro se actualiza
-- solo — desde el dashboard, desde el ajuste masivo de precios o desde el SQL Editor.
--
-- Ej: el especial "Tabla de Campeones" apunta al producto de delivery
-- "Tabla de Campeones". Cambiás el precio en cualquiera de los dos y el otro queda
-- igual automáticamente.
--
-- ⚠️ OJO CON LOS TIPOS (por eso la primera versión fallaba con
--    "operator does not exist: text = numeric"):
--    - `especiales.precio`  es NUMERIC.
--    - `menu_items.precio`   es TEXT (campo de display legacy; el front lo formatea).
--      Además puede ser compuesto ("5p: $12.500 / 9p: $23.200") para productos con
--      variantes — esos NO se sincronizan.
--    Por eso TODA comparación/conversión pasa por `public.kiku_parse_precio_ar(text)`
--    (ya existe en la base: parsea precios AR a numeric y devuelve NULL para los
--    compuestos/no parseables). Al escribir en `menu_items.precio` guardamos el
--    entero plano ("45000"), que es el formato canónico que el front ya formatea.
--    También mantenemos `menu_items.precio_num` coherente.
--
-- El guard "is distinct from" (comparando SIEMPRE por valor numérico) corta
-- cualquier rebote, así que no hay loop infinito. Es idempotente.
--
-- ⚠️ Aplicar en Supabase: pegá todo este archivo en el SQL Editor y ejecutá.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Especial → Producto ──────────────────────────────────────────────────
-- Cuando se inserta/actualiza un especial con botón "Pedir" vinculado a un
-- producto, copiamos su precio (numeric) al producto, guardándolo como entero
-- de texto y actualizando también precio_num.
create or replace function public.kiku_sync_precio_especial_a_producto()
returns trigger
language plpgsql
as $$
declare
  v_target numeric;
begin
  if new.cta_tipo = 'pedir'
     and new.cta_producto_id is not null
     and new.precio is not null then

    v_target := round(new.precio);

    update public.menu_items
       set precio     = v_target::bigint::text,   -- "45000" (el front lo formatea)
           precio_num = v_target
     where id = new.cta_producto_id
       -- Solo si el valor numérico difiere: así no pisamos un formato existente
       -- equivalente ni entramos en loop con el otro trigger.
       and public.kiku_parse_precio_ar(precio) is distinct from v_target;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_especial_sync_precio on public.especiales;
create trigger trg_especial_sync_precio
  after insert or update of precio, cta_producto_id, cta_tipo
  on public.especiales
  for each row
  execute function public.kiku_sync_precio_especial_a_producto();


-- ─── 2. Producto → Especial(es) ──────────────────────────────────────────────
-- Cuando cambia el precio (texto) de un producto, lo parseamos a numeric y lo
-- copiamos a todos los especiales que lo usan como botón "Pedir".
create or replace function public.kiku_sync_precio_producto_a_especial()
returns trigger
language plpgsql
as $$
declare
  v_val numeric;
begin
  v_val := public.kiku_parse_precio_ar(new.precio);
  if v_val is not null then
    update public.especiales
       set precio = v_val
     where cta_producto_id = new.id
       and cta_tipo = 'pedir'
       and precio is distinct from v_val;   -- evita rebote/loop
  end if;
  return new;
end;
$$;

drop trigger if exists trg_producto_sync_precio on public.menu_items;
create trigger trg_producto_sync_precio
  after update of precio
  on public.menu_items
  for each row
  execute function public.kiku_sync_precio_producto_a_especial();


-- ─── 3. Sync inicial (one-shot) ──────────────────────────────────────────────
-- Alinea de una los pares que HOY tengan precios distintos. Fuente de verdad: el
-- precio del ESPECIAL (es el que el dueño edita de cara a la web). Comparamos
-- SIEMPRE por valor numérico (de ahí el uso de kiku_parse_precio_ar).
update public.menu_items m
   set precio     = round(e.precio)::bigint::text,
       precio_num = round(e.precio)
  from public.especiales e
 where e.cta_tipo = 'pedir'
   and e.cta_producto_id = m.id
   and e.precio is not null
   and public.kiku_parse_precio_ar(m.precio) is distinct from round(e.precio);
