-- ============================================================
-- 07 · Oculta duplicados de la carta (case-insensitive).
--  Conserva en cada grupo la fila mas completa (con imagen /
--  con badges / activa / id menor) y pone activo=false al resto.
--  NO borra: preserva el historial de pedidos.
--  Resuelve los "Ceviche de Pesca Blanca / Mixto" viejos (orden 1-2)
--  que aparecian entre Combinados, y el "Cerveza Sapporo" repetido.
-- ============================================================
begin;

with ranked as (
  select id,
         row_number() over (
           partition by lower(btrim(nombre))
           order by (imagen_url is not null) desc,
                    (picante > 0 or vegano or vegetariano or sin_tacc) desc,
                    activo desc,
                    id asc
         ) as rn
  from public.menu_items
  where tipo = 'carta'
)
update public.menu_items
   set activo = false
 where id in (select id from ranked where rn > 1);

commit;

-- (Opcional) Ver que quedo: no deberia haber duplicados activos
-- select lower(btrim(nombre)) n, count(*) c
-- from public.menu_items where tipo='carta' and activo
-- group by 1 having count(*) > 1;
