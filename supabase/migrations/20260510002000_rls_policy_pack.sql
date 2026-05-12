-- RLS policy pack for the first hardened release.
--
-- This migration assumes RLS has already been enabled on the listed tables.
-- It restores full authenticated admin access and gives kitchen users only the
-- read surface they need for the live order board.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pedidos',
    'pedido_items',
    'stock',
    'stock_movimientos',
    'menu_items',
    'menu_item_variantes',
    'recetas',
    'receta_ingredientes',
    'combos',
    'combo_items',
    'clientes',
    'produccion_listas',
    'produccion_tareas'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'admins manage ' || table_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        'admins manage ' || table_name,
        table_name
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pedidos'
      and policyname = 'kitchen read active pedidos'
  ) then
    create policy "kitchen read active pedidos"
    on public.pedidos
    for select
    to authenticated
    using (
      public.current_app_role() = 'cocina'
      and estado in ('pendiente', 'preparando', 'listo')
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pedido_items'
      and policyname = 'kitchen read active pedido items'
  ) then
    create policy "kitchen read active pedido items"
    on public.pedido_items
    for select
    to authenticated
    using (
      public.current_app_role() = 'cocina'
      and exists (
        select 1
        from public.pedidos p
        where p.id = pedido_items.pedido_id
          and p.estado in ('pendiente', 'preparando', 'listo')
      )
    );
  end if;
end;
$$;
