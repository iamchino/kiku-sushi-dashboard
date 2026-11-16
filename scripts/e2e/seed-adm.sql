-- Datos para las pruebas de administración (marca "no se factura", N° de
-- comprobante en Pagos, facturas por proveedor, cierre de caja). Van encima de
-- seed-ui.sql. `hoy` lo pasa el runner (la fecha local del navegador).
insert into public.empleados (id, nombre, apellido, user_id) values
 ('e0000000-0000-0000-0000-000000000001','Noelia','Pérez','00000000-0000-0000-0000-0000000000a1')
on conflict do nothing;

-- Un pedido de hoy ya facturado (para ver que a ese no se le ofrece la marca).
insert into public.pedidos (id, numero, canal, mesa, estado, created_at) values
 ('10000000-0000-0000-0000-000000000c01', 9811, 'salon', '31', 'entregado', :'hoy'::date + time '12:30');
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario) values
 ('10000000-0000-0000-0000-000000000c01', 'Combinado x15', 1, 15000);
insert into public.comprobantes_fiscales (id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, importe_neto, importe_iva, importe_total, cae) values
 ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000c01', 'autorizado', 'B', 6, 2, 601, :'hoy', 12396.69, 2603.31, 15000, '76000000000601');

-- Cobros del turno abierto: efectivo, transferencia y tarjeta.
insert into public.pagos (pedido_id, medio_pago, monto, caja_turno_id) values
 ('10000000-0000-0000-0000-000000000c01', 'efectivo',       150000, '20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000c01', 'transferencia',  459500, '20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000c01', 'tarjeta_debito', 284100, '20000000-0000-0000-0000-000000000001');

-- Proveedores con facturas y pagos cargados.
insert into public.proveedores (id, razon_social, cuit_cuil) values
 ('b1000000-0000-0000-0000-000000000001', 'La Serenísima S.A.', '30-50000000-1'),
 ('b1000000-0000-0000-0000-000000000002', 'Almacén Sur', null),
 ('b1000000-0000-0000-0000-000000000003', 'Verdulería Don Tito', null)
on conflict do nothing;
insert into public.egresos (fecha, categoria, descripcion, monto, medio_pago, estado, vencimiento, proveedor_id, comprobante_nro) values
 (:'hoy'::date - 5,  'proveedores', 'QUESOS',        117686, 'transferencia', 'pagado',    null,              'b1000000-0000-0000-0000-000000000001', 'A 0003-00012345'),
 (:'hoy'::date - 20, 'proveedores', 'LECHE Y CREMA',  80000, 'transferencia', 'pendiente', :'hoy'::date - 3,  'b1000000-0000-0000-0000-000000000001', 'A 0003-00012400'),
 (:'hoy'::date - 2,  'mercaderia',  'Hielo',          10000, 'efectivo',      'pagado',    null,              'b1000000-0000-0000-0000-000000000001', null),
 (:'hoy'::date - 1,  'mercaderia',  'Arroz',          25000, 'transferencia', 'pagado',    null,              'b1000000-0000-0000-0000-000000000002', 'B 0001-00000077');
