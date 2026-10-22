-- 25 · PREVIEW (solo lee, no cambia nada)
-- Qué va a hacer el SQL 26 con las recetas: a cuáles les cambia el tipo,
-- cuáles pasan a "lleva stock" y a cuáles les crea un ítem de stock nuevo.
select r.nombre as receta,
       case when r.es_subreceta
              or (r.menu_item_id is null and exists (select 1 from public.stock s where s.receta_id = r.id))
            then 'intermedia' else 'final' end as tipo_nuevo,
       case when r.es_subreceta
              or (r.menu_item_id is null and exists (select 1 from public.stock s where s.receta_id = r.id))
              or exists (select 1 from public.stock s where s.receta_id = r.id)
              or exists (select 1 from public.produccion_tareas t where t.receta_id = r.id)
            then 'si' else 'no' end as lleva_stock,
       case when exists (select 1 from public.stock s where s.receta_id = r.id)
            then 'ya tiene: ' || (select string_agg(s.nombre, ', ') from public.stock s where s.receta_id = r.id)
            when r.es_subreceta
              or exists (select 1 from public.produccion_tareas t where t.receta_id = r.id)
            then 'SE CREA (en 0)'
            else '' end as item_de_stock,
       (select count(*) from public.produccion_tareas t where t.receta_id = r.id) as tareas_produccion,
       m.nombre as producto_menu
from public.recetas r
left join public.menu_items m on m.id = r.menu_item_id
where r.es_subreceta
   or exists (select 1 from public.stock s where s.receta_id = r.id)
   or exists (select 1 from public.produccion_tareas t where t.receta_id = r.id)
order by 2, 1;
