-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — RPC reactivar_pedido (restablecer pedido cancelado por error)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Manu: poder "restablecer" un pedido cancelado por accidente desde el
-- detalle de la orden en el dashboard.
--
-- Qué hace:
--   • Toma un pedido en estado 'cancelado' y lo vuelve a 'pendiente' (estado
--     pristino: un pendiente todavía no descontó stock, así que no hay que tocar
--     el stock; al cancelar ya se había revertido el descuento si correspondía).
--   • Limpia cerrada_at si existe.
--   • Bloquea si el pedido ya tiene un comprobante fiscal autorizado (Factura
--     A/B/C — códigos 1, 6, 11): no debería poder cancelarse uno facturado, pero
--     lo chequeamos por las dudas.
--
-- Es el espejo de reabrir_pedido, pero específico para pedidos cancelados.
-- SECURITY INVOKER: respeta la RLS existente sobre `pedidos`.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.reactivar_pedido(
  p_pedido_id uuid
)
returns text
language plpgsql
-- SECURITY INVOKER (por defecto): respeta la RLS del usuario que llama.
set search_path = public, pg_temp
as $$
declare
  v_estado text;
begin
  if p_pedido_id is null then
    raise exception 'pedido_id es requerido';
  end if;

  select estado
    into v_estado
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado <> 'cancelado' then
    raise exception 'Solo se puede restablecer un pedido cancelado (estado actual: %)', v_estado;
  end if;

  -- Bloqueo fiscal por las dudas.
  if exists (
    select 1
      from public.comprobantes_fiscales cf
     where cf.pedido_id = p_pedido_id
       and cf.estado = 'autorizado'
       and cf.tipo_cbte in (1, 6, 11)
  ) then
    raise exception 'No se puede restablecer un pedido ya facturado';
  end if;

  -- Volvemos al estado pristino: pendiente (sin stock descontado).
  update public.pedidos
     set estado = 'pendiente'
   where id = p_pedido_id;

  -- Limpiar cerrada_at solo si la columna existe en este esquema.
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'pedidos'
       and column_name  = 'cerrada_at'
  ) then
    execute 'update public.pedidos set cerrada_at = null where id = $1'
      using p_pedido_id;
  end if;

  return 'pendiente';
end;
$$;

grant execute on function public.reactivar_pedido(uuid) to authenticated;

comment on function public.reactivar_pedido(uuid) is
  'Restablece un pedido cancelado (estado -> pendiente, limpia cerrada_at). Bloquea pedidos facturados. SECURITY INVOKER: respeta la RLS existente sobre pedidos.';

notify pgrst, 'reload schema';
