-- ============================================================================
-- KIKU SUSHI — Descuento de stock por venta + alta masiva de bebidas al menú
-- ----------------------------------------------------------------------------
-- CONTEXTO
--   El código del dashboard (hooks/usePedidos.js → descontarStockPedido) ya sabe
--   descontar stock cuando se cobra/entrega un pedido, PERO el backend estaba a
--   medio construir: faltaban las funciones descontar_stock_produccion /
--   revertir_stock_produccion y las columnas pedidos.stock_descontado /
--   descuento_detalle. Este script las crea.
--
--   Además, muchas BEBIDAS viven solo en el inventario (tabla `stock`) y no
--   tienen un producto de menú (`menu_items`), por eso no aparecen al
--   "Adicionar" en una mesa. La cadena que hace falta para vender una bebida y
--   que descuente stock es:
--
--       stock (bebida)
--         ↑ receta_ingredientes.stock_id
--       recetas (menu_item_id → producto)
--         ↑
--       menu_items (aparece en la carta / en la mesa)
--         ↑ pedido_items.menu_item_id
--       pedido  → al cobrar, descuenta 1 unidad de la bebida.
--
--   La Parte B crea, para cada bebida del inventario que no esté en el menú, su
--   producto de menú + una receta 1:1 (1 unidad de esa bebida).
--
-- CÓMO USARLO (Supabase → SQL Editor):
--   1) Corré SOLO el SELECT de diagnóstico (Parte B, paso 0) para ver qué
--      bebidas se van a crear y con qué precio placeholder.
--   2) Si estás conforme, corré todo el archivo.
--   3) Es idempotente: se puede correr varias veces sin duplicar.
--
--   IMPORTANTE — PRECIOS: `stock.precio_unitario` es el COSTO, no el precio de
--   venta. Los productos nuevos se crean OCULTOS de la web (solo_salon=true,
--   activo=false) con un precio placeholder = costo × v_markup. Revisá y
--   corregí el precio de venta de cada bebida en Menú antes de mostrarlas en la
--   web. Podés cambiar el markup en la variable v_markup de la Parte B.
-- ============================================================================


-- ============================================================================
-- PARTE A — Backend del descuento de stock por venta
-- ============================================================================

-- A.1  Columnas de control en `pedidos`
alter table public.pedidos
  add column if not exists stock_descontado boolean not null default false;

alter table public.pedidos
  add column if not exists descuento_detalle jsonb;


-- A.2  Descontar stock (consumo por venta)
--      Resta p_cantidad del stock_actual (nunca baja de 0) y registra el
--      movimiento como 'merma' (mismo tipo que usa el consumo de producción).
--      DROP previo: la función ya existía con otro tipo de retorno y Postgres
--      no permite cambiarlo con CREATE OR REPLACE. La firma (args) se mantiene
--      idéntica a la que llama el front, así que no rompe nada.
drop function if exists public.descontar_stock_produccion(uuid, numeric, text);
create or replace function public.descontar_stock_produccion(
  p_stock_id uuid,
  p_cantidad numeric,
  p_notas    text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual numeric;
  v_nuevo  numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;   -- nada que descontar
  end if;

  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Ingrediente de stock no encontrado: %', p_stock_id;
  end if;

  v_nuevo := greatest(0, v_actual - p_cantidad);

  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;

  insert into public.stock_movimientos (
    stock_id, tipo, cantidad, stock_antes, stock_despues, notas
  )
  values (
    p_stock_id, 'merma', p_cantidad, v_actual, v_nuevo, coalesce(p_notas, 'Venta')
  );

  return v_nuevo;
end;
$$;


-- A.3  Revertir stock (cuando se reabre / cancela un pedido ya descontado)
drop function if exists public.revertir_stock_produccion(uuid, numeric, text);
create or replace function public.revertir_stock_produccion(
  p_stock_id uuid,
  p_cantidad numeric,
  p_notas    text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual numeric;
  v_nuevo  numeric;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return null;
  end if;

  select stock_actual
  into v_actual
  from public.stock
  where id = p_stock_id
  for update;

  if not found then
    raise exception 'Ingrediente de stock no encontrado: %', p_stock_id;
  end if;

  v_nuevo := v_actual + p_cantidad;

  update public.stock
  set stock_actual = v_nuevo
  where id = p_stock_id;

  insert into public.stock_movimientos (
    stock_id, tipo, cantidad, stock_antes, stock_despues, notas
  )
  values (
    p_stock_id, 'entrada', p_cantidad, v_actual, v_nuevo, coalesce(p_notas, 'Reversión de venta')
  );

  return v_nuevo;
end;
$$;


-- A.4  Permisos (el front las llama como usuario autenticado)
grant execute on function public.descontar_stock_produccion(uuid, numeric, text) to authenticated;
grant execute on function public.revertir_stock_produccion(uuid, numeric, text) to authenticated;


-- ============================================================================
-- PARTE B — Alta masiva de bebidas del inventario que faltan en el menú
-- ============================================================================

-- Paso 0 — DIAGNÓSTICO (corré SOLO esta consulta primero para previsualizar).
--   Lista las bebidas del inventario que NO tienen producto de menú y que se
--   van a crear. `costo` es stock.precio_unitario (NO el precio de venta).
select
  s.id,
  s.nombre,
  s.categoria,
  coalesce(s.precio_unitario, 0) as costo
from public.stock s
where lower(translate(coalesce(s.categoria, ''), 'ÁÉÍÓÚÑ', 'AEIOUN')) in ('bebidas', 'bebida')
  and coalesce(s.tipo_stock, 'materia_prima') <> 'produccion'
  and not exists (
    select 1
    from public.menu_items m
    where lower(translate(trim(m.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
        = lower(translate(trim(s.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
  )
  and not exists (
    select 1 from public.receta_ingredientes ri where ri.stock_id = s.id
  )
order by s.nombre;


-- Paso 1 — ALTA. Crea, por cada bebida detectada arriba:
--   • un producto de menú (tipo 'carta', categoría 'Bebidas', oculto de la web)
--   • una receta 1:1 ligada a ese producto
--   • el ingrediente de la receta = 1 unidad de la bebida del inventario
do $$
declare
  v_markup    numeric := 1.0;   -- <<< CAMBIÁ ESTO si querés un markup sobre el costo (ej: 3.0 = triple)
  r           record;
  v_menu_id   uuid;
  v_receta_id uuid;
  v_orden     int;
  v_precio    numeric;
  v_creados   int := 0;
begin
  select coalesce(max(orden), -1) into v_orden from public.menu_items;

  for r in
    select s.id, s.nombre, coalesce(s.precio_unitario, 0) as costo
    from public.stock s
    where lower(translate(coalesce(s.categoria, ''), 'ÁÉÍÓÚÑ', 'AEIOUN')) in ('bebidas', 'bebida')
      and coalesce(s.tipo_stock, 'materia_prima') <> 'produccion'
      and not exists (
        select 1
        from public.menu_items m
        where lower(translate(trim(m.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
            = lower(translate(trim(s.nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
      )
      and not exists (
        select 1 from public.receta_ingredientes ri where ri.stock_id = s.id
      )
    order by s.nombre
  loop
    v_orden  := v_orden + 1;
    v_precio := round(r.costo * v_markup);

    -- 1) Producto de menú. Oculto de la web (solo_salon=true, activo=false) hasta
    --    que revises el precio de venta. Si la columna solo_salon no existe
    --    (migración vieja), cae al modo activo=true.
    begin
      insert into public.menu_items (nombre, categoria, tipo, precio, precio_num, orden, activo, solo_salon)
      values (r.nombre, 'Bebidas', 'carta', v_precio::text, v_precio, v_orden, false, true)
      returning id into v_menu_id;
    exception when undefined_column then
      insert into public.menu_items (nombre, categoria, tipo, precio, precio_num, orden, activo)
      values (r.nombre, 'Bebidas', 'carta', v_precio::text, v_precio, v_orden, true)
      returning id into v_menu_id;
    end;

    -- 2) Receta 1:1 ligada al producto
    insert into public.recetas (nombre, menu_item_id, porciones, es_subreceta)
    values (r.nombre, v_menu_id, 1, false)
    returning id into v_receta_id;

    -- 3) Ingrediente = 1 unidad de la bebida del inventario
    insert into public.receta_ingredientes (receta_id, stock_id, cantidad)
    values (v_receta_id, r.id, 1);

    v_creados := v_creados + 1;
  end loop;

  raise notice 'Bebidas creadas en el menú (con receta 1:1): %', v_creados;
end;
$$;


-- Refrescar el cache de PostgREST para que el front vea las funciones nuevas.
notify pgrst, 'reload schema';

-- ============================================================================
-- FIN. Después de correrlo:
--   • Las bebidas nuevas ya aparecen al "Adicionar" en una mesa (Carta Salón).
--   • Revisá el precio de venta de cada una en Menú y, cuando quieras que se
--     vendan por la web, poné "Visible en la carta web".
--   • Para que el cobro descuente stock, el flag VITE_ENABLE_ORDER_STOCK_DISCOUNT
--     del dashboard debe estar en 'true' (y hay que redeployar).
-- ============================================================================
