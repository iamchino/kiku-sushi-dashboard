-- ============================================================
-- Migración: `apertura_sugerida()` — el arrastre deja de depender de ver la
--            caja fuerte
--
-- EL PROBLEMA
-- --------------------------------------------------------------------------
-- Al abrir un turno, el dashboard sugiere el fondo inicial con el arrastre:
--
--     efectivo contado en el último cierre
--   − depósitos a la caja fuerte hechos DESPUÉS de ese cierre
--
-- Ese segundo término lo calculaba el front leyendo `caja_fuerte_movimientos`
-- directo. Funciona mientras quien abre el turno tenga permiso de VER la caja
-- fuerte. En cuanto se le saca —que es justo lo que se quiere para el
-- encargado: que deposite pero no vea el saldo— la RLS no da error: devuelve
-- CERO FILAS. El cálculo entonces da "no hubo depósitos" y sugiere arrastrar
-- toda la plata del cierre anterior, incluida la que ya está guardada.
--
-- Un permiso menos no puede cambiar un número. Ese es el bug.
--
-- LA SOLUCIÓN
-- --------------------------------------------------------------------------
-- Mover el cálculo a una función `security definer`: corre con los privilegios
-- del dueño de la función, así que lee los depósitos completos sin importar qué
-- ve quien la llama. Devuelve solo el número agregado y la fecha del cierre —
-- nunca el saldo ni el detalle de movimientos, que es lo que se está
-- protegiendo.
--
-- Requiere permiso de VER caja: es información del arqueo, y sin eso no se
-- abre ningún turno.
-- ============================================================

begin;

create or replace function public.apertura_sugerida()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turno      record;
  v_efectivo   numeric;
  v_depositado numeric;
begin
  if not (public.tiene_permiso('caja', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para ver la caja.';
  end if;

  -- Último cierre. Desempate por created_at: dos cierres con el mismo
  -- cierre_at (p. ej. corregidos en la misma operación) no deben devolver el
  -- turno viejo.
  select t.id, t.business_date, t.cierre_at, t.denominaciones_cierre
    into v_turno
  from public.caja_turnos t
  where t.estado = 'cerrado'
  order by t.cierre_at desc nulls last, t.created_at desc
  limit 1;

  if v_turno.id is null then
    return null;
  end if;

  -- Lo CONTADO manda sobre lo esperado: es lo que quedó de verdad en el cajón.
  v_efectivo := coalesce(
    (v_turno.denominaciones_cierre -> 'medios' -> 'efectivo' ->> 'contado')::numeric,
    (v_turno.denominaciones_cierre -> 'medios' -> 'efectivo' ->> 'esperado')::numeric
  );

  if v_efectivo is null then
    return null;
  end if;

  select coalesce(sum(m.monto), 0) into v_depositado
  from public.caja_fuerte_movimientos m
  where m.turno_id = v_turno.id
    and m.tipo = 'deposito'
    and m.created_at > v_turno.cierre_at;

  return jsonb_build_object(
    'monto', greatest(0, v_efectivo - v_depositado),
    'fecha', v_turno.business_date
  );
end $$;

comment on function public.apertura_sugerida() is
  'Fondo inicial sugerido para el proximo turno: efectivo contado en el ultimo '
  'cierre menos los depositos a la caja fuerte posteriores. Es security definer '
  'a proposito: el calculo no puede depender de que quien abre el turno tenga '
  'permiso de ver la caja fuerte (sin el, la RLS devuelve cero depositos y el '
  'arrastre sugiere de mas). Devuelve solo el agregado, nunca el saldo ni los '
  'movimientos.';

revoke execute on function public.apertura_sugerida() from public;
grant  execute on function public.apertura_sugerida() to authenticated;

commit;

notify pgrst, 'reload schema';
