-- ════════════════════════════════════════════════════════════════════════════
-- 57a — Diagnóstico del IVA de las ventas (SOLO LECTURA, no cambia nada).
-- Se puede correr antes o después del 57. Muestra los mismos números que va a
-- mostrar el dashboard, para compararlos con "Mis Comprobantes" de ARCA.
-- (No llama a iva_ventas_resumen(): desde el editor de Supabase esa función
-- no devuelve nada, porque ahí no hay un usuario del dashboard logueado.)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) IVA de las ventas del mes en curso y del anterior, por fecha de emisión.
--    Las notas de crédito ya están restadas. Usa las mismas reglas que el
--    dashboard: un comprobante A o B sin el desglose guardado se calcula con
--    la alícuota configurada (el punto 2 dice cuántos hay).
with alic as (
  select coalesce((select fc.alicuota_iva from public.facturacion_config fc
                    order by fc.created_at limit 1), 21) as valor
),
c as (
  select date_trunc('month', cf.fecha_emision)::date as mes,
         case when cf.tipo_cbte in (3, 8, 13) then -1 else 1 end as signo,
         cf.importe_total as total,
         (cf.importe_total > 0 and cf.importe_neto = 0 and cf.importe_iva = 0) as sin_desglose,
         cf.letra, cf.importe_neto, cf.importe_iva, a.valor as alicuota
    from public.comprobantes_fiscales cf
    cross join alic a
   where cf.fecha_emision >= (date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires')) - interval '1 month')::date
     and ((cf.tipo_cbte in (3, 8, 13) and cf.estado = 'autorizado')
       or (cf.tipo_cbte in (1, 6, 11, 2, 7, 12) and cf.estado in ('autorizado', 'anulado')))
)
select to_char(mes, 'MM/YYYY') as mes,
       count(*) filter (where signo = 1)  as facturas,
       count(*) filter (where signo = -1) as notas_de_credito,
       round(sum(signo * case when sin_desglose and letra = 'C' then total
                              when sin_desglose then round(total / (1 + alicuota / 100), 2)
                              else importe_neto end), 2) as neto_sin_iva,
       round(sum(signo * case when sin_desglose and letra = 'C' then 0
                              when sin_desglose then total - round(total / (1 + alicuota / 100), 2)
                              else importe_iva end), 2) as iva,
       round(sum(signo * total), 2) as total_facturado
  from c
 group by mes
 order by mes;

-- 2) Comprobantes A o B autorizados que NO tienen el desglose guardado (neto e
--    IVA en cero). Lo esperable es 0. Si hay, el dashboard les calcula el IVA
--    con la alícuota configurada y lo avisa.
select count(*) as sin_desglose_guardado
  from public.comprobantes_fiscales
 where estado in ('autorizado', 'anulado')
   and letra <> 'C'
   and coalesce(importe_total, 0) > 0
   and coalesce(importe_neto, 0) = 0
   and coalesce(importe_iva, 0) = 0;

-- 3) Comprobantes donde neto + IVA no da el total (más de 2 centavos).
--    Lo esperable es que no devuelva filas.
select fecha_emision, letra, tipo_cbte, punto_venta, numero, importe_neto, importe_iva, importe_total
  from public.comprobantes_fiscales
 where estado in ('autorizado', 'anulado')
   and abs(coalesce(importe_neto, 0) + coalesce(importe_iva, 0) - coalesce(importe_total, 0)) > 0.02
   and not (coalesce(importe_neto, 0) = 0 and coalesce(importe_iva, 0) = 0)
 order by fecha_emision desc
 limit 50;

-- 4) Facturas emitidas un día distinto al del pedido (se facturó después, o la
--    venta cruzó la medianoche). Son las que hacen que el "Facturado" de Caja
--    (que va por fecha del pedido) no coincida al centavo con ARCA (que va por
--    fecha de emisión) en los bordes de un período.
select count(*) as facturas_con_fecha_distinta_al_pedido
  from public.comprobantes_fiscales c
  join public.pedidos p on p.id = c.pedido_id
 where c.estado in ('autorizado', 'anulado')
   and c.tipo_cbte in (1, 6, 11)
   and c.fecha_emision >= (now() - interval '60 days')::date
   and c.fecha_emision <> (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date;

-- 5) Alícuota configurada (hoy tiene que decir 21).
select alicuota_iva, condicion_iva from public.facturacion_config order by created_at limit 1;
