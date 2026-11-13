-- Batería SQL del IVA de ventas (SQL 57). Correr sobre una base de
-- prep-db.sh … sin-datos.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','fin@t','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000c1','cocina@t','{"role":"cocina"}'),
 ('00000000-0000-0000-0000-0000000000e1','emp@t','{"role":"empleado"}')
on conflict do nothing;
create or replace function pg_temp.como(p_id text, p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','app_metadata',json_build_object('role',p_rol))::text, false);
end $$;
select (now() at time zone 'America/Argentina/Buenos_Aires')::date as hoy \gset
select (:'hoy'::date - 1) as ayer \gset

insert into public.facturacion_config (razon_social, cuit, punto_venta, alicuota_iva)
 select 'KIKU SUSHI S.A.S.', '30719431751', 2, 21 where not exists (select 1 from public.facturacion_config);
insert into public.pedidos (id, numero, canal, estado, total) values
 ('10000000-0000-0000-0000-000000000a01', 9701, 'salon', 'entregado', 121000),
 ('10000000-0000-0000-0000-000000000a02', 9702, 'salon', 'entregado', 242000),
 ('10000000-0000-0000-0000-000000000a03', 9703, 'salon', 'entregado', 60500),
 ('10000000-0000-0000-0000-000000000a04', 9704, 'salon', 'entregado', 12100),
 ('10000000-0000-0000-0000-000000000a05', 9705, 'salon', 'entregado', 1000),
 ('10000000-0000-0000-0000-000000000a06', 9706, 'salon', 'entregado', 99999),
 ('10000000-0000-0000-0000-000000000a07', 9707, 'salon', 'entregado', 36300);
insert into public.comprobantes_fiscales (id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, importe_neto, importe_iva, importe_total, cae, cbte_asociado_id) values
 -- hoy
 ('f0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000a01','autorizado','B', 6, 2, 101, :'hoy', 100000, 21000, 121000, '1', null),
 ('f0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000a02','autorizado','A', 1, 2,  11, :'hoy', 200000, 42000, 242000, '2', null),
 ('f0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000a03','anulado',   'B', 6, 2, 102, :'hoy',  50000, 10500,  60500, '3', null),
 ('f0000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000a04','autorizado','B', 6, 2, 103, :'hoy',  10000,  2100,  12100, '4', null),
 -- sin el desglose guardado: se calcula con la alícuota (826,45 + 173,55)
 ('f0000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000a05','autorizado','B', 6, 2, 104, :'hoy',      0,     0,   1000, '5', null),
 -- no cuentan: rechazada, con error y pendiente
 ('f0000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000a06','rechazado', 'B', 6, 2, null, :'hoy', 82643.80, 17355.20, 99999, null, null),
 ('f0000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000a06','error',     'B', 6, 2, null, :'hoy', 82643.80, 17355.20, 99999, null, null),
 ('f0000000-0000-0000-0000-000000000026','10000000-0000-0000-0000-000000000a06','pendiente', 'B', 6, 2, null, :'hoy', 82643.80, 17355.20, 99999, null, null),
 -- ayer
 ('f0000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000a07','autorizado','B', 6, 2, 100, :'ayer', 30000,  6300,  36300, '7', null);
insert into public.comprobantes_fiscales (id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, importe_neto, importe_iva, importe_total, cae, cbte_asociado_id) values
 -- notas de crédito de hoy: una por el total (anula la 102) y una parcial (sobre la 103); una rechazada que no cuenta
 ('f0000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000a03','autorizado','B', 8, 2, 1, :'hoy', 50000, 10500, 60500, '8', 'f0000000-0000-0000-0000-000000000003'),
 ('f0000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000a04','autorizado','B', 8, 2, 2, :'hoy',  2000,   420,  2420, '9', 'f0000000-0000-0000-0000-000000000004'),
 ('f0000000-0000-0000-0000-000000000024','10000000-0000-0000-0000-000000000a04','rechazado', 'B', 8, 2, null, :'hoy', 2000, 420, 2420, null, 'f0000000-0000-0000-0000-000000000004');

\echo '== I1 finanzas (no lee la tabla, sí el resumen): hoy'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas');
set role authenticated;
select 'i1 tabla|' || count(*) from public.comprobantes_fiscales;
select 'i1|' || letra || '|' || clase || '|' || cantidad || '|' || neto || '|' || iva || '|' || total || '|' || estimados from public.iva_ventas_resumen(:'hoy', :'hoy');
select 'i1 neto|' || sum(case when clase = 'nota_credito' then -neto else neto end) || '|iva ' || sum(case when clase = 'nota_credito' then -iva else iva end)
       || '|total ' || sum(case when clase = 'nota_credito' then -total else total end) from public.iva_ventas_resumen(:'hoy', :'hoy');

\echo '== I2 por fecha de emisión: ayer solo, y los dos días'
select 'i2 ayer|' || letra || '|' || clase || '|' || cantidad || '|' || iva from public.iva_ventas_resumen(:'ayer', :'ayer');
select 'i2 dos dias|' || sum(cantidad) || '|' || sum(case when clase = 'nota_credito' then -iva else iva end) from public.iva_ventas_resumen(:'ayer', :'hoy');
select 'i2 sin fechas|' || count(*) from public.iva_ventas_resumen(null, null);
select 'i2 rango al reves|' || count(*) from public.iva_ventas_resumen(:'hoy', :'ayer');
reset role;

\echo '== I3 otros roles: admin (Caja) sí; cocina y empleado no; anon rechazado (1 error)'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin');
set role authenticated;
select 'i3 admin|' || count(*) from public.iva_ventas_resumen(:'hoy', :'hoy');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1','cocina');
set role authenticated;
select 'i3 cocina|' || count(*) from public.iva_ventas_resumen(:'hoy', :'hoy');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000e1','empleado');
set role authenticated;
select 'i3 empleado|' || count(*) from public.iva_ventas_resumen(:'hoy', :'hoy');
reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.role', '', false) \gset
set role anon;
select count(*) from public.iva_ventas_resumen(:'hoy', :'hoy');
reset role;

\echo '== I4 otra alícuota configurada: cambia solo lo que no tenía desglose'
update public.facturacion_config set alicuota_iva = 10.5;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas');
set role authenticated;
select 'i4|' || neto || '|' || iva || '|' || total from public.iva_ventas_resumen(:'hoy', :'hoy') where letra = 'B' and clase = 'factura';
reset role;
update public.facturacion_config set alicuota_iva = 21;

\echo '== I5 comprobante C (monotributo): todo neto, sin IVA y sin marcar como estimado'
insert into public.pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-000000000a08', 9708, 'salon', 'entregado', 500);
insert into public.comprobantes_fiscales (pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, importe_neto, importe_iva, importe_total, cae)
 values ('10000000-0000-0000-0000-000000000a08','autorizado','C', 11, 3, 1, :'hoy', 0, 0, 500, '10');
set role authenticated;
select 'i5|' || letra || '|' || neto || '|' || iva || '|' || total || '|' || estimados from public.iva_ventas_resumen(:'hoy', :'hoy') where letra = 'C';
reset role;
