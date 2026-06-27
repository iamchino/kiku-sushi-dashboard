-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — "Descripción destacada" en productos y especiales
-- ════════════════════════════════════════════════════════════════════════════
--
-- Texto opcional que se muestra en un recuadro debajo de la descripción, para
-- destacar algo aparte de los ingredientes. Ej:
--   "Consultar opción sin bebida"
--   "Descuento en efectivo / transferencia"
--
-- Aplica a:
--   - menu_items  (productos de carta y delivery → se ve al pedir / en la carta)
--   - especiales  (especiales de la home → se ve en la sección showcase)
--
-- Acepta saltos de línea (la web los respeta con whitespace-pre-line).
--
-- ⚠️ Aplicar en Supabase: pegá este archivo en el SQL Editor y ejecutá.
--    Es idempotente (add column if not exists).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.menu_items
  add column if not exists descripcion_destacada text;

alter table public.especiales
  add column if not exists descripcion_destacada text;

comment on column public.menu_items.descripcion_destacada is
  'Texto destacado opcional en recuadro debajo de la descripción (ej: "Consultar opción sin bebida", "Descuento efectivo/transferencia"). Soporta saltos de línea.';

comment on column public.especiales.descripcion_destacada is
  'Texto destacado opcional en recuadro debajo de la descripción del especial. Soporta saltos de línea.';
