-- ════════════════════════════════════════════════════════════════════════════
-- 55a — DIAGNÓSTICO para el cash flow (solo lectura, opcional). No cambia nada.
--   A) cuántos cobros hay por mes: si algún mes pasa de 1000, el Resumen de
--      Finanzas puede estar sumando de menos (la API corta en 1000 filas); el
--      Cash flow nuevo suma en la base y no tiene ese límite.
--   B) lo pagado por categoría en los últimos meses: es lo que va a aparecer
--      como "real" en cada fila del cash flow.
-- ════════════════════════════════════════════════════════════════════════════

-- A) Cobros por mes (últimos 6 meses).
select to_char(date_trunc('month', created_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM') as mes,
       count(*)                                    as cobros,
       sum(monto)                                  as total_cobrado,
       case when count(*) > 1000 then 'MÁS DE 1000: comparar con "Entró" del Resumen' else 'ok' end as nota
  from public.pagos
 where created_at >= date_trunc('month', now()) - interval '6 months'
   and medio_pago <> 'cuenta_corriente'
 group by 1
 order by 1 desc;

-- B) Pagado por categoría y mes (últimos 3 meses cerrados + el actual).
select to_char(date_trunc('month', fecha), 'YYYY-MM') as mes, categoria, count(*) as pagos, sum(monto) as total
  from public.egresos
 where estado = 'pagado'
   and fecha >= (date_trunc('month', now()) - interval '3 months')::date
 group by 1, 2
 order by 1 desc, 4 desc;
