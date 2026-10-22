-- 27 · Diagnostico ARCA (SOLO LECTURA). Por que ARCA rechaza las facturas.

-- A) Ultimos 10 comprobantes rechazados: el motivo real esta en "observaciones"
select
  c.created_at at time zone 'America/Argentina/Buenos_Aires' as cuando,
  c.tipo_cbte, c.punto_venta, c.numero, c.fecha_emision,
  c.importe_neto, c.importe_iva, c.importe_total,
  c.doc_tipo, c.doc_nro, c.receptor_condicion_iva,
  c.error_mensaje,
  c.arca_response -> 'observaciones'  as observaciones,
  c.arca_response -> 'errores'        as errores,
  c.arca_response ->> 'resultado'     as resultado
from comprobantes_fiscales c
where c.estado = 'rechazado'
order by c.created_at desc
limit 10;

-- B) Ultimo comprobante AUTORIZADO (para saber si alguna vez anduvo)
select created_at at time zone 'America/Argentina/Buenos_Aires' as cuando,
       tipo_cbte, punto_venta, numero, fecha_emision, importe_total
from comprobantes_fiscales
where estado = 'autorizado'
order by created_at desc
limit 3;

-- C) Config fiscal
select razon_social, cuit, condicion_iva, punto_venta, ambiente,
       alicuota_iva, permite_factura_a
from facturacion_config
order by updated_at desc
limit 1;
