-- 23 · DIAGNOSTICO STOCK Y RECETAS (solo lee, no cambia nada)
-- Una sola tabla: qué hay cargado hoy, para diseñar los 3 niveles de stock.
select 'Stock materia prima (items)' as que,
       count(*)::text as valor from public.stock where tipo_stock = 'materia_prima'
union all select 'Stock produccion (items)',
       count(*)::text from public.stock where tipo_stock = 'produccion'
union all select 'Stock produccion SIN receta vinculada',
       count(*)::text from public.stock where tipo_stock = 'produccion' and receta_id is null
union all select 'Stock con cantidad negativa o cero',
       count(*)::text from public.stock where stock_actual <= 0
union all select 'Recetas totales',
       count(*)::text from public.recetas
union all select 'Recetas marcadas subreceta',
       count(*)::text from public.recetas where es_subreceta
union all select 'Recetas vinculadas a un producto del menu',
       count(*)::text from public.recetas where menu_item_id is not null
union all select 'Subrecetas que ya tienen item de stock (produccion)',
       count(distinct r.id)::text from public.recetas r join public.stock s on s.receta_id = r.id
       where r.es_subreceta
union all select 'Recetas usadas como ingrediente de otra receta',
       count(distinct subreceta_id)::text from public.receta_ingredientes where subreceta_id is not null
union all select 'Productos del menu activos SIN receta',
       count(*)::text from public.menu_items m
       where m.activo and not exists (select 1 from public.recetas r where r.menu_item_id = m.id)
union all select 'Pedidos con stock descontado (ultimos 30 dias)',
       count(*)::text from public.pedidos
       where stock_descontado and created_at > now() - interval '30 days'
union all select 'Pedidos entregados (ultimos 30 dias)',
       count(*)::text from public.pedidos
       where estado = 'entregado' and created_at > now() - interval '30 days'
union all select 'Tareas de produccion completadas (ultimos 30 dias)',
       count(*)::text from public.produccion_tareas
       where estado = 'completada' and completada_at > now() - interval '30 days'
union all select 'Movimientos de stock (ultimos 30 dias)',
       count(*)::text from public.stock_movimientos where created_at > now() - interval '30 days'
union all select 'Ultimo movimiento de stock',
       coalesce(to_char(max(created_at) at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), 'nunca')
       from public.stock_movimientos;
