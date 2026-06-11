-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — RPC reabrir_pedido
-- ════════════════════════════════════════════════════════════════════════════
--
-- Permite reabrir un pedido CERRADO (estado 'entregado') para volver a editarlo
-- o cobrarlo con otro medio de pago. Devuelve el nuevo estado ('preparando').
--
-- Reglas de negocio que se validan en el servidor (no solo en la UI):
--   • El pedido debe existir.
--   • No se puede reabrir un pedido CANCELADO.
--   • No se puede reabrir un pedido YA FACTURADO (con un comprobante fiscal
--     autorizado de tipo Factura A/B/C — códigos 1, 6, 11). La factura ya
--     emitida tiene CAE y no puede modificarse, así que el total no debe cambiar.
--
-- Seguridad: la función es SECURITY INVOKER (corre con los permisos del usuario),
-- por lo que la RLS existente sobre `pedidos` sigue aplicando. Cualquier usuario
-- que hoy puede cerrar/cancelar un pedido (UPDATE directo) podrá reabrirlo; quien
-- no, recibirá el error de permisos habitual. No se agregan policies nuevas.
--
-- Compatibilidad: si la columna `cerrada_at` no existe en tu esquema, igual
-- funciona (se limpia solo si existe).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.reabrir_pedido(
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

  -- Traemos el estado actual y bloqueamos la fila para evitar carreras.
  select estado
    into v_estado
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado = 'cancelado' then
    raise exception 'No se puede reabrir un pedido cancelado';
  end if;

  -- Bloqueo fiscal: si ya tiene un comprobante autorizado (Factura A/B/C),
  -- no se permite reabrir.
  if exists (
    select 1
      from public.comprobantes_fiscales cf
     where cf.pedido_id = p_pedido_id
       and cf.estado = 'autorizado'
       and cf.tipo_cbte in (1, 6, 11)
  ) then
    raise exception 'No se puede reabrir un pedido ya facturado';
  end if;

  -- Reabrir: volvemos a un estado activo de preparación.
  update public.pedidos
     set estado = 'preparando'
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

  return 'preparando';
end;
$$;

grant execute on function public.reabrir_pedido(uuid) to authenticated;

comment on function public.reabrir_pedido(uuid) is
  'Reabre un pedido entregado (estado -> preparando, limpia cerrada_at). '
  'Bloquea pedidos cancelados o ya facturados (comprobante autorizado A/B/C). '
  'SECURITY INVOKER: respeta la RLS existente sobre pedidos.';
