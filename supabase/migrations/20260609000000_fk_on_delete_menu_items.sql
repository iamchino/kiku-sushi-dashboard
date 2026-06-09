-- ============================================================================
-- Permitir borrar productos (menu_items) desde el dashboard SIEMPRE,
-- tengan o no pedidos asociados, sin destruir el historial de ventas.
-- ----------------------------------------------------------------------------
-- Cuatro tablas apuntan a menu_items.id. Por defecto la regla es
-- ON DELETE NO ACTION, que bloquea el borrado. Acá la cambiamos:
--
--   pedido_items.menu_item_id        -> ON DELETE SET NULL
--        (el pedido viejo conserva nombre y precio_unitario; solo se pierde
--         el link. Los reportes de ventas siguen intactos.)
--   recetas.menu_item_id             -> ON DELETE SET NULL
--        (la receta queda, solo se desvincula del producto.)
--   combos.menu_item_id              -> ON DELETE SET NULL
--        (el combo queda, solo se desvincula del producto.)
--   menu_item_variantes.menu_item_id -> ON DELETE CASCADE
--        (las variantes son parte del producto: se borran con él.)
--
-- El script es idempotente: se puede correr varias veces sin error.
-- Ejecutar en: Supabase -> SQL Editor (o aplicar como migración).
-- ============================================================================

-- 1) Eliminar las FK existentes hacia menu_items (cualquiera sea su nombre).
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname as child_table
    from pg_constraint con
    join pg_class      rel  on rel.oid  = con.conrelid
    join pg_class      frel on frel.oid = con.confrelid
    join pg_namespace  n    on n.oid    = rel.relnamespace
    where con.contype = 'f'
      and n.nspname   = 'public'
      and frel.relname = 'menu_items'
      and rel.relname in ('pedido_items', 'recetas', 'combos', 'menu_item_variantes')
  loop
    execute format('alter table public.%I drop constraint %I', r.child_table, r.conname);
  end loop;
end $$;

-- 2) Recrear cada FK con la regla deseada (solo si la tabla y columna existen).

-- pedido_items -> SET NULL
do $$
begin
  if to_regclass('public.pedido_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'pedido_items'
         and column_name = 'menu_item_id'
     )
  then
    alter table public.pedido_items
      add constraint pedido_items_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete set null;
  end if;
end $$;

-- recetas -> SET NULL
do $$
begin
  if to_regclass('public.recetas') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'recetas'
         and column_name = 'menu_item_id'
     )
  then
    alter table public.recetas
      add constraint recetas_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete set null;
  end if;
end $$;

-- combos -> SET NULL
do $$
begin
  if to_regclass('public.combos') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'combos'
         and column_name = 'menu_item_id'
     )
  then
    alter table public.combos
      add constraint combos_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete set null;
  end if;
end $$;

-- menu_item_variantes -> CASCADE
do $$
begin
  if to_regclass('public.menu_item_variantes') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'menu_item_variantes'
         and column_name = 'menu_item_id'
     )
  then
    alter table public.menu_item_variantes
      add constraint menu_item_variantes_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete cascade;
  end if;
end $$;

-- 3) Verificación: ver las reglas resultantes.
-- (delete_rule debería ser 'SET NULL' para los primeros tres y 'CASCADE' para variantes)
select
  rel.relname  as tabla,
  con.conname  as constraint,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end          as on_delete
from pg_constraint con
join pg_class     rel  on rel.oid  = con.conrelid
join pg_class     frel on frel.oid = con.confrelid
join pg_namespace n    on n.oid    = rel.relnamespace
where con.contype = 'f'
  and n.nspname   = 'public'
  and frel.relname = 'menu_items'
order by rel.relname;
