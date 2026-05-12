-- Safe order state transitions for the kitchen display.
--
-- Kitchen users can only move active orders through the preparation states.
-- Admin users can use the same function for the full order flow.

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
  v_role text := public.current_app_role();
  v_estado_actual text;
  v_siguiente text;
begin
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

  if v_role = 'cocina' and not (
    v_estado_actual in ('pendiente', 'preparando')
    and v_siguiente in ('preparando', 'listo')
  ) then
    raise exception 'Cocina solo puede avanzar pedidos activos de preparacion';
  end if;

  if v_role <> 'cocina' and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  update public.pedidos
  set estado = v_siguiente
  where id = p_pedido_id;

  return v_siguiente;
end;
$$;

grant execute on function public.avanzar_estado_pedido(uuid, text) to authenticated;

comment on function public.avanzar_estado_pedido(uuid, text) is
  'Advances an order state with role-aware rules. Cocina can only move pendiente/preparando orders; admin can use the full flow.';
