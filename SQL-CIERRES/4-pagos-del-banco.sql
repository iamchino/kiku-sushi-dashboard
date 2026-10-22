-- ============================================================
-- Migración: los pagos que salen de la cuenta bancaria dejan de descontar
--            del arqueo del turno
--
-- EL PROBLEMA
-- --------------------------------------------------------------------------
-- La migración 20260821010000_pago_desde_banco partía de esta premisa:
--
--   "La plata sale de la cuenta del negocio, así que tiene que verse en el
--    arqueo — restando del ESPERADO EN TRANSFERENCIAS del turno [...] el
--    cierre del turno cuadra contra el resumen del banco."
--
-- La premisa no se sostiene en la operación real: el dashboard no tiene acceso
-- a la cuenta bancaria. El "contado" de transferencias es lo que ENTRÓ de los
-- clientes, no el saldo del banco. Restarle ahí los pagos a proveedores mezcla
-- dos libros distintos, y cuando los pagos del día superan a los cobros por
-- transferencia el esperado se va a NEGATIVO (turnos del 02/09 y 04/09:
-- −$2.707.241,17 y −$200.585,77).
--
-- LA REGLA NUEVA
-- --------------------------------------------------------------------------
-- Un pago con origen 'banco' se sigue registrando igual y se sigue viendo en
-- la lista de movimientos del turno — pero NO entra en ninguna suma del
-- arqueo. Sale de una cuenta que la caja no controla.
--
-- Se implementa con una columna `afecta_arqueo` en caja_movimientos y un
-- trigger que la deriva de egresos.pagado_desde. Se eligió un trigger en vez
-- de reescribir registrar_pago() y editar_pago(): la fuente de verdad pasa a
-- ser el origen del egreso, queda cubierto cualquier camino que cree o mueva
-- un movimiento (alta, edición, cambio de origen) y no hay que duplicar la
-- regla en dos funciones largas.
--
-- IMPORTANTE — ORDEN DE EJECUCIÓN
-- --------------------------------------------------------------------------
-- Correr ANTES la reparación del bug del x100
-- (20260906000000_fix_esperado_cierres_x100.sql). Esta migración AJUSTA el
-- esperado guardado sumándole lo que se había descontado de más; si el valor
-- guardado todavía está corrupto, el ajuste se aplica sobre un número basura.
--
-- Es idempotente: deja la marca `banco_revertido` en denominaciones_cierre y
-- no vuelve a ajustar un turno ya ajustado.
-- ============================================================

begin;

-- ── 1) La columna ───────────────────────────────────────────────────────────
alter table public.caja_movimientos
  add column if not exists afecta_arqueo boolean not null default true;

comment on column public.caja_movimientos.afecta_arqueo is
  'false = el movimiento se muestra en el turno pero no entra en ninguna suma del arqueo. Lo usan los pagos con origen "banco": salen de la cuenta bancaria del negocio, que la caja del local no controla. Lo mantiene el trigger caja_mov_afecta_arqueo a partir de egresos.pagado_desde.';

-- ── 2) El trigger que la mantiene ───────────────────────────────────────────
create or replace function public.caja_mov_set_afecta_arqueo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen text;
begin
  -- Movimiento manual (sin egreso detrás): no se toca, vale lo que venga.
  if new.egreso_id is null then
    return new;
  end if;

  select e.pagado_desde into v_origen
  from public.egresos e
  where e.id = new.egreso_id;

  -- La plata del banco no pasa por la caja del local.
  new.afecta_arqueo := (v_origen is distinct from 'banco');
  return new;
end $$;

drop trigger if exists trg_caja_mov_afecta_arqueo on public.caja_movimientos;

create trigger trg_caja_mov_afecta_arqueo
  before insert or update of egreso_id, medio_pago, tipo
  on public.caja_movimientos
  for each row
  execute function public.caja_mov_set_afecta_arqueo();

-- ── 3) Backfill de los movimientos ya cargados ──────────────────────────────
-- Por el egreso, que es la fuente de verdad.
update public.caja_movimientos cm
set afecta_arqueo = false
from public.egresos e
where e.id = cm.egreso_id
  and e.pagado_desde = 'banco'
  and cm.afecta_arqueo;

-- Huérfanos: movimientos cuyo egreso ya no está pero que llevan la descripción
-- exacta que escribe registrar_pago() para el origen banco.
update public.caja_movimientos cm
set afecta_arqueo = false
where cm.egreso_id is null
  and cm.tipo = 'egreso'
  and cm.medio_pago = 'transferencia'
  and cm.descripcion like 'Pago por transferencia: %'
  and cm.afecta_arqueo;

-- ── 4) Revertir lo que ya habían descontado en los cierres ──────────────────
-- No se recalcula el turno entero: se le SUMA de vuelta exactamente lo que
-- estos movimientos habían restado. Así no se pisa ningún otro valor guardado
-- (por ejemplo turnos editados después del cierre, que tienen su propio
-- historial legítimo).
with medios(medio) as (
  values ('efectivo'), ('transferencia'), ('tarjeta_debito'), ('tarjeta_credito')
),
base as (
  select
    t.id as turno_id,
    m.medio,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'esperado')::numeric, 0) as esperado_guardado,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'contado')::numeric, 0)  as contado,
    coalesce((
      select sum(cm.monto)
      from public.caja_movimientos cm
      where cm.turno_id = t.id
        and cm.afecta_arqueo = false
        and cm.tipo = 'egreso'            -- eran los que restaban
        and coalesce(cm.medio_pago, 'efectivo') = m.medio
    ), 0) as reverso
  from public.caja_turnos t
  cross join medios m
  where t.estado = 'cerrado'
    and t.cierre_at is not null
    and coalesce((t.denominaciones_cierre ->> 'banco_revertido')::boolean, false) = false
),
armado as (
  select
    b.turno_id,
    sum(b.reverso) as reverso_total,
    jsonb_build_object(
      'medios',
      jsonb_object_agg(
        b.medio,
        jsonb_build_object(
          'esperado', b.esperado_guardado + b.reverso,
          'contado',  b.contado
        )
      )
    ) as medios_nuevo,
    sum(b.esperado_guardado + b.reverso) as esperado_total_nuevo
  from base b
  group by b.turno_id
)
update public.caja_turnos t
set
  denominaciones_cierre = coalesce(t.denominaciones_cierre, '{}'::jsonb)
                          || a.medios_nuevo
                          || jsonb_build_object('banco_revertido', true),
  efectivo_esperado     = round(a.esperado_total_nuevo, 2),
  diferencia            = round(coalesce(t.cierre_monto, 0) - a.esperado_total_nuevo, 2),
  updated_at            = now()
from armado a
where t.id = a.turno_id
  and a.reverso_total > 0;

commit;

notify pgrst, 'reload schema';
