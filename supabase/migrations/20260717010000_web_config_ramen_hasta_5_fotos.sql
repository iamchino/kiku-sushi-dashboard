-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — La sección Ramen pasa a aceptar hasta 5 fotos (era 3)
-- ════════════════════════════════════════════════════════════════════════════
--
-- La sección se rediseñó como carrusel, así que entran más fotos. El mínimo
-- para poder publicarla sigue siendo 2: con 2 se muestran 2, con 5 se muestran
-- 5. No hay huecos ni relleno — el carrusel se adapta a las que haya.
--
-- Reemplaza el CHECK web_config_ramen_imagenes_shape de la migración
-- 20260717000000_web_config_ramen.sql, que topaba en 3. Aquella ya corrió en
-- producción, por eso esto va en una migración aparte en vez de editarla.
--
-- Solo afloja una restricción: no hay filas que puedan violar el nuevo CHECK
-- (todo lo que cumplía <= 3 cumple <= 5), así que no requiere backfill.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.web_config
  drop constraint if exists web_config_ramen_imagenes_shape;

alter table public.web_config
  add constraint web_config_ramen_imagenes_shape
  check (
    jsonb_typeof(ramen_imagenes) = 'array'
    and jsonb_array_length(ramen_imagenes) <= 5
  );

comment on column public.web_config.ramen_imagenes is
  'Array jsonb de imágenes: [{ "url": "...", "alt": "..." }]. Entre 2 y 5 — la web las muestra en carrusel. Se suben al bucket menu-images bajo el prefijo ramen/.';

notify pgrst, 'reload schema';
