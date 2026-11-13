-- Datos para las pruebas de stock + compras (se carga sobre seed-ui.sql).
-- El admin está vinculado a un empleado: así los movimientos muestran un
-- nombre y no el mail.
insert into public.empleados (id, nombre, apellido, user_id) values
 ('e0000000-0000-0000-0000-000000000001','Ana','Encargada','00000000-0000-0000-0000-0000000000a1')
on conflict do nothing;
insert into public.proveedores (id, razon_social) values
 ('b0000000-0000-0000-0000-000000000001','Pescadería Mar'),
 ('b0000000-0000-0000-0000-000000000002','Almacén Sur'),
 ('b0000000-0000-0000-0000-000000000003','Verdulería Don Tito')
on conflict do nothing;
insert into public.stock (id, nombre, unidad, stock_actual, stock_minimo, precio_unitario, tipo_stock, categoria, proveedor) values
 ('c0000000-0000-0000-0000-000000000001','Salmón rosado','kg', 5, 3, 10000, 'materia_prima', 'Pescaderia', 'Pescadería Mar'),
 ('c0000000-0000-0000-0000-000000000002','Arroz para sushi','kg', 20, 8, 2000, 'materia_prima', 'Almacen', 'Almacén Sur'),
 ('c0000000-0000-0000-0000-000000000003','Palta','kg', 4, 2, 3000, 'materia_prima', 'Verduleria', null),
 ('c0000000-0000-0000-0000-000000000004','Queso crema','kg', 6, 2, 5500, 'materia_prima', 'Almacen', 'Almacén Sur'),
 ('c0000000-0000-0000-0000-000000000005','Langostinos','kg', 3, 1, 18000, 'materia_prima', 'Pescaderia', null),
 ('c0000000-0000-0000-0000-000000000006','Alga nori','u', 200, 50, 90, 'materia_prima', 'Almacen', null),
 ('c0000000-0000-0000-0000-000000000007','Roll Kiku','roll', 6, 8, 0, 'servicio', null, null)
on conflict do nothing;
