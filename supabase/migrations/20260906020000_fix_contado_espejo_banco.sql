-- ============================================================
-- Migración: corregir el CONTADO de los cierres donde era un eco del esperado
--            roto por los pagos del banco
--
-- QUÉ QUEDÓ MAL
-- --------------------------------------------------------------------------
-- La migración 20260906010000 sacó los pagos del banco del arqueo y le devolvió
-- al ESPERADO lo que le habían restado de más. Correcto — pero a propósito no
-- tocó el CONTADO, con el argumento de que es lo que contó una persona.
--
-- En transferencias ese argumento no aplica: no hay nada físico que contar. En
-- la práctica quien cierra copia al contado el número que la pantalla le
-- muestra como esperado. Y esa noche la pantalla mostraba el esperado ya
-- descontado por los pagos del banco.
--
-- Resultado: el esperado quedó bien y el contado quedó siendo el esperado
-- VIEJO, así que la diferencia del turno sigue mostrando en rojo exactamente el
-- total de los pagos del banco. Ejemplo real (turno del 05/09):
--
--     esperado transferencias  $887.000,00   (los 9 cobros, correcto)
--     pagos del banco        $1.105.285,00
--     contado guardado        -$218.285,00   = 887.000 − 1.105.285
--     diferencia             -$1.105.285,00
--
-- QUÉ HACE
-- --------------------------------------------------------------------------
-- Igual que la reparación del x100: no asume, DEMUESTRA. Corrige el contado de
-- un medio sólo cuando vale exactamente
--
--     contado = esperado_actual − (pagos del banco de ese medio en ese turno)
--
-- o sea, cuando es idéntico al esperado que la pantalla mostraba antes del
-- arreglo. Esa igualdad al centavo no se da por casualidad: es la huella de que
-- el número se copió, no se contó. Si un medio no la cumple —porque alguien
-- contó de verdad y le dio otra cosa— se deja intacto.
--
-- Después recalcula cierre_monto (la suma de los contados) y la diferencia.
--
-- ORDEN: correr DESPUÉS de 20260906010000_pagos_banco_no_afectan_arqueo.sql.
-- Sólo mira turnos que ya tengan la marca banco_revertido.
--
-- Idempotente: deja la marca banco_contado_revertido.
-- ============================================================

begin;

with medios(medio) as (
  values ('efectivo'), ('transferencia'), ('tarjeta_debito'), ('tarjeta_credito')
),
base as (
  select
    t.id as turno_id,
    m.medio,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'esperado')::numeric, 0) as esperado,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'contado')::numeric, 0)  as contado,
    coalesce((
      select sum(cm.monto)
      from public.caja_movimientos cm
      where cm.turno_id = t.id
        and cm.afecta_arqueo = false
        and cm.tipo = 'egreso'
        and coalesce(cm.medio_pago, 'efectivo') = m.medio
    ), 0) as reverso
  from public.caja_turnos t
  cross join medios m
  where t.estado = 'cerrado'
    and t.cierre_at is not null
    -- Sólo los que ya pasaron por la corrección del esperado...
    and coalesce((t.denominaciones_cierre ->> 'banco_revertido')::boolean, false)
    -- ...y todavía no por esta.
    and coalesce((t.denominaciones_cierre ->> 'banco_contado_revertido')::boolean, false) = false
),
evaluado as (
  select
    b.*,
    -- La huella: el contado es, al centavo, el esperado de antes del arreglo.
    (b.reverso > 0 and abs(b.contado - (b.esperado - b.reverso)) < 0.005) as es_eco
  from base b
),
armado as (
  select
    e.turno_id,
    bool_or(e.es_eco) as tiene_eco,
    jsonb_build_object(
      'medios',
      jsonb_object_agg(
        e.medio,
        jsonb_build_object(
          'esperado', e.esperado,
          'contado',  case when e.es_eco then e.esperado else e.contado end
        )
      )
    ) as medios_nuevo,
    sum(case when e.es_eco then e.esperado else e.contado end) as contado_total_nuevo
  from evaluado e
  group by e.turno_id
)
update public.caja_turnos t
set
  denominaciones_cierre = coalesce(t.denominaciones_cierre, '{}'::jsonb)
                          || a.medios_nuevo
                          || jsonb_build_object('banco_contado_revertido', true),
  cierre_monto          = round(a.contado_total_nuevo, 2),
  diferencia            = round(a.contado_total_nuevo - coalesce(t.efectivo_esperado, 0), 2),
  updated_at            = now()
from armado a
where t.id = a.turno_id
  and a.tiene_eco
  -- cierre_monto tiene un check >= 0: si el recálculo diera negativo, se deja
  -- el turno como está en vez de abortar toda la migración.
  and a.contado_total_nuevo >= 0;

commit;
