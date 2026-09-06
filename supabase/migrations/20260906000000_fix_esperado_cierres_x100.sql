-- ============================================================
-- Migración: reparar SOLO los cierres cuyo "esperado" quedó inflado por el
--            bug de parseo decimal. Todo lo demás se deja intacto.
--
-- EL BUG (front, corregido en el mismo commit que esta migración)
-- --------------------------------------------------------------------------
-- Al cerrar un turno, el panel mandaba el esperado de cada medio como NUMERO
-- ya calculado (p. ej. 377345.65) y el hook lo pasaba por parseAmount(), que
-- estaba escrito para texto en formato es-AR: hacía
--
--     String(value).replace(/\./g, '')      -- "377345.65" -> "37734565"
--
-- es decir, borraba el punto decimal. El esperado se guardaba corrido tantos
-- lugares como decimales tuviera (x100 con centavos, x10 con un decimal) y la
-- diferencia del cierre salía disparada. Con montos redondos no hay punto que
-- borrar y el número salía bien, por eso el error aparecía salteado.
--
-- El CONTADO nunca se vio afectado: viene de un input de texto en es-AR, que
-- era justo el formato que parseAmount esperaba.
--
-- POR QUÉ NO RECALCULA TODO
-- --------------------------------------------------------------------------
-- Tentaba recalcular el esperado de todos los cierres con la fórmula de la
-- pantalla. Es incorrecto: un turno cuyos pagos se reasignaron o cuyos
-- movimientos se editaron DESPUÉS del cierre (cosa que el dashboard permite a
-- propósito) da hoy un esperado distinto del que tenía ese día, sin que haya
-- ningún bug. Recalcularlo pisaría el registro histórico de lo que realmente
-- se cerró.
--
-- Por eso esta migración toca un medio sólo cuando puede DEMOSTRAR que está
-- corrupto, reproduciendo la huella exacta del bug:
--
--     guardado = real_sin_ceros_a_la_derecha * 10 ^ (cantidad de decimales)
--
-- Esa igualdad no se da por casualidad. Si un medio no la cumple, se deja como
-- está, aunque hoy el recalculo diera otra cosa.
--
-- QUÉ ESCRIBE
-- --------------------------------------------------------------------------
--   · denominaciones_cierre.medios[medio].esperado  -> sólo en los corruptos
--   · efectivo_esperado (el total)                  -> suma de los esperados ya corregidos
--   · diferencia                                    -> contado − total corregido
-- El contado no se toca nunca: es lo que contó una persona.
--
-- Es idempotente: una vez corregido, el medio deja de cumplir la huella y la
-- segunda corrida no cambia ninguna fila.
-- ============================================================

begin;

with medios(medio) as (
  values ('efectivo'), ('transferencia'), ('tarjeta_debito'), ('tarjeta_credito')
),

-- Esperado real de cada (turno, medio), con la misma fórmula y el mismo
-- criterio de pertenencia al turno que usa la pantalla en vivo: por
-- turno_id / caja_turno_id y, si la fila no quedó vinculada, por caer dentro
-- de la ventana apertura_at → cierre_at.
calculado as (
  select
    t.id as turno_id,
    m.medio,
    (t.denominaciones_cierre -> 'medios' -> m.medio ->> 'esperado')::numeric as esperado_guardado,
    (case when m.medio = 'efectivo' then coalesce(t.apertura_monto, 0) else 0 end)
    + coalesce((
        select sum(p.monto)
        from public.pagos p
        join public.pedidos ped on ped.id = p.pedido_id
        where p.medio_pago = m.medio
          and (
            p.caja_turno_id = t.id
            or (p.caja_turno_id is null
                and p.created_at >= t.apertura_at
                and p.created_at <= t.cierre_at)
          )
      ), 0)
    + coalesce((
        select sum(
          case
            when cm.tipo = 'ajuste' then
              case when cm.categoria = 'faltante' then -1 else 1 end
            when cm.tipo in ('egreso', 'retiro') then -1
            else 1
          end * cm.monto
        )
        from public.caja_movimientos cm
        where coalesce(cm.medio_pago, 'efectivo') = m.medio
          and (
            cm.turno_id = t.id
            or (cm.turno_id is null
                and cm.created_at >= t.apertura_at
                and cm.created_at <= t.cierre_at)
          )
      ), 0) as esperado_real
  from public.caja_turnos t
  cross join medios m
  where t.estado = 'cerrado'
    and t.cierre_at is not null
),

-- La huella del bug. trim_scale saca los ceros a la derecha para que la
-- cantidad de decimales coincida con la que veía JavaScript: en la base
-- 331729.00 tiene escala 2, pero String(331729) en el navegador no tiene punto
-- y por lo tanto ese medio nunca se corrompió.
marcado as (
  select
    c.*,
    trim_scale(c.esperado_real) as real_norm,
    scale(trim_scale(c.esperado_real)) as decimales
  from calculado c
),
evaluado as (
  select
    m.*,
    (
      m.decimales > 0
      and m.esperado_guardado is not null
      and m.esperado_guardado = m.real_norm * (10::numeric ^ m.decimales)
    ) as es_corrupto
  from marcado m
),

-- Un renglón por turno: el jsonb nuevo (corregido sólo donde corresponde) y el
-- total resultante.
armado as (
  select
    e.turno_id,
    bool_or(e.es_corrupto) as tiene_corruptos,
    jsonb_build_object(
      'medios',
      jsonb_object_agg(
        e.medio,
        jsonb_build_object(
          'esperado', case when e.es_corrupto
                           then e.real_norm
                           else coalesce(e.esperado_guardado, 0) end,
          'contado', round(coalesce(
            (t.denominaciones_cierre -> 'medios' -> e.medio ->> 'contado')::numeric, 0
          ), 2)
        )
      )
    ) as medios_nuevo,
    sum(case when e.es_corrupto
             then e.real_norm
             else coalesce(e.esperado_guardado, 0) end) as esperado_total_nuevo
  from evaluado e
  join public.caja_turnos t on t.id = e.turno_id
  group by e.turno_id
)

update public.caja_turnos t
set
  denominaciones_cierre = coalesce(t.denominaciones_cierre, '{}'::jsonb) || a.medios_nuevo,
  efectivo_esperado     = round(a.esperado_total_nuevo, 2),
  diferencia            = round(coalesce(t.cierre_monto, 0) - a.esperado_total_nuevo, 2),
  updated_at            = now()
from armado a
where t.id = a.turno_id
  -- Sólo turnos con al menos un medio que probadamente cargó el bug.
  and a.tiene_corruptos;

commit;
