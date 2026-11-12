insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@kiku.test','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','finanzas@kiku.test','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@kiku.test','{"role":"mozo"}')
on conflict do nothing;
insert into public.salones (id, nombre, orden) values ('50000000-0000-0000-0000-000000000001','Salón principal',0);
insert into public.mesas (id, salon_id, numero, nombre, capacidad, pos_x, pos_y) values
 ('60000000-0000-0000-0000-000000000007','50000000-0000-0000-0000-000000000001',7,'Mesa 7',4,80,80),
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001',3,'Mesa 3',4,220,80),
 ('60000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000001',5,'Mesa 5',2,360,80);
-- Mesa 7: $50.000 (entra en el saldo). Mesa 3: $420.000 (no entra: pago dividido).
insert into public.pedidos (id, numero, canal, mesa, mesa_id, estado, total, personas, abierta_at, origen) values
 ('10000000-0000-0000-0000-000000000007', 9007, 'salon', '7', '60000000-0000-0000-0000-000000000007', 'pendiente', 50000, 2, now() - interval '50 minutes', 'dashboard'),
 ('10000000-0000-0000-0000-000000000003', 9003, 'salon', '3', '60000000-0000-0000-0000-000000000003', 'pendiente', 420000, 4, now() - interval '70 minutes', 'dashboard'),
 ('10000000-0000-0000-0000-000000000009', 9009, 'takeaway', null, null, 'listo', 36500, 1, null, 'dashboard'),
 ('10000000-0000-0000-0000-000000000010', 9010, 'delivery', null, null, 'listo', 28000, 1, null, 'dashboard');
update public.pedidos set cliente_nombre = 'Sofía (Punto Biz)' where id = '10000000-0000-0000-0000-000000000009';
update public.pedidos set cliente_nombre = 'Martín', cliente_direccion = 'Paraguay 1234' where id = '10000000-0000-0000-0000-000000000010';
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario) values
 ('10000000-0000-0000-0000-000000000007','Combinado Kiku x30',1,38000),
 ('10000000-0000-0000-0000-000000000007','Limonada',2,6000),
 ('10000000-0000-0000-0000-000000000003','Kiku Libre',4,95000),
 ('10000000-0000-0000-0000-000000000003','Sake',2,20000),
 ('10000000-0000-0000-0000-000000000009','Philadelphia x10',2,14000),
 ('10000000-0000-0000-0000-000000000009','Gyozas',1,8500),
 ('10000000-0000-0000-0000-000000000010','Combinado x15',1,28000);
insert into public.caja_turnos (id, estado, apertura_monto, business_date, apertura_at)
 values ('20000000-0000-0000-0000-000000000001','abierto', 20000, (now() at time zone 'America/Argentina/Buenos_Aires')::date, now() - interval '3 hours');
insert into public.facturacion_config (razon_social, nombre_fantasia, cuit, punto_venta, permite_factura_a)
 select 'KIKU SUSHI S.A.S.','Kiku Sushi','30719431751',2,true where not exists (select 1 from public.facturacion_config);
update public.facturacion_config set permite_factura_a = true;
insert into public.web_config (id) values (1) on conflict do nothing;
