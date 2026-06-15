-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Especiales: agrupar en carrusel
-- ════════════════════════════════════════════════════════════════════════════
--
-- Los especiales se muestran cada uno en su propia sección apilada (Umami,
-- Pasta Nikkei, Pacífico…). Para mostrar dos o más JUNTOS como carrusel
-- (ej: las dos mesas del Mundial), les ponemos el mismo `grupo`.
--
--   grupo = NULL  → el especial se muestra solo, en su sección (como siempre).
--   grupo = 'x'   → todos los especiales con grupo 'x' se muestran juntos,
--                   como un carrusel deslizable, en una sola sección.
--
-- Aditivo e idempotente. Pegar en Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.especiales
  add column if not exists grupo text;

comment on column public.especiales.grupo is
  'Etiqueta de agrupación para carrusel. Especiales con el mismo grupo se muestran juntos (deslizables). NULL = se muestra solo, en su sección.';

notify pgrst, 'reload schema';
