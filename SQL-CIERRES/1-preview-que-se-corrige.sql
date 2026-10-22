-- SOLO LEE. Vista previa: exactamente que medios va a corregir la reparacion.
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
)
select
  t.business_date                            as fecha,
  e.medio,
  e.esperado_guardado                        as esperado_guardado,
  e.real_norm                                as esperado_corregido,
  round(e.esperado_guardado - e.real_norm,2) as se_descuenta
from evaluado e
join public.caja_turnos t on t.id = e.turno_id
where e.es_corrupto
order by t.business_date desc, e.medio;
