-- ============================================================================
-- Los ítems agregados a una mesa vuelven a la columna NUEVOS
--
--   Problema: cuando el mozo suma un producto a una mesa que ya está en curso,
--   enviar_a_cocina() dejaba el pedido en 'preparando'. La tarjeta se quedaba
--   en la columna EN PREPARACIÓN, donde cocina ya la había mirado — el plato
--   nuevo entraba sin que nadie lo viera. En un servicio con veinte tarjetas
--   abiertas, eso es un plato que no sale.
--
--   La regla vieja era:
--       estado in ('pendiente','listo') → 'preparando'
--   o sea que un pedido 'preparando' se quedaba quieto, y encima uno 'listo'
--   pasaba directo a 'preparando' salteándose NUEVOS.
--
--   Regla nueva: si entran ítems sin enviar, el pedido VUELVE a 'pendiente'.
--   Es lo que describe la realidad: hay comida que cocina todavía no tomó.
--   Cocina lo ve aparecer en NUEVOS, toca TOMAR PEDIDO y sigue el circuito
--   normal.
--
--   Qué NO se toca, a propósito: 'entregado' y 'cancelado'. Reabrir un pedido
--   entregado lo haría pasar de nuevo por 'entregado' al terminar, y ahí se
--   dispara descontar_stock_pedido() sobre TODOS los ítems — descontaría dos
--   veces el stock del pedido entero. Para sumar comida a una mesa ya
--   entregada, el camino sano es un pedido nuevo en la misma mesa.
--
--   Va de la mano con el badge "NUEVO" del KDS (src/pages/Cocina.jsx), que
--   marca los ítems de la última tanda usando enviado_at: sin eso, cocina ve
--   la tarjeta entera otra vez en NUEVOS y puede rehacer lo que ya cocinó.
-- ============================================================================

create or replace function public.enviar_a_cocina(p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enviados int;
begin
  if not is_operational_user() then
    raise exception 'No autorizado';
  end if;

  -- Todos los ítems de esta tanda comparten el mismo enviado_at (now() es el
  -- instante de la transacción). El KDS usa esa igualdad para saber cuáles son
  -- los recién agregados.
  update public.pedido_items
  set enviado_cocina = true,
      enviado_at     = now()
  where pedido_id = p_pedido_id
    and enviado_cocina = false;

  get diagnostics v_enviados = row_count;

  if v_enviados > 0 then
    update public.pedidos
    set estado = case
                   when estado in ('pendiente', 'preparando', 'listo')
                     then 'pendiente'
                   else estado          -- entregado / cancelado no se tocan
                 end,
        updated_at = now()
    where id = p_pedido_id;
  end if;

  return v_enviados;
end $$;

comment on function public.enviar_a_cocina(uuid) is
  'Marca los ítems como enviados y devuelve el pedido a NUEVOS (pendiente) '
  'para que cocina vea lo que se agregó. No reabre pedidos entregados.';
