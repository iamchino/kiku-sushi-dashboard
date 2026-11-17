-- Datos para las pruebas del 17/11 (canje, "Disponible hoy", margen sin IVA).
-- Van encima de seed-ui.sql. `hoy` lo pasa el runner (la fecha local del
-- navegador). Todo lo pagado va con fecha de hoy para que caiga en el mes en
-- curso sea cual sea el día en que se corra.
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','administracion@kiku.test','{"role":"administracion"}')
on conflict do nothing;
-- Rol de solo lectura de Finanzas (sin Caja ni caja fuerte).
insert into public.roles (id, nombre) values ('administracion', 'Administración') on conflict do nothing;
insert into public.rol_permisos (rol_id, recurso_id, ver, editar) values ('administracion', 'finanzas', true, false)
  on conflict (rol_id, recurso_id) do update set ver = true, editar = false;
insert into public.empleados (id, nombre, apellido, user_id) values
 ('e0000000-0000-0000-0000-0000000000f1','Yamile','Prueba','00000000-0000-0000-0000-0000000000f1')
on conflict do nothing;
-- En producción el rol finanzas ve todo el dashboard, Caja incluida.
insert into public.rol_permisos (rol_id, recurso_id, ver, editar) values ('finanzas', 'caja', true, true)
  on conflict (rol_id, recurso_id) do update set ver = true, editar = true;

-- ── Proveedores y pagos ─────────────────────────────────────────────────────
insert into public.proveedores (id, razon_social, cuit_cuil) values
 ('b2000000-0000-0000-0000-000000000001', 'Bodega Los Aromos', '30-70000000-9'),
 ('b2000000-0000-0000-0000-000000000002', 'La Serenísima S.A.', '30-50000000-1')
on conflict do nothing;
-- Las dos facturas de vinos pendientes (las que se canjearon por una cata), un
-- pendiente común y dos pagos con plata.
insert into public.egresos (id, fecha, categoria, descripcion, monto, medio_pago, estado, vencimiento, proveedor_id, comprobante_nro, pagado_desde, cuenta_id) values
 ('e2000000-0000-0000-0000-000000000001', :'hoy'::date - 12, 'mercaderia',  'VINOS factura 1201', 310000, 'transferencia', 'pendiente', :'hoy'::date + 5, 'b2000000-0000-0000-0000-000000000001', 'A 0004-00001201', null, null),
 ('e2000000-0000-0000-0000-000000000002', :'hoy'::date - 10, 'mercaderia',  'VINOS factura 1202', 190000, 'transferencia', 'pendiente', :'hoy'::date + 9, 'b2000000-0000-0000-0000-000000000001', 'A 0004-00001202', null, null),
 ('e2000000-0000-0000-0000-000000000003', :'hoy'::date - 20, 'proveedores', 'LECHE Y CREMA',       80000, 'transferencia', 'pendiente', :'hoy'::date + 2, 'b2000000-0000-0000-0000-000000000002', 'A 0003-00012400', null, null),
 ('e2000000-0000-0000-0000-000000000004', :'hoy',            'proveedores', 'QUESOS',             117686, 'transferencia', 'pagado',    null,             'b2000000-0000-0000-0000-000000000002', 'A 0003-00012345', null, null),
 ('e2000000-0000-0000-0000-000000000005', :'hoy',            'mercaderia',  'Hielo',               10000, 'efectivo',      'pagado',    null,             null,                                    null,              null, null);

-- Un cobro en efectivo y uno por transferencia en el turno abierto.
insert into public.pedidos (id, numero, canal, mesa, estado, created_at) values
 ('10000000-0000-0000-0000-000000000d01', 9821, 'salon', '31', 'entregado', :'hoy'::date + time '12:30');
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario) values
 ('10000000-0000-0000-0000-000000000d01', 'Combinado x15', 1, 250000);
insert into public.pagos (pedido_id, medio_pago, monto, caja_turno_id) values
 ('10000000-0000-0000-0000-000000000d01', 'efectivo',      150000, '20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000d01', 'transferencia', 100000, '20000000-0000-0000-0000-000000000001');
-- Caja fuerte con plata guardada de antes.
insert into public.caja_fuerte_movimientos (tipo, monto, descripcion) values ('deposito', 250000, 'Guardado de la semana');

-- ── Stock, carta, recetas y un combo (para el margen sin IVA) ───────────────
insert into public.stock (id, nombre, unidad, stock_actual, stock_minimo, precio_unitario, tipo_stock, categoria) values
 ('c2000000-0000-0000-0000-000000000001', 'Salmón',                  'kg', 5,  1, 10000, 'materia_prima', 'Pescados'),
 ('c2000000-0000-0000-0000-000000000002', 'Arroz',                   'kg', 20, 5, 2000,  'materia_prima', 'Almacén'),
 ('c2000000-0000-0000-0000-000000000003', 'Tapas Empanadas Copetín', 'u',  30, 5, 1082,  'materia_prima', 'Almacén'),
 ('c2000000-0000-0000-0000-000000000004', 'Malbec Reserva',          'u',  12, 2, 9000,  'materia_prima', 'Bebidas');
insert into public.menu_items (id, tipo, categoria, nombre, precio, precio_num) values
 ('d2000000-0000-0000-0000-000000000001', 'carta', 'Rolls',    'Roll Kiku',        '$12.100', 12100),
 ('d2000000-0000-0000-0000-000000000002', 'carta', 'Entradas', 'Empanada Copetín', '$3.630',  3630),
 ('d2000000-0000-0000-0000-000000000003', 'carta', 'Vinos',    'Malbec Reserva',   '$18.150', 18150),
 ('d2000000-0000-0000-0000-000000000004', 'carta', 'Nigiris',  'Nigiri Salmón',    '$2.420',  2420),
 ('d2000000-0000-0000-0000-000000000005', 'carta', 'Combos',   'Combo Kiku',       '$24.200', 24200);
insert into public.menu_item_variantes (menu_item_id, nombre, piezas, precio, orden) values
 ('d2000000-0000-0000-0000-000000000004', 'x2', 2, 2420, 0),
 ('d2000000-0000-0000-0000-000000000004', 'x4', 4, 4235, 1);
-- Roll Kiku: $4.000 de costo, $12.100 en carta ($10.000 sin IVA) → 60,0 %
--   (contra el precio con IVA marcaba 66,9 %).
-- Empanada: $2.282 de costo, $3.630 en carta ($3.000 sin IVA) → 23,9 %: BAJO
--   (con IVA marcaba 37,1 % y no avisaba).
-- Malbec (reventa): $9.000, $18.150 en carta ($15.000 sin IVA) → 40,0 %.
-- Nigiri: $500 la pieza → x2 a $2.420 ($2.000 sin IVA) 50,0 %; x4 a $4.235 ($3.500) 42,9 %.
insert into public.recetas (id, nombre, menu_item_id, porciones, tipo, reventa) values
 ('f2000000-0000-0000-0000-000000000001', 'Roll Kiku',        'd2000000-0000-0000-0000-000000000001', 1, 'final', false),
 ('f2000000-0000-0000-0000-000000000002', 'Empanada Copetín', 'd2000000-0000-0000-0000-000000000002', 1, 'final', false),
 ('f2000000-0000-0000-0000-000000000003', 'Malbec Reserva',   'd2000000-0000-0000-0000-000000000003', 1, 'final', true),
 ('f2000000-0000-0000-0000-000000000004', 'Nigiri Salmón',    'd2000000-0000-0000-0000-000000000004', 1, 'final', false);
insert into public.receta_ingredientes (receta_id, stock_id, cantidad) values
 ('f2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 0.3),
 ('f2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 0.5),
 ('f2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000003', 1),
 ('f2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 0.12),
 ('f2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000004', 1),
 ('f2000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 0.05);
-- Combo Kiku: 2 rolls ($8.000 de costo), $24.200 en carta ($20.000 sin IVA) → 60,0 %.
insert into public.combos (id, nombre, menu_item_id, activo) values
 ('a2000000-0000-0000-0000-000000000001', 'Combo Kiku', 'd2000000-0000-0000-0000-000000000005', true);
insert into public.combo_items (combo_id, receta_id, cantidad) values
 ('a2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 2);
