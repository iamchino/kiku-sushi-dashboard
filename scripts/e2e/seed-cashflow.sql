-- Datos de ejemplo para el cash flow: tres meses cerrados con cobros y pagos,
-- el mes en curso a medias y pagos pendientes hacia adelante. Todo relativo a
-- hoy, así las pruebas no envejecen. Montos redondos e inventados.
select date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date as m0 \gset

insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','administracion@kiku.test','{"role":"administracion"}')
on conflict do nothing;
-- Rol creado desde Permisos: ve Finanzas pero NO edita.
insert into public.roles (id, nombre) values ('administracion', 'Administración') on conflict do nothing;
insert into public.rol_permisos (rol_id, recurso_id, ver, editar) values ('administracion', 'finanzas', true, false)
on conflict (rol_id, recurso_id) do update set ver = true, editar = false;

insert into public.pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-0000000cf100', 9500, 'salon', 'entregado', 1)
on conflict do nothing;

-- Cobros: 35 por día durante los tres meses anteriores y lo que va de este
-- (más de 1000 por mes: lo que la API cortaría si se sumara en el navegador).
insert into public.pagos (pedido_id, medio_pago, monto, created_at)
select '10000000-0000-0000-0000-0000000cf100',
       (array['efectivo','transferencia','tarjeta_debito','tarjeta_credito'])[1 + (n % 4)],
       30000 + ((extract(day from d)::int * 37 + n * 911) % 17) * 1000,
       (d + time '20:00' + (n || ' minutes')::interval) at time zone 'America/Argentina/Buenos_Aires'
  from generate_series((:'m0'::date - interval '3 months')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1, interval '1 day') as d,
       generate_series(1, 35) as n;

insert into public.proveedores (id, razon_social) values
 ('70000000-0000-0000-0000-000000000001', 'Pesquera del Litoral'),
 ('70000000-0000-0000-0000-000000000002', 'Distribuidora Oriente')
on conflict do nothing;

-- Pagos hechos: los tres meses cerrados (k = 3, 2, 1) y lo pagado de este (k = 0).
insert into public.egresos (fecha, categoria, descripcion, monto, estado, medio_pago, proveedor_id)
select (:'m0'::date - (k || ' months')::interval)::date + v.dia, v.categoria, v.descripcion,
       round(v.monto * (1 + (3 - k) * 0.04)), 'pagado', 'transferencia', v.proveedor::uuid
  from generate_series(0, 3) as k,
       (values
         (2,  'mercaderia',    'Pescado y mariscos (1ra quincena)', 4200000, '70000000-0000-0000-0000-000000000001'),
         (4,  'sueldos',       'Sueldos',                           9800000, null),
         (5,  'alquiler',      'Alquiler del local',                1900000, null),
         (6,  'proveedores',   'Arroz, algas y secos',              2300000, '70000000-0000-0000-0000-000000000002'),
         (8,  'comisiones',    'Comisiones de tarjetas y apps',     1150000, null),
         (16, 'mercaderia',    'Pescado y mariscos (2da quincena)', 4600000, '70000000-0000-0000-0000-000000000001'),
         (17, 'servicios',     'Luz, gas e internet',                980000, null),
         (19, 'impuestos',     'IVA e Ingresos Brutos',             2700000, null),
         (21, 'mantenimiento', 'Service de cámaras de frío',         420000, null),
         (23, 'marketing',     'Publicidad en redes',                350000, null),
         (25, 'otros',         'Vajilla y reposición',               280000, null)
       ) as v(dia, categoria, descripcion, monto, proveedor)
 where k > 0 or (:'m0'::date + v.dia) < (now() at time zone 'America/Argentina/Buenos_Aires')::date;

-- Pagos pendientes cargados (Proyección de pagos).
insert into public.egresos (fecha, categoria, descripcion, monto, estado, vencimiento, proveedor_id) values
 (current_date, 'proveedores', 'Factura vencida de secos',         640000, 'pendiente', :'m0'::date - 6, '70000000-0000-0000-0000-000000000002'),
 (current_date, 'impuestos',   'IVA e Ingresos Brutos',           2850000, 'pendiente', :'m0'::date + 19, null),
 (current_date, 'servicios',   'Luz, gas e internet',             1020000, 'pendiente', :'m0'::date + 17, null),
 (current_date, 'alquiler',    'Alquiler del local',              2050000, 'pendiente', (:'m0'::date + interval '1 month')::date + 5, null),
 (current_date, 'otros',       'Horno nuevo — cuota 1 de 3',       900000, 'pendiente', (:'m0'::date + interval '1 month')::date + 10, null),
 (current_date, 'otros',       'Horno nuevo — cuota 2 de 3',       900000, 'pendiente', (:'m0'::date + interval '2 month')::date + 10, null),
 (current_date, 'otros',       'Horno nuevo — cuota 3 de 3',       900000, 'pendiente', (:'m0'::date + interval '3 month')::date + 10, null),
 (current_date, 'mantenimiento','Arreglo de campana (sin fecha)',   310000, 'pendiente', null, null);
