-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (solo lectura): por qué el efectivo esperado del turno abierto
-- da negativo. Lista cada movimiento de efectivo del turno con el pago que lo
-- originó y de dónde se dijo que salía la plata.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) El turno abierto y su cuenta de efectivo
with t as (
  select id, caja_nombre, business_date, apertura_monto
    from public.caja_turnos
   where estado = 'abierto'
   order by created_at desc
   limit 1
)
select t.caja_nombre, t.business_date, t.apertura_monto as apertura,
       (select coalesce(sum(p.monto), 0) from public.pagos p
         where p.caja_turno_id = t.id and p.medio_pago = 'efectivo') as ventas_efectivo,
       (select coalesce(sum(m.monto), 0) from public.caja_movimientos m
         where m.turno_id = t.id and coalesce(m.medio_pago, 'efectivo') = 'efectivo'
           and m.tipo = 'ingreso' and m.afecta_arqueo) as ingresos_efectivo,
       (select coalesce(sum(m.monto), 0) from public.caja_movimientos m
         where m.turno_id = t.id and coalesce(m.medio_pago, 'efectivo') = 'efectivo'
           and m.tipo = 'egreso' and m.afecta_arqueo) as egresos_efectivo
  from t;

-- 2) Cada movimiento de efectivo del turno, con su pago y origen declarado
select m.created_at::time(0) as hora,
       m.tipo,
       m.monto,
       m.descripcion,
       e.categoria,
       e.pagado_desde       as origen_declarado,
       e.medio_pago         as medio_del_pago,
       e.id                 as egreso_id
  from public.caja_movimientos m
  left join public.egresos e on e.id = m.egreso_id
 where m.turno_id = (select id from public.caja_turnos where estado = 'abierto' order by created_at desc limit 1)
   and coalesce(m.medio_pago, 'efectivo') = 'efectivo'
   and m.afecta_arqueo
 order by m.created_at;

-- Cómo se corrige (desde el dashboard, no con SQL):
--   · Un pago que en realidad salió de la caja fuerte u otro lado:
--     Caja → Pagos → lápiz sobre el pago → "¿De dónde sale el efectivo?" →
--     Caja fuerte / Otro efectivo. editar_pago() borra solo el movimiento del turno.
--   · Plata que entró a la caja y no se registró (ej. retiro de la caja fuerte
--     para pagar a un proveedor): Arqueo → Movimiento → Ingreso, por ese monto.
