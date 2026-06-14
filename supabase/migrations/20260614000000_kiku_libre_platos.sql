-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Platos por ronda de "libre" (tenedor libre / sushi libre)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora la "ronda" de Kiku libre imprimía 1 plato fijo. Ahora el admin
-- define CUÁNTOS platos tiene que preparar la sushi woman por ronda (la "x"),
-- ej. "KIKU LIBRE x3". Ese valor:
--   • Por defecto arranca igual a la cantidad de personas de la mesa.
--   • Es ajustable en cada ronda y queda como default para la siguiente.
--   • Se guarda por ronda dentro de kiku_libre_historial (campo "platos").
--
-- kiku_libre_platos = último valor de platos por ronda elegido para la mesa.
--   NULL  => todavía no se personalizó; la UI usa `personas` como default.
--
-- kiku_libre_historial pasa a guardar también el campo "platos" por ronda:
--   [{ "ronda": 1, "platos": 3, "nota": "2 salmon", "mozo": "Juan", "at": "..." }]
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists kiku_libre_platos integer
    check (kiku_libre_platos is null or kiku_libre_platos >= 1);

comment on column public.pedidos.kiku_libre_platos is
  'Platos por ronda de Kiku libre (la "x" que prepara cocina). NULL => usar personas como default. '
  'El detalle por ronda (incluido platos) vive en kiku_libre_historial.';

notify pgrst, 'reload schema';
