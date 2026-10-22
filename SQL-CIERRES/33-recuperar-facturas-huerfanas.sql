-- 33 · Recuperar facturas emitidas en ARCA que no se guardaron.
-- Correr DESPUES del SQL 34 (migracion 20261006020000) y de revisar el 32.
--
-- Receptores de las Facturas A huerfanas (segun el diagnostico 32 del 06/10):
-- pedido 904 -> Brochar SRL; pedido 891 -> INDIGO IA SAS (confirmar razon
-- social exacta). El pedido 616 es una Factura B (consumidor final).
-- Los huerfanos de mayo son pruebas de homologacion sin pedido: se ignoran.
--
-- Regla: la primera factura huerfana de cada pedido queda 'autorizado' si
-- el pedido no tiene otra vigente; las demas (reintentos) quedan 'anulado'
-- con la nota "DUPLICADA": existen en ARCA y hay que hacerles nota de
-- credito desde Comprobantes en linea (o desde el dashboard cuando se
-- agregue el boton). Nada se borra.

with receptores (pedido_nro, receptor_nombre, receptor_cuit, receptor_condicion) as (
  values
    (904, 'Brochar SRL',   '30708091665', 'Responsable Inscripto'),
    (891, 'INDIGO IA SAS', '30719022126', 'Responsable Inscripto')
    -- 616 es Factura B a consumidor final: no hace falta fila.
),
huerfanas as (
  select
    l.created_at,
    (l.request_payload ->> 'pedido_id')::uuid        as pedido_id,
    p.numero                                          as pedido_nro,
    (l.request_payload ->> 'tipo_cbte')::int         as tipo_cbte,
    (l.request_payload ->> 'punto_venta')::int       as punto_venta,
    (l.response_payload ->> 'numero')::int           as numero,
    l.response_payload ->> 'cae'                     as cae,
    nullif(l.response_payload ->> 'cae_vto', '')::date as cae_vto,
    (l.request_payload -> 'importes' ->> 'importeNeto')::numeric  as importe_neto,
    (l.request_payload -> 'importes' ->> 'importeIva')::numeric   as importe_iva,
    (l.request_payload -> 'importes' ->> 'importeTotal')::numeric as importe_total,
    l.response_payload                                as arca_response,
    l.request_payload                                 as arca_request,
    row_number() over (partition by l.request_payload ->> 'pedido_id'
                       order by (l.response_payload ->> 'numero')::int) as orden
  from arca_request_log l
  join pedidos p on p.id = (l.request_payload ->> 'pedido_id')::uuid
  where l.metodo = 'FECAESolicitar'
    and l.response_payload ->> 'resultado' = 'A'
    and coalesce(l.ambiente, 'produccion') = 'produccion'
    and not exists (
      select 1 from comprobantes_fiscales c
       where c.tipo_cbte = (l.request_payload ->> 'tipo_cbte')::int
         and c.punto_venta = (l.request_payload ->> 'punto_venta')::int
         and c.numero = (l.response_payload ->> 'numero')::int
    )
)
insert into comprobantes_fiscales (
  pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, concepto,
  doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva,
  importe_neto, importe_iva, importe_total, moneda, cotizacion,
  cae, cae_vto, arca_request, arca_response, error_mensaje
)
select
  h.pedido_id,
  case
    when h.orden = 1 and not exists (
      select 1 from comprobantes_fiscales c
       where c.pedido_id = h.pedido_id and c.estado = 'autorizado' and c.tipo_cbte in (1, 6, 11))
    then 'autorizado' else 'anulado' end,
  case when h.tipo_cbte in (1,2,3) then 'A' when h.tipo_cbte in (6,7,8) then 'B' else 'C' end,
  h.tipo_cbte, h.punto_venta, h.numero,
  (h.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 1,
  case when h.tipo_cbte in (1,2,3) then 80 else 99 end,
  case when h.tipo_cbte in (1,2,3) then coalesce(d.receptor_cuit, 'FALTA') else '0' end,
  case when h.tipo_cbte in (1,2,3) then coalesce(d.receptor_nombre, 'FALTA RECEPTOR') else 'Consumidor Final' end,
  case when h.tipo_cbte in (1,2,3) then d.receptor_condicion else 'Consumidor Final' end,
  h.importe_neto, h.importe_iva, h.importe_total, 'PES', 1,
  h.cae, h.cae_vto, h.arca_request, h.arca_response,
  case
    when h.orden = 1 and not exists (
      select 1 from comprobantes_fiscales c
       where c.pedido_id = h.pedido_id and c.estado = 'autorizado' and c.tipo_cbte in (1, 6, 11))
    then 'Recuperada del log de ARCA (no se habia guardado)'
    else 'DUPLICADA: emitida por reintento, pendiente nota de credito en ARCA' end
from huerfanas h
left join receptores d on d.pedido_nro = h.pedido_nro
order by h.pedido_id, h.orden
returning letra, lpad(punto_venta::text,5,'0')||'-'||lpad(numero::text,8,'0') as nro, cae, estado, importe_total;
