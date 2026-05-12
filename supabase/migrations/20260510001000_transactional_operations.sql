-- Transactional operations for orders and stock.
--
-- These functions keep critical writes in the database so partial client-side
-- failures cannot leave orphan orders or mismatched stock history.

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
begin
  if not public.is_admin() then
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
  values (p_canal, nullif(p_mesa, ''), nullif(p_notas, ''), v_total)
  returning id into v_pedido_id;

  insert into public.pedido_items (
    pedido_id,
    nombre,
    precio_unitario,
    cantidad,
    notas,
    menu_item_id,
    variante_id
  )
  select
    v_pedido_id,
    i.nombre,
    coalesce(i.precio_unitario, 0),
    coalesce(i.cantidad, 1),
    nullif(i.notas, ''),
    i.menu_item_id,
    i.variante_id
  from jsonb_to_recordset(p_items) as i(
    nombre text,
    precio_unitario numeric,
    cantidad numeric,
    notas text,
    menu_item_id uuid,
    variante_id uuid
  );

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
  if not public.is_admin() then
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

grant execute on function public.crear_pedido_con_items(text, text, text, jsonb) to authenticated;
grant execute on function public.registrar_movimiento_stock(uuid, text, numeric, text) to authenticated;

comment on function public.crear_pedido_con_items(text, text, text, jsonb) is
  'Creates an order and its items atomically. Admin role required.';

comment on function public.registrar_movimiento_stock(uuid, text, numeric, text) is
  'Locks a stock row, updates stock_actual, and records the movement atomically. Admin role required.';
