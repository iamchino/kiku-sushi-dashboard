-- Batería SQL de la marca "no se factura" (SQL 58). Correr sobre una base de
-- prep-db.sh … sin-datos.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','noe@kikusushi.com.ar','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','yamileangel@kikusushi.com.ar','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}'),
 ('00000000-0000-0000-0000-0000000000c1','cocina@t','{"role":"cocina"}')
on conflict do nothing;
create or replace function pg_temp.como(p_id text, p_rol text, p_email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','email',p_email,'app_metadata',json_build_object('role',p_rol))::text, false);
end $$;
-- La encargada tiene ficha de empleado; la de administración, no.
insert into public.empleados (id, nombre, apellido, user_id, activo)
 values ('e0000000-0000-0000-0000-000000000001', 'Noelia', 'Pérez', '00000000-0000-0000-0000-0000000000a1', true);

insert into public.pedidos (id, numero, canal, estado) values
 ('10000000-0000-0000-0000-000000000b01', 9801, 'salon', 'entregado'),
 ('10000000-0000-0000-0000-000000000b02', 9802, 'salon', 'entregado'),
 ('10000000-0000-0000-0000-000000000b03', 9803, 'salon', 'entregado'),
 ('10000000-0000-0000-0000-000000000b04', 9804, 'salon', 'entregado'),
 ('10000000-0000-0000-0000-000000000b05', 9805, 'salon', 'entregado');
insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario)
 select id, 'Combinado', 1, 10000 from public.pedidos where numero between 9801 and 9805;
insert into public.comprobantes_fiscales (pedido_id, estado, letra, tipo_cbte, punto_venta, numero, importe_neto, importe_iva, importe_total, cae) values
 ('10000000-0000-0000-0000-000000000b02', 'autorizado', 'B', 6, 2, 501, 8264.46, 1735.54, 10000, '1'),   -- factura vigente
 ('10000000-0000-0000-0000-000000000b03', 'anulado',    'B', 6, 2, 502, 8264.46, 1735.54, 10000, '2'),   -- anulada por nota de crédito
 ('10000000-0000-0000-0000-000000000b03', 'autorizado', 'B', 8, 2,   1, 8264.46, 1735.54, 10000, '3'),
 ('10000000-0000-0000-0000-000000000b04', 'rechazado',  'B', 6, 2, null, 8264.46, 1735.54, 10000, null); -- rechazada

\echo '== F1 la encargada (Caja con edición) marca un pedido'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin','noe@kikusushi.com.ar');
set role authenticated;
select 'f1|' || motivo || '|' || usuario_nombre || '|' || (usuario_id = '00000000-0000-0000-0000-0000000000a1')
  from public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b01', '  Canje / cuenta corriente  ');
select 'f1 filas|' || count(*) from public.pedidos_sin_factura;
select 'f1 el pedido no cambia|' || total || '|' || estado from public.pedidos where numero = 9801;

\echo '== F2 volver a marcar corrige el motivo (no duplica)'
select 'f2|' || motivo from public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b01', 'Invitación de la casa');
select 'f2 filas|' || count(*) from public.pedidos_sin_factura;

\echo '== F3 validaciones (4 errores esperados)'
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', ' x ');
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', repeat('a', 201));
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-00000000dead', 'Consumo interno');
select public.pedido_marcar_sin_factura(null, 'Consumo interno');
select 'f3 filas|' || count(*) from public.pedidos_sin_factura;

\echo '== F4 con factura vigente no se puede (1 error); anulada o rechazada, sí'
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b02', 'Consumo interno');
select 'f4 anulada|' || motivo from public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b03', 'Se anuló y no se refactura');
select 'f4 rechazada|' || motivo from public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b04', 'Pedido de prueba');
select 'f4 filas|' || count(*) from public.pedidos_sin_factura;

\echo '== F5 no se escribe la tabla directo (3 errores)'
insert into public.pedidos_sin_factura (pedido_id, motivo) values ('10000000-0000-0000-0000-000000000b05', 'directo');
update public.pedidos_sin_factura set motivo = 'cambiado';
delete from public.pedidos_sin_factura;
select 'f5 filas|' || count(*) || '|' || string_agg(motivo, ' / ' order by motivo) from public.pedidos_sin_factura;
reset role;

\echo '== F6 mozo y cocina: ni marcan, ni desmarcan, ni ven (3 errores)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', 'Consumo interno');
select public.pedido_desmarcar_sin_factura('10000000-0000-0000-0000-000000000b01');
select 'f6 mozo ve|' || count(*) from public.pedidos_sin_factura;
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1','cocina','cocina@t');
set role authenticated;
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', 'Consumo interno');
select 'f6 cocina ve|' || count(*) from public.pedidos_sin_factura;
reset role;

\echo '== F7 administración (finanzas, sin ficha de empleado): ve, marca y desmarca'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamileangel@kikusushi.com.ar');
set role authenticated;
select 'f7 ve|' || count(*) from public.pedidos_sin_factura;
select 'f7|' || motivo || '|' || usuario_nombre from public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', 'Consumo interno');
select public.pedido_desmarcar_sin_factura('10000000-0000-0000-0000-000000000b05');
select public.pedido_desmarcar_sin_factura('10000000-0000-0000-0000-000000000b05');  -- dos veces no rompe
select 'f7 filas|' || count(*) from public.pedidos_sin_factura;
reset role;

\echo '== F8 anon: ni función ni tabla (3 errores)'
set role anon;
select public.pedido_marcar_sin_factura('10000000-0000-0000-0000-000000000b05', 'Consumo interno');
select public.pedido_desmarcar_sin_factura('10000000-0000-0000-0000-000000000b01');
select count(*) from public.pedidos_sin_factura;
reset role;

\echo '== F9 si el pedido se borra, la marca se va con él'
delete from public.pedidos where numero = 9801;
select 'f9 filas|' || count(*) from public.pedidos_sin_factura;
