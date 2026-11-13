-- Datos para probar el IVA de las ventas en el navegador. Van encima de
-- seed-ui.sql. `hoy` lo pasa el runner (la fecha local del navegador), así las
-- pruebas no envejecen ni dependen de la zona horaria:
--   psql … -v hoy=2026-11-13 -f seed-iva.sql
select (:'hoy'::date - 1) as ayer \gset
update public.facturacion_config set alicuota_iva = 21;

-- ── Hoy: seis pedidos con los casos que importan ────────────────────────────
insert into public.pedidos (id, numero, canal, mesa, estado, total, created_at) values
 ('10000000-0000-0000-0000-000000000a01', 9701, 'salon', '21', 'entregado', 121000, :'hoy'::date + time '12:01'),
 ('10000000-0000-0000-0000-000000000a02', 9702, 'salon', '22', 'entregado', 242000, :'hoy'::date + time '12:02'),
 ('10000000-0000-0000-0000-000000000a03', 9703, 'salon', '23', 'entregado',  60500, :'hoy'::date + time '12:03'),
 ('10000000-0000-0000-0000-000000000a04', 9704, 'salon', '24', 'entregado',  12100, :'hoy'::date + time '12:04'),
 ('10000000-0000-0000-0000-000000000a05', 9705, 'salon', '25', 'entregado',   1000, :'hoy'::date + time '12:05'),
 ('10000000-0000-0000-0000-000000000a06', 9706, 'salon', '26', 'entregado',  99999, :'hoy'::date + time '12:06'),
 -- Pedido de ANOCHE facturado HOY (pasada la medianoche): Caja lo cuenta
 -- ayer, el IVA lo cuenta hoy (fecha de emisión).
 ('10000000-0000-0000-0000-000000000a07', 9707, 'salon', '27', 'entregado',  36300, :'ayer'::date + time '23:50');
-- El total del pedido lo recalcula un trigger a partir de los ítems: por eso
-- el importe va acá y no alcanza con ponerlo en `pedidos`.
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario)
select p.id, 'Combinado', 1, v.total
  from (values (9701, 121000), (9702, 242000), (9703, 60500), (9704, 12100), (9705, 1000), (9706, 99999), (9707, 36300)) as v(numero, total)
  join public.pedidos p on p.numero = v.numero;

insert into public.comprobantes_fiscales (id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva, importe_neto, importe_iva, importe_total, cae, cbte_asociado_id) values
 ('f0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000a01','autorizado','B', 6, 2, 101, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 100000, 21000, 121000, '76000000000001', null),
 ('f0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000a02','autorizado','A', 1, 2,  11, :'hoy', 80, '30712345678', 'Revista Punto Biz SA', 'Responsable Inscripto', 200000, 42000, 242000, '76000000000002', null),
 ('f0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000a03','anulado',   'B', 6, 2, 102, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final',  50000, 10500,  60500, '76000000000003', null),
 ('f0000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000a04','autorizado','B', 6, 2, 103, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final',  10000,  2100,  12100, '76000000000004', null),
 -- sin el desglose guardado: se calcula con la alícuota (826,45 + 173,55)
 ('f0000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000a05','autorizado','B', 6, 2, 104, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final',      0,     0,   1000, '76000000000005', null),
 -- no cuentan: rechazada, con error y pendiente
 ('f0000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000a06','rechazado', 'B', 6, 2, null, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 82643.80, 17355.20, 99999, null, null),
 ('f0000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000a06','error',     'B', 6, 2, null, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 82643.80, 17355.20, 99999, null, null),
 ('f0000000-0000-0000-0000-000000000026','10000000-0000-0000-0000-000000000a06','pendiente', 'B', 6, 2, null, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 82643.80, 17355.20, 99999, null, null),
 -- la del pedido de anoche, emitida hoy
 ('f0000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000a07','autorizado','B', 6, 2, 100, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final',  30000,  6300,  36300, '76000000000007', null);
insert into public.comprobantes_fiscales (id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva, importe_neto, importe_iva, importe_total, cae, cbte_asociado_id) values
 -- notas de crédito de hoy: una por el total (anula la 102), una parcial (sobre la 103) y una rechazada que no cuenta
 ('f0000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000a03','autorizado','B', 8, 2, 1, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 50000, 10500, 60500, '76000000000013', 'f0000000-0000-0000-0000-000000000003'),
 ('f0000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000a04','autorizado','B', 8, 2, 2, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final',  2000,   420,  2420, '76000000000014', 'f0000000-0000-0000-0000-000000000004'),
 ('f0000000-0000-0000-0000-000000000024','10000000-0000-0000-0000-000000000a04','rechazado', 'B', 8, 2, null, :'hoy', 99, '0', 'Consumidor Final', 'Consumidor Final', 2000, 420, 2420, null, 'f0000000-0000-0000-0000-000000000004');

-- Cobros de hoy, para que Caja y Finanzas no se vean vacías en las capturas.
insert into public.pagos (pedido_id, medio_pago, monto, created_at)
select p.id, v.medio, v.monto, :'hoy'::date + time '12:10'
  from (values (9701, 'efectivo', 121000), (9702, 'transferencia', 242000), (9704, 'tarjeta_debito', 9680), (9705, 'efectivo', 1000)) as v(numero, medio, monto)
  join public.pedidos p on p.numero = v.numero;

-- ── Ayer: 1200 pedidos facturados, más de lo que la API devuelve de una vez ──
-- Cada uno $1.210 (1.000 + 210 de IVA) → $1.452.000 facturados, $252.000 de IVA.
insert into public.pedidos (id, numero, canal, estado, total, created_at)
select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 20000 + n, 'delivery', 'entregado', 1210,
       :'ayer'::date + time '12:00' + (n || ' seconds')::interval
  from generate_series(1, 1200) n;
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario)
select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'Roll', 1, 1210 from generate_series(1, 1200) n;
insert into public.comprobantes_fiscales (pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, doc_tipo, doc_nro, receptor_nombre, receptor_condicion_iva, importe_neto, importe_iva, importe_total, cae)
select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'autorizado', 'B', 6, 2, 5000 + n, :'ayer', 99, '0',
       'Consumidor Final', 'Consumidor Final', 1000, 210, 1210, (77000000000000 + n)::text
  from generate_series(1, 1200) n;
