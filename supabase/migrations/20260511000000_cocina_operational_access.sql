-- Cocina users are operational admins, except for dashboard/analytics UI,
-- caja/AFIP and clientes. Safe to run from Supabase SQL Editor more than once.

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    'cocina'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_operational_user()
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('admin', 'cocina')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_operational_user() to authenticated;

comment on function public.is_operational_user() is
  'Allows admin and cocina users to manage operational tables. Excludes sensitive UI sections such as clientes and caja/AFIP.';

do $$
declare
  v_table_name text;
  v_policy_name text;
begin
  foreach v_table_name in array array[
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
    'produccion_listas',
    'produccion_tareas'
  ]
  loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      raise notice 'Skipping missing table public.%', v_table_name;
      continue;
    end if;

    v_policy_name := 'operational users manage ' || v_table_name;

    execute format('alter table public.%I enable row level security', v_table_name);
    execute format('drop policy if exists %I on public.%I', v_policy_name, v_table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_operational_user()) with check (public.is_operational_user())',
      v_policy_name,
      v_table_name
    );
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.pedido_items') is not null then
    alter table public.pedido_items add column if not exists menu_item_id uuid;
    alter table public.pedido_items add column if not exists variante_id uuid;
  end if;
end;
$$;

create or replace function public.crear_pedido_con_items(
  p_canal text,
  p_mesa text,
  p_notas text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido_id uuid;
  v_total numeric := 0;
  v_has_menu_item_id boolean := false;
  v_has_variante_id boolean := false;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un item';
  end if;

  select coalesce(sum(
    coalesce((item->>'precio_unitario')::numeric, 0) *
    coalesce((item->>'cantidad')::numeric, 0)
  ), 0)
  into v_total
  from jsonb_array_elements(p_items) as item;

  insert into public.pedidos (canal, mesa, notas, total)
  values (p_canal, nullif(p_mesa, '')::int, nullif(p_notas, ''), v_total)
  returning id into v_pedido_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedido_items'
      and column_name = 'menu_item_id'
  )
  into v_has_menu_item_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedido_items'
      and column_name = 'variante_id'
  )
  into v_has_variante_id;

  if v_has_menu_item_id and v_has_variante_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id, variante_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id,
        i.variante_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid,
        variante_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  elsif v_has_menu_item_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  else
    insert into public.pedido_items (
      pedido_id,
      nombre,
      precio_unitario,
      cantidad,
      notas
    )
    select
      v_pedido_id,
      i.nombre,
      coalesce(i.precio_unitario, 0),
      coalesce(i.cantidad, 1),
      nullif(i.notas, '')
    from jsonb_to_recordset(p_items) as i(
      nombre text,
      precio_unitario numeric,
      cantidad numeric,
      notas text
    );
  end if;

  return v_pedido_id;
end;
$$;

create or replace function public.registrar_movimiento_stock(
  p_stock_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_notas text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual numeric;
  v_nuevo numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_tipo not in ('entrada', 'merma', 'ajuste') then
    raise exception 'Tipo de movimiento invalido: %', p_tipo;
  end if;

  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad debe ser mayor o igual a cero';
  end if;

  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Ingrediente de stock no encontrado';
  end if;

  v_nuevo := case p_tipo
    when 'ajuste' then p_cantidad
    when 'entrada' then v_actual + p_cantidad
    else greatest(0, v_actual - p_cantidad)
  end;

  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;

  insert into public.stock_movimientos (
    stock_id,
    tipo,
    cantidad,
    stock_antes,
    stock_despues,
    notas
  )
  values (
    p_stock_id,
    p_tipo,
    abs(p_cantidad),
    v_actual,
    v_nuevo,
    nullif(p_notas, '')
  );

  return v_nuevo;
end;
$$;

create or replace function public.avanzar_estado_pedido(
  p_pedido_id uuid,
  p_estado_actual text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado_actual text;
  v_siguiente text;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  select estado
  into v_estado_actual
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado_actual <> p_estado_actual then
    raise exception 'El pedido cambio de estado. Actualiza la pantalla e intenta de nuevo.';
  end if;

  v_siguiente := case v_estado_actual
    when 'pendiente' then 'preparando'
    when 'preparando' then 'listo'
    when 'listo' then 'entregado'
    else null
  end;

  if v_siguiente is null then
    raise exception 'El pedido no se puede avanzar desde el estado %', v_estado_actual;
  end if;

  update public.pedidos
  set estado = v_siguiente
  where id = p_pedido_id;

  return v_siguiente;
end;
$$;

grant execute on function public.crear_pedido_con_items(text, text, text, jsonb) to authenticated;
grant execute on function public.registrar_movimiento_stock(uuid, text, numeric, text) to authenticated;
grant execute on function public.avanzar_estado_pedido(uuid, text) to authenticated;

notify pgrst, 'reload schema';
