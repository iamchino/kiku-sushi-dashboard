-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Historial de rondas de "libre" (tenedor libre / sushi libre)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Guarda el detalle de cada repetición (ronda) en el pedido, para poder verlo
-- después: número de ronda, nota del mozo, hora y mozo.
--
--   kiku_libre_historial = [
--     { "ronda": 1, "nota": "2 salmon, 1 sin palta", "mozo": "Juan", "at": "..." },
--     ...
--   ]
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists kiku_libre_historial jsonb not null default '[]'::jsonb;

comment on column public.pedidos.kiku_libre_historial is
  'Historial de rondas de "libre": array de { ronda, nota, mozo, at }. Solo control interno.';

notify pgrst, 'reload schema';
