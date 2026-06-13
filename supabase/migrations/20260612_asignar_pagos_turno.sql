-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Adjudicar pagos "sin turno" a un turno abierto
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: la vista public.pagos_arqueo se lee sin RLS (security definer por
-- defecto), así que el panel "Pedidos cobrados sin turno" muestra los pagos a
-- cualquier usuario autenticado. Pero el UPDATE va a la tabla base public.pagos,
-- que tiene RLS "for all ... using is_admin()". Si quien aprieta "Asignar" NO es
-- admin (p. ej. un mozo), el update afecta 0 filas y NO devuelve error → los
-- pagos "no desaparecen" al actualizar.
--
-- SOLUCIÓN: una función security definer que valida admin explícitamente y hace
-- el UPDATE server-side, devolviendo cuántas filas asignó. Mismo patrón que
-- public.reabrir_turno. Así el front puede avisar con claridad si no se asignó
-- nada en vez de fallar en silencio.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.asignar_pagos_a_turno(
  p_turno_id uuid,
  p_pago_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar pagos a un turno de caja.';
  end if;
  if p_turno_id is null then
    raise exception 'Falta el turno destino.';
  end if;
  if p_pago_ids is null or array_length(p_pago_ids, 1) is null then
    return 0;
  end if;

  update public.pagos
     set caja_turno_id = p_turno_id
   where id = any(p_pago_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.asignar_pagos_a_turno(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
