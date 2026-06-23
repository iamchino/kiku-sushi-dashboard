-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — RPC reactivar_reserva (restablecer reserva cancelada por error)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Manu: poder "restablecer" una reserva que se canceló por accidente
-- desde el detalle de la reserva en el dashboard.
--
-- Qué hace:
--   • Toma una reserva en estado 'cancelada' o 'no_show' y la vuelve a
--     'confirmada' (confirmada_at = now, cancelada_at = null).
--   • Antes de reactivar, REVALIDA el cupo del día (salón 34/28, omakase 6) para
--     no pisar lugares que ya se ocuparon mientras la reserva estaba cancelada.
--     Si no hay cupo, falla con un mensaje claro y la reserva queda como estaba.
--   • La reserva NO cuenta para el cupo mientras está cancelada (la suma excluye
--     su propio id, aunque por estado ya quedaría afuera).
--
-- Solo cambia el estado; no toca mesa/pedido. SECURITY DEFINER, igual que
-- actualizar_estado_reserva.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.reactivar_reserva(
  p_reserva_id uuid
) returns reserva_estado
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva        record;
  v_capacidad_sal  int;
  v_capacidad_bar  int := public.kiku_capacidad_barra();
  v_ocupados       int;
begin
  if p_reserva_id is null then
    raise exception 'reserva_id es requerido';
  end if;

  -- Traemos y bloqueamos la fila para evitar carreras.
  select * into v_reserva
    from public.reservas
   where id = p_reserva_id
   for update;

  if not found then
    raise exception 'Reserva no encontrada';
  end if;

  if v_reserva.estado not in ('cancelada', 'no_show') then
    raise exception 'Solo se puede restablecer una reserva cancelada o marcada como no-show (estado actual: %).', v_reserva.estado;
  end if;

  -- Revalidamos cupo del día (excluyendo esta misma reserva).
  if v_reserva.tipo_experiencia = 'omakase' then
    select coalesce(sum(personas), 0)
      into v_ocupados
      from public.reservas
     where fecha = v_reserva.fecha
       and tipo_experiencia = 'omakase'
       and estado not in ('cancelada', 'no_show')
       and id <> p_reserva_id;
    if v_ocupados + v_reserva.personas > v_capacidad_bar then
      raise exception 'No se puede restablecer: la barra de omakase ya no tiene % asientos libres para esa fecha.', v_reserva.personas;
    end if;
  else
    v_capacidad_sal := public.kiku_capacidad_salon_fecha(v_reserva.fecha);
    select coalesce(sum(personas), 0)
      into v_ocupados
      from public.reservas
     where fecha = v_reserva.fecha
       and (tipo_experiencia is null or tipo_experiencia <> 'omakase')
       and estado not in ('cancelada', 'no_show')
       and id <> p_reserva_id;
    if v_ocupados + v_reserva.personas > v_capacidad_sal then
      raise exception 'No se puede restablecer: ya no hay % lugares libres en el salón para esa fecha (quedan %).',
        v_reserva.personas, greatest(0, v_capacidad_sal - v_ocupados);
    end if;
  end if;

  update public.reservas
     set estado        = 'confirmada',
         confirmada_at = now(),
         cancelada_at  = null
   where id = p_reserva_id;

  return 'confirmada'::reserva_estado;
end;
$$;

grant execute on function public.reactivar_reserva(uuid) to authenticated;

comment on function public.reactivar_reserva(uuid) is
  'Restablece una reserva cancelada/no_show volviéndola a confirmada, revalidando el cupo del día. Bloquea si ya no hay lugar.';

notify pgrst, 'reload schema';
