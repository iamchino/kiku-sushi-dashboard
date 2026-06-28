-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — FIX URGENTE: total de pedidos WEB quedaba solo en el envío ($3500)
-- ════════════════════════════════════════════════════════════════════════════
--
-- SÍNTOMA
--   Un pedido que entra desde la web (rol `anon`) mostraba como total únicamente
--   el costo de envío ($3500), sin sumar los productos. Ese total incorrecto se
--   arrastraba a la pestaña de Pedidos y a Caja/Arca.
--
-- CAUSA RAÍZ
--   La web inserta primero la fila en `pedidos` y DESPUÉS los `pedido_items`
--   (el FK lo obliga). El trigger BEFORE INSERT `trg_pedidos_set_total` calcula
--   el total en ese instante: como todavía no hay items, subtotal = 0 y queda
--   total = 0 - 0 + costo_envio = $3500.
--
--   El trigger `trg_items_recompute_total` (AFTER INSERT en pedido_items) debería
--   corregirlo recalculando el total del pedido padre. PERO las funciones de
--   trigger NO eran SECURITY DEFINER: se ejecutaban con el rol `anon`, que tiene
--   policy de INSERT/SELECT sobre `pedidos` pero NO de UPDATE. Con RLS activo,
--   ese `UPDATE public.pedidos ...` no lanza error: simplemente afecta 0 filas.
--   Resultado: el total nunca se recalculaba y quedaba clavado en el envío.
--
-- SOLUCIÓN
--   Recrear las tres funciones como SECURITY DEFINER (con search_path fijo), para
--   que el recálculo del total se ejecute con privilegios del dueño y NO sea
--   filtrado por RLS, sin importar si el pedido lo crea la web (anon) o el
--   dashboard (authenticated). Luego, backfill de los pedidos ya afectados.
--
-- Ejecutar desde el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fuente de verdad del total (idéntica lógica que orders.js), ahora DEFINER.
--    subtotal  = Σ (precio_unitario * cantidad) de pedido_items
--    descuento = descuento_monto si está, si no round(subtotal * desc% / 100)
--    total     = max(0, subtotal - descuento) + costo_envio
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.kiku_total_pedido(p_pedido public.pedidos)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with sub as (
    select coalesce(sum(precio_unitario * cantidad), 0)::numeric as subtotal
    from public.pedido_items
    where pedido_id = p_pedido.id
  )
  select greatest(
           0,
           sub.subtotal - least(
             greatest(
               0,
               case
                 when p_pedido.descuento_monto is not null
                   then round(p_pedido.descuento_monto)
                 else round(sub.subtotal * coalesce(p_pedido.descuento_porcentaje, 0) / 100)
               end
             ),
             sub.subtotal
           )
         ) + coalesce(p_pedido.costo_envio, 0)
  from sub;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger BEFORE en pedidos: fija el total correcto en cada insert/update.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.kiku_pedidos_set_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.total := public.kiku_total_pedido(new);
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger AFTER en pedido_items: recalcula el total del pedido padre.
--    Al ser SECURITY DEFINER, el UPDATE ya NO es bloqueado por RLS cuando el
--    pedido lo crea la web pública con el rol anon. ESTE es el fix central.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.kiku_items_recompute_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido uuid;
begin
  v_pedido := coalesce(new.pedido_id, old.pedido_id);
  if v_pedido is not null then
    update public.pedidos
      set total = public.kiku_total_pedido(pedidos)
      where id = v_pedido;
  end if;
  return coalesce(new, old);
end;
$$;

-- Recreamos los triggers (las definiciones de función ya quedaron actualizadas;
-- esto garantiza que apunten a las versiones DEFINER y existan).
drop trigger if exists trg_pedidos_set_total on public.pedidos;
create trigger trg_pedidos_set_total
  before insert or update of descuento_monto, descuento_porcentaje, descuento_valor,
                            descuento_tipo, descuento_alcance, descuento_items,
                            costo_envio, total
  on public.pedidos
  for each row
  execute function public.kiku_pedidos_set_total();

drop trigger if exists trg_items_recompute_total on public.pedido_items;
create trigger trg_items_recompute_total
  after insert or update or delete
  on public.pedido_items
  for each row
  execute function public.kiku_items_recompute_total();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BACKFILL: recalcula el total de los pedidos cuyo total quedó mal
--    (típicamente == costo_envio teniendo items). Se limita a pedidos NO
--    facturados para no tocar comprobantes ya emitidos.
-- ─────────────────────────────────────────────────────────────────────────────
update public.pedidos p
  set total = public.kiku_total_pedido(p)
  where p.estado in ('pendiente', 'preparando', 'listo', 'entregado')
    and p.total is distinct from public.kiku_total_pedido(p);

notify pgrst, 'reload schema';
