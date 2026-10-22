-- ════════════════════════════════════════════════════════════════════════════
-- 15 · REPARACIÓN: devolver el precio a los productos que lo perdieron
-- ════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de revisar el 14. Usa exactamente el mismo "precio_sugerido"
-- que muestra el diagnóstico. Solo toca productos sin variantes cuyo precio
-- está vacío o en 0 y para los que hay una fuente; los "SIN DATO" quedan igual
-- (se cargan a mano desde Menú → editar producto).
-- Al final devuelve la lista de lo que cambió.
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
         pi.menu_item_id, pi.precio_unitario as precio
    from public.pedido_items pi
    join public.pedidos p on p.id = pi.pedido_id
   where pi.menu_item_id in (select id from sin_precio)
     and pi.variante_id is null
     and p.estado <> 'cancelado'
     and pi.precio_unitario > 0
   order by pi.menu_item_id, p.created_at desc
),
sugerido as (
  select s.id,
         round(coalesce(es.precio, ot.precio, uv.precio, nullif(s.precio_num, 0))) as precio
    from sin_precio s
    left join especial     es on es.id = s.id
    left join otro_tipo    ot on ot.id = s.id
    left join ultima_venta uv on uv.menu_item_id = s.id
)
update public.menu_items m
   set precio     = sg.precio::bigint::text,
       precio_num = sg.precio
  from sugerido sg
 where sg.id = m.id
   and sg.precio is not null
   and sg.precio > 0
returning m.tipo, m.categoria, m.nombre, m.precio as precio_recuperado;
