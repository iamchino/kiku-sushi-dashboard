-- 32 · Diagnostico (SOLO LECTURA): facturas que ARCA autorizo (CAE) pero
-- no quedaron guardadas en comprobantes_fiscales (fallo el insert por el
-- indice unico "una factura por pedido").

select
  l.created_at at time zone 'America/Argentina/Buenos_Aires' as cuando,
  l.request_payload ->> 'pedido_id'                            as pedido_id,
  p.numero                                                     as pedido_nro,
  (l.request_payload ->> 'tipo_cbte')::int                     as tipo_cbte,
  (l.request_payload ->> 'punto_venta')::int                   as punto_venta,
  (l.response_payload ->> 'numero')::int                       as numero,
  l.response_payload ->> 'cae'                                 as cae,
  l.response_payload ->> 'cae_vto'                             as cae_vto,
  (l.request_payload -> 'importes' ->> 'importeTotal')::numeric as total,
  exists (
    select 1 from comprobantes_fiscales c
     where c.pedido_id = (l.request_payload ->> 'pedido_id')::uuid
       and c.estado = 'autorizado' and c.tipo_cbte in (1, 6, 11)
  ) as pedido_ya_tiene_factura_guardada
from arca_request_log l
left join pedidos p on p.id = (l.request_payload ->> 'pedido_id')::uuid
where l.metodo = 'FECAESolicitar'
  and l.response_payload ->> 'resultado' = 'A'
  and not exists (
    select 1 from comprobantes_fiscales c
     where c.tipo_cbte   = (l.request_payload ->> 'tipo_cbte')::int
       and c.punto_venta = (l.request_payload ->> 'punto_venta')::int
       and c.numero      = (l.response_payload ->> 'numero')::int
  )
order by l.created_at desc;
