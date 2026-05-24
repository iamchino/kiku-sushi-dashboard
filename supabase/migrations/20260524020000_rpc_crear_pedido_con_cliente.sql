-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Extensión de la RPC crear_pedido_con_items
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora la firma de la RPC era (p_canal, p_mesa, p_notas, p_items).
-- El front del dashboard ya necesitaba pasar también:
--   - p_descuento_porcentaje (columna agregada en 20260523000000)
--   - p_cliente_nombre/telefono/direccion (columnas agregadas en 20260524010000)
--
-- Hoy hace fallback ("function does not exist") y maneja todo con UPDATEs
-- adicionales después del INSERT. Esta migración consolida la RPC para que
-- todo entre en una sola transacción atómica.
--
-- Cambios concretos:
--   • DROP de la firma vieja (4 params) + CREATE de la nueva (8 params).
--   • Cálculo de total: subtotal × (1 − descuento_porcentaje/100), redondeado
--     a 2 decimales. Se respeta el clamp 0..100 que ya tiene la columna.
--   • INSERT a public.pedidos llena: canal, mesa, notas, total,
--     descuento_porcentaje, cliente_nombre, cliente_telefono, cliente_direccion.
--   • Lógica de pedido_items intacta (sigue detectando dinámicamente si
--     existen columnas menu_item_id/variante_id).
--   • Re-grant a authenticated después del DROP.
--
-- Es idempotente: corre siempre que la firma vieja exista, no rompe si solo
-- existe la nueva.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── DROP de cualquier firma previa de crear_pedido_con_items ──────────────
do $$
declare
  v_sig text;
begin
  for v_sig in
    select format('public.crear_pedido_con_items(%s)', pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'crear_pedido_con_items'
  loop
    execute format('drop function if exists %s', v_sig);
  end loop;
end;
$$;

-- ─── CREATE de la firma consolidada ────────────────────────────────────────
create function public.crear_pedido_con_items(
  p_canal                text,
  p_mesa                 text,
  p_notas                text,
  p_items                jsonb,
  p_descuento_porcentaje numeric default 0,
  p_cliente_nombre       text    default null,
  p_cliente_telefono     text    default null,
  p_cliente_direccion    text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido_id        uuid;
  v_subtotal         numeric := 0;
  v_descuento        numeric;
  v_total            numeric;
  v_has_menu_item_id boolean := false;
  v_has_variante_id  boolean := false;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un item';
  end if;

  -- Clamp 0..100 (la columna ya tiene su check, esto es defensa en
  -- profundidad por si el cliente manda un valor fuera de rango).
  v_descuento := greatest(0, least(100, coalesce(p_descuento_porcentaje, 0)));

  -- Subtotal a partir de los items
  select coalesce(sum(
    coalesce((item->>'precio_unitario')::numeric, 0) *
    coalesce((item->>'cantidad')::numeric, 0)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  v_total := round(v_subtotal * (1 - v_descuento / 100.0), 2);

  insert into public.pedidos (
    canal, mesa, notas, total, descuento_porcentaje,
    cliente_nombre, cliente_telefono, cliente_direccion
  )
  values (
    p_canal,
    nullif(p_mesa, '')::int,
    nullif(p_notas, ''),
    v_total,
    v_descuento,
    nullif(btrim(coalesce(p_cliente_nombre,    '')), ''),
    nullif(btrim(coalesce(p_cliente_telefono,  '')), ''),
    nullif(btrim(coalesce(p_cliente_direccion, '')), '')
  )
  returning id into v_pedido_id;

  -- Detectar columnas opcionales en pedido_items (compat con instalaciones
  -- que aún no aplicaron 20260511_*: las columnas se crean ahí).
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'menu_item_id'
  ) into v_has_menu_item_id;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pedido_items' and column_name = 'variante_id'
  ) into v_has_variante_id;

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
      pedido_id, nombre, precio_unitario, cantidad, notas
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

-- ─── Permisos ──────────────────────────────────────────────────────────────
grant execute on function public.crear_pedido_con_items(
  text, text, text, jsonb, numeric, text, text, text
) to authenticated;

comment on function public.crear_pedido_con_items(
  text, text, text, jsonb, numeric, text, text, text
) is
  'Crea un pedido y sus items en una sola transacción. Acepta descuento_porcentaje (0..100) y datos opcionales de cliente. Calcula total = subtotal × (1 − desc/100).';

-- ─── Recargar schema cache de PostgREST ────────────────────────────────────
notify pgrst, 'reload schema';
