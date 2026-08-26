-- ============================================================
-- Migración: mover una mesa abierta a otra mesa
--
-- Problema: cuando los clientes se cambian de mesa a mitad del servicio y ya
-- consumieron, hoy hay que cancelar el pedido y volver a cargar todo a mano.
--
-- Solución: `mover_pedido_de_mesa(pedido, mesa_destino)` reapunta el pedido a
-- la mesa nueva. Los items, el descuento, las repes, el mozo y la hora de
-- apertura viajan con el pedido: no se toca nada de eso, solo el vínculo con
-- la mesa. La mesa de origen queda libre al instante.
--
-- Qué NO deja hacer (y avisa con un mensaje entendible en vez de un error
-- de base de datos):
--   · mover un pedido ya cerrado o cancelado
--   · mover un pedido que ya tiene factura autorizada (el número de mesa ya
--     salió impreso en el comprobante)
--   · mover a una mesa que ya tiene su propio pedido abierto
--   · mover a una mesa inactiva o inexistente
--   · mover a la misma mesa
--
-- Si la mesa de origen era líder de un grupo (mesas unidas), el grupo se
-- deshace: si no, las mesas miembro quedarían apuntando a una mesa que ya
-- está libre.
--
-- Idempotente: correrlo dos veces no cambia nada.
-- ============================================================

create or replace function public.mover_pedido_de_mesa(
  p_pedido_id       uuid,
  p_mesa_destino_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  public.pedidos%rowtype;
  v_destino public.mesas%rowtype;
  v_ocupada uuid;
begin
  if not public.is_operational_user() then
    raise exception 'No tenés permiso para mover mesas.';
  end if;

  -- Se bloquea la fila del pedido: si dos mozos tocan la misma mesa al mismo
  -- tiempo, el segundo espera y ve el estado ya actualizado.
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'No encontré ese pedido.';
  end if;

  if v_pedido.estado in ('entregado', 'cancelado') then
    raise exception 'Ese pedido ya está cerrado: no se puede mover de mesa.';
  end if;

  if exists (
    select 1 from public.comprobantes_fiscales c
    where c.pedido_id = v_pedido.id
      and c.estado = 'autorizado'
  ) then
    raise exception 'La mesa ya está facturada: el número de mesa salió impreso en el comprobante y no se puede cambiar.';
  end if;

  select * into v_destino
  from public.mesas
  where id = p_mesa_destino_id
  for update;

  if not found then
    raise exception 'Mesa inexistente.';
  end if;

  if v_destino.id = v_pedido.mesa_id then
    raise exception 'El pedido ya está en esa mesa.';
  end if;

  if not v_destino.activa then
    raise exception 'La mesa % está desactivada.', v_destino.numero;
  end if;

  if v_destino.mesa_grupo_id is not null then
    raise exception 'La mesa % está unida a otra mesa. Desagrupala primero.', v_destino.numero;
  end if;

  -- Mismo criterio que el índice único uniq_pedido_abierto_por_mesa, para dar
  -- un mensaje claro antes de que salte la violación de unicidad.
  select id into v_ocupada
  from public.pedidos
  where mesa_id = p_mesa_destino_id
    and estado not in ('entregado', 'cancelado')
  limit 1;

  if v_ocupada is not null then
    raise exception 'La mesa % ya está abierta con otro pedido.', v_destino.numero;
  end if;

  -- Si la mesa de origen era líder de un grupo, el grupo se deshace: sus
  -- miembros no pueden seguir colgados de una mesa que quedó libre.
  if v_pedido.mesa_id is not null then
    update public.mesas
    set mesa_grupo_id = null
    where mesa_grupo_id = v_pedido.mesa_id;
  end if;

  -- `mesa` es la copia de texto del número que usan la comanda y el ticket:
  -- se actualiza junto con el vínculo, si no la impresora sigue diciendo la
  -- mesa vieja.
  update public.pedidos
  set mesa_id    = p_mesa_destino_id,
      mesa       = v_destino.numero::text,
      updated_at = now()
  where id = p_pedido_id;

  return p_pedido_id;
end;
$$;

comment on function public.mover_pedido_de_mesa(uuid, uuid) is
  'Mueve un pedido abierto de una mesa a otra libre, conservando items, descuentos y mozo. Rechaza pedidos cerrados o facturados y mesas destino ocupadas, inactivas o agrupadas.';

grant execute on function public.mover_pedido_de_mesa(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
