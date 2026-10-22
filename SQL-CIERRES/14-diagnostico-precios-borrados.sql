-- ════════════════════════════════════════════════════════════════════════════
-- 14 · DIAGNÓSTICO (solo lectura): productos de la carta que perdieron el precio
-- ════════════════════════════════════════════════════════════════════════════
-- Bug: ocultar/mostrar un producto desde Menú le borraba el precio (quedaba en
-- null y la carta lo mostraba a $0). Esta consulta NO modifica nada: lista los
-- productos sin precio y de dónde se podría recuperar cada uno.
--
-- Fuentes, en orden de confianza:
--   1. especial    → el especial de la web que tiene al producto en su botón
--                    "Pedir" (los dos precios van siempre sincronizados).
--   2. otro_tipo   → el mismo producto en la otra carta (salón ↔ delivery),
--                    que tiene los precios unificados.
--   3. ultima_venta→ el precio unitario con el que se vendió la última vez.
--   4. precio_num  → la copia numérica vieja del precio (puede estar
--                    desactualizada si hubo ajustes masivos).
-- Los productos CON variantes no entran: su precio vive en cada variante.
-- ════════════════════════════════════════════════════════════════════════════
with sin_precio as (
  select m.*
    from public.menu_items m
   where (m.precio is null
          or btrim(m.precio) = ''
          or public.kiku_parse_precio_ar(m.precio) = 0)
     and not exists (select 1 from public.menu_item_variantes v where v.menu_item_id = m.id)
),
especial as (
  select distinct on (s.id)
         s.id, round(e.precio) as precio
    from sin_precio s
    join public.especiales e
      on e.cta_producto_id = s.id
     and e.cta_tipo = 'pedir'
   where e.precio > 0
   order by s.id, e.precio desc
),
otro_tipo as (
  select distinct on (s.id)
         s.id, public.kiku_parse_precio_ar(o.precio) as precio
    from sin_precio s
    join public.menu_items o
      on lower(btrim(o.nombre)) = lower(btrim(s.nombre))
     and o.tipo is distinct from s.tipo
     and o.id <> s.id
   where public.kiku_parse_precio_ar(o.precio) > 0
   order by s.id, o.activo desc
),
ultima_venta as (
  select distinct on (pi.menu_item_id)
         pi.menu_item_id, pi.precio_unitario as precio, p.created_at
    from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
   where pi.menu_item_id in (select id from sin_precio)
     and pi.variante_id is null
     and p.estado <> 'cancelado'
     and pi.precio_unitario > 0
   order by pi.menu_item_id, p.created_at desc
)
select s.tipo,
       s.categoria,
       s.nombre,
       case when s.activo then 'visible' else 'oculto' end   as en_carta,
       s.precio                                              as precio_actual,
       es.precio                                             as precio_especial_web,
       ot.precio                                             as precio_otra_carta,
       uv.precio                                             as precio_ultima_venta,
       (uv.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha_ultima_venta,
       s.precio_num                                          as precio_num_viejo,
       coalesce(es.precio, ot.precio, uv.precio, nullif(s.precio_num, 0)) as precio_sugerido,
       case
         when es.precio is not null then 'especial web vinculado'
         when ot.precio is not null then 'otra carta'
         when uv.precio is not null then 'última venta'
         when nullif(s.precio_num, 0) is not null then 'precio_num viejo'
         else 'SIN DATO: cargar a mano'
       end                                                   as fuente
  from sin_precio s
  left join especial     es on es.id = s.id
  left join otro_tipo    ot on ot.id = s.id
  left join ultima_venta uv on uv.menu_item_id = s.id
 order by s.tipo, s.categoria, s.nombre;
