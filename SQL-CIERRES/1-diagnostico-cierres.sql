-- SOLO LEE. No modifica nada. Muestra que cierres quedaron con el esperado mal.
with medios(medio) as (
  values ('efectivo'), ('transferencia'), ('tarjeta_debito'), ('tarjeta_credito')
),
calculado as (
  select
    t.id as turno_id,
    m.medio,
    (case when m.medio = 'efectivo' then coalesce(t.apertura_monto, 0) else 0 end)
    + coalesce((
        select sum(p.monto)
        from public.pagos p
        join public.pedidos ped on ped.id = p.pedido_id
        where p.medio_pago = m.medio
          and (p.caja_turno_id = t.id
               or (p.caja_turno_id is null
                   and p.created_at >= t.apertura_at
                   and p.created_at <= t.cierre_at))
      ), 0)
    + coalesce((
        select sum(
          case
            when cm.tipo = 'ajuste' then case when cm.categoria = 'faltante' then -1 else 1 end
            when cm.tipo in ('egreso', 'retiro') then -1
            else 1
          end * cm.monto)
        from public.caja_movimientos cm
        where coalesce(cm.medio_pago, 'efectivo') = m.medio
          and (cm.turno_id = t.id
               or (cm.turno_id is null
                   and cm.created_at >= t.apertura_at
                   and cm.created_at <= t.cierre_at))
      ), 0) as esperado_real
  from public.caja_turnos t
  cross join medios m
  where t.estado = 'cerrado' and t.cierre_at is not null
),
resumen as (
  select c.turno_id, round(sum(c.esperado_real), 2) as esperado_real_total
  from calculado c
  group by c.turno_id
)
select
  t.business_date                                   as fecha,
  t.caja_nombre                                     as caja,
  t.efectivo_esperado                               as esperado_guardado,
  r.esperado_real_total                             as esperado_real,
  t.cierre_monto                                    as contado,
  t.diferencia                                      as diferencia_guardada,
  round(coalesce(t.cierre_monto,0) - r.esperado_real_total, 2) as diferencia_real,
  case when r.esperado_real_total <> 0
       then round(t.efectivo_esperado / r.esperado_real_total, 2)
  end                                               as ratio
from public.caja_turnos t
join resumen r on r.turno_id = t.id
where abs(coalesce(t.efectivo_esperado, 0) - r.esperado_real_total) > 0.005
order by t.business_date desc;
