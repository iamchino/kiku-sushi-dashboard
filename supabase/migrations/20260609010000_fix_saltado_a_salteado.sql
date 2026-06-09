-- ============================================================
-- Fix ortográfico: "Saltado" -> "Salteado" en menu_items
-- Afecta categoría e ítems de la sección de platos de cocina.
-- Cubre TODOS los tipos (carta, delivery, takeaway, etc.).
-- NO toca imagen_url / slugs para no romper las imágenes del bucket.
-- Idempotente: "salteado" no contiene "altado", así que no se rompe
-- nada que ya esté bien escrito.
-- Ejecutar en: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

begin;

update public.menu_items
   set categoria   = replace(categoria,   'altado', 'alteado'),
       nombre      = replace(nombre,       'altado', 'alteado'),
       descripcion = replace(descripcion,  'altado', 'alteado')
 where categoria   like '%altado%'
    or nombre      like '%altado%'
    or descripcion like '%altado%';

commit;

-- Verificación (opcional, correr aparte):
-- select tipo, categoria, nombre from public.menu_items
--  where nombre ilike '%salteado%' or categoria ilike '%salteado%'
--  order by tipo, orden;
