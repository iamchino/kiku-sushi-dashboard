-- ============================================================================
-- Cocina deja de tener la sección Menú & Carta
--
--   Cocina podía ver Y EDITAR la carta (precios, especiales, web). No le
--   corresponde: la carta la administra quien tenga el recurso 'menu'
--   (admin, y quien se agregue desde Personal → Permisos).
--
--   Cocina sigue LEYENDO menu_items y variantes a través de sus otras
--   secciones (Órdenes, Operaciones, KDS: escribe=false en el mapa), así que
--   las comandas y la producción no pierden nada. Solo desaparecen la
--   pantalla y la escritura sobre la carta.
--
--   OJO: esto NO se toca en el seed (que es la foto del comportamiento
--   histórico y usa on-conflict-do-nothing): es un cambio de configuración,
--   como los que se hacen desde la pantalla de Permisos.
-- ============================================================================

delete from public.rol_permisos
 where rol_id = 'cocina' and recurso_id = 'menu';

notify pgrst, 'reload schema';
