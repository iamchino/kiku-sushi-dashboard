-- SOLO LEE. Muestra que contados son un eco del esperado roto y se van a corregir.
with medios(medio) as (
  values ('efectivo'), ('transferencia'), ('tarjeta_debito'), ('tarjeta_credito')
),
base as (
  select
    t.id as turno_id, t.business_date, t.caja_nombre, m.medio,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'esperado')::numeric, 0) as esperado,
    coalesce((t.denominaciones_cierre -> 'medios' -> m.medio ->> 'contado')::numeric, 0)  as contado,
    coalesce((
      select sum(cm.monto) from public.caja_movimientos cm
      where cm.turno_id = t.id and cm.afecta_arqueo = false
        and cm.tipo = 'egreso'
        and coalesce(cm.medio_pago, 'efectivo') = m.medio
    ), 0) as pagos_del_banco
  from public.caja_turnos t
  cross join medios m
  where t.estado = 'cerrado' and t.cierre_at is not null
    and coalesce((t.denominaciones_cierre ->> 'banco_revertido')::boolean, false)
    and coalesce((t.denominaciones_cierre ->> 'banco_contado_revertido')::boolean, false) = false
)
select
  b.business_date as fecha, b.caja_nombre as caja, b.medio,
  b.contado         as contado_guardado,
  b.pagos_del_banco,
  b.esperado        as contado_corregido,
  round(b.esperado - b.contado, 2) as se_suma
from base b
where b.pagos_del_banco > 0
  and abs(b.contado - (b.esperado - b.pagos_del_banco)) < 0.005
order by b.business_date desc, b.medio;
