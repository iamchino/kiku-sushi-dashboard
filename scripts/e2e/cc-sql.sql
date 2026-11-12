\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
-- ── usuarios ──
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','fin@t','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}'),
 ('00000000-0000-0000-0000-0000000000c1','cocina@t','{"role":"cocina"}')
on conflict do nothing;

create or replace function pg_temp.como(p_id text, p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','app_metadata',json_build_object('role',p_rol))::text, false);
end $$;

-- datos base (como postgres)
insert into public.pedidos (id, numero, canal, mesa, estado, total) values
 ('10000000-0000-0000-0000-000000000001', 9001, 'salon', '7', 'pendiente', 50000),
 ('10000000-0000-0000-0000-000000000002', 9002, 'delivery', null, 'pendiente', 30000),
 ('10000000-0000-0000-0000-000000000003', 9003, 'salon', '3', 'pendiente', 90000);
insert into public.caja_turnos (id, estado, apertura_monto, business_date, apertura_at)
 values ('20000000-0000-0000-0000-000000000001','abierto', 10000, date '2026-11-11', now() - interval '2 hours');

\echo '== T1 admin crea cuenta y movimiento manual'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin');
set role authenticated;
select 'rol', public.current_app_role(), public.tiene_permiso('cuentas_corrientes','editar');
insert into public.cuentas_corrientes (id, nombre, monto_acordado, vigencia_hasta, razon_social, cuit, condicion_iva)
 values ('30000000-0000-0000-0000-000000000001','Revista Punto Biz', 500000, date '2027-10-31', 'Punto Biz SA', '30712345678', 1) returning nombre, created_by;
insert into public.cuenta_corriente_movimientos (cuenta_id, fecha, detalle, numero_operacion, monto)
 values ('30000000-0000-0000-0000-000000000001', date '2026-10-20', 'Primer canje (cuaderno)', 'V-001', 117700) returning monto, usuario_id;
select 'saldo', consumido, saldo, movimientos from public.cuentas_corrientes_saldos;
\echo '== T2 nombre duplicado (debe fallar)'
insert into public.cuentas_corrientes (nombre, monto_acordado) values ('  revista punto biz ', 1);
\echo '== T3 cuit invalido (debe fallar)'
insert into public.cuentas_corrientes (nombre, cuit) values ('X', '30-71234567-8');
reset role;

\echo '== T4 mozo: no ve tablas, si ve RPC de cobro'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo');
set role authenticated;
select 'cuentas visibles', count(*) from public.cuentas_corrientes;
select 'movs visibles', count(*) from public.cuenta_corriente_movimientos;
select 'vista', count(*) from public.cuentas_corrientes_saldos;
select 'rpc', nombre, saldo, vencida, cuit from public.cuentas_corrientes_para_cobro();
\echo '== T5 mozo intenta escribir cuenta / movimiento (debe fallar o 0 filas)'
insert into public.cuentas_corrientes (nombre, monto_acordado) values ('Trucha', 999999);
insert into public.cuenta_corriente_movimientos (cuenta_id, monto) values ('30000000-0000-0000-0000-000000000001', -400000);
update public.cuentas_corrientes set monto_acordado = 9999999 returning id;

\echo '== T6 mozo cobra mesa con cuenta corriente (50000)'
insert into public.pagos (id, pedido_id, medio_pago, monto, cuenta_corriente_id, numero_operacion)
 values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','cuenta_corriente',50000,'30000000-0000-0000-0000-000000000001','V-002') returning medio_pago, caja_turno_id;
select 'rpc saldo', saldo from public.cuentas_corrientes_para_cobro();
\echo '== T7 cuenta_corriente sin cuenta (debe fallar)'
insert into public.pagos (pedido_id, medio_pago, monto) values ('10000000-0000-0000-0000-000000000002','cuenta_corriente',100);
\echo '== T8 efectivo con cuenta (el trigger la limpia)'
insert into public.pagos (id, pedido_id, medio_pago, monto, cuenta_corriente_id)
 values ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','efectivo',30000,'30000000-0000-0000-0000-000000000001') returning medio_pago, cuenta_corriente_id;
\echo '== T9 saldo insuficiente (quedan 332300, quiere 400000: debe fallar)'
insert into public.pagos (pedido_id, medio_pago, monto, cuenta_corriente_id)
 values ('10000000-0000-0000-0000-000000000003','cuenta_corriente',400000,'30000000-0000-0000-0000-000000000001');
\echo '== T10 pago dividido: 60000 cuenta + 30000 efectivo'
insert into public.pagos (pedido_id, medio_pago, monto, cuenta_corriente_id) values
 ('10000000-0000-0000-0000-000000000003','cuenta_corriente',60000,'30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','efectivo',30000,null) returning medio_pago, monto;
select 'rpc saldo', saldo from public.cuentas_corrientes_para_cobro();
reset role;

\echo '== T11 movimientos generados (como postgres)'
select fecha, detalle, numero_operacion, monto, pago_id is not null as de_cobro, usuario_id from public.cuenta_corriente_movimientos order by created_at;

\echo '== T12 re-cobro: mozo borra pagos del pedido 3 y cobra todo en efectivo -> saldo vuelve'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo');
set role authenticated;
delete from public.pagos where pedido_id = '10000000-0000-0000-0000-000000000003';
insert into public.pagos (pedido_id, medio_pago, monto) values ('10000000-0000-0000-0000-000000000003','efectivo',90000);
select 'rpc saldo', saldo from public.cuentas_corrientes_para_cobro();
reset role;
select 'movs', count(*) from public.cuenta_corriente_movimientos;

\echo '== T13 admin: update de pago cc (cambia monto, cambia medio)'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin');
set role authenticated;
update public.pagos set monto = 45000 where id = '40000000-0000-0000-0000-000000000001' returning monto;
select 'saldo', saldo from public.cuentas_corrientes_saldos;
update public.pagos set monto = 999999 where id = '40000000-0000-0000-0000-000000000001' returning monto;
update public.pagos set caja_turno_id = null where id = '40000000-0000-0000-0000-000000000001' returning caja_turno_id;
update public.pagos set medio_pago = 'transferencia' where id = '40000000-0000-0000-0000-000000000001' returning medio_pago, cuenta_corriente_id;
select 'saldo tras cambio de medio', saldo, movimientos from public.cuentas_corrientes_saldos;
update public.pagos set medio_pago = 'cuenta_corriente', cuenta_corriente_id = '30000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000001' returning medio_pago;
select 'saldo tras volver', saldo, movimientos from public.cuentas_corrientes_saldos;

\echo '== T14 admin no puede editar/borrar un movimiento de cobro (0 filas); si uno manual'
update public.cuenta_corriente_movimientos set monto = 1 where pago_id is not null returning id;
delete from public.cuenta_corriente_movimientos where pago_id is not null returning id;
update public.cuenta_corriente_movimientos set monto = 117000 where pago_id is null returning monto;
\echo '== T15 no se puede borrar cuenta con movimientos (debe fallar); desactivar si'
delete from public.cuentas_corrientes where id = '30000000-0000-0000-0000-000000000001';
update public.cuentas_corrientes set activa = false where id = '30000000-0000-0000-0000-000000000001' returning activa;
select 'rpc inactiva', count(*) from public.cuentas_corrientes_para_cobro();
\echo '== T16 cobrar a cuenta inactiva (debe fallar); reasignar turno de pago existente (ok)'
insert into public.pagos (pedido_id, medio_pago, monto, cuenta_corriente_id) values ('10000000-0000-0000-0000-000000000002','cuenta_corriente',100,'30000000-0000-0000-0000-000000000001');
update public.pagos set caja_turno_id = '20000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000001' returning caja_turno_id;
update public.cuentas_corrientes set activa = true where id = '30000000-0000-0000-0000-000000000001' returning activa;
\echo '== T17 vista arqueo'
select medio_pago, monto, cuenta_corriente_nombre from public.pagos_arqueo order by created_at, medio_pago;
reset role;

\echo '== T18 finanzas: ve y edita'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas');
set role authenticated;
select 'fin ve', count(*) from public.cuentas_corrientes_saldos;
insert into public.cuenta_corriente_movimientos (cuenta_id, monto, detalle) values ('30000000-0000-0000-0000-000000000001', -5000, 'Devolución') returning monto;
select 'fin rpc', count(*) from public.cuentas_corrientes_para_cobro();
reset role;

\echo '== T19 cocina: nada'
select pg_temp.como('00000000-0000-0000-0000-0000000000c1','cocina');
set role authenticated;
select 'cocina ve', count(*) from public.cuentas_corrientes;
select 'cocina rpc', count(*) from public.cuentas_corrientes_para_cobro();
select 'cocina arqueo', count(*) from public.pagos_arqueo;
reset role;

\echo '== T20 anon: sin privilegios'
set role anon;
select count(*) from public.cuentas_corrientes;
select count(*) from public.cuentas_corrientes_para_cobro();
select count(*) from public.cuentas_corrientes_saldos;
reset role;

\echo '== T21 mozo en vista arqueo: nombre de cuenta null (no ve cuentas)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo');
set role authenticated;
select medio_pago, cuenta_corriente_nombre from public.pagos_arqueo where medio_pago='cuenta_corriente';
reset role;

\echo '== T22 opciones de la vista y grants'
select relname, reloptions from pg_class where relname in ('pagos_arqueo','cuentas_corrientes_saldos');
select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p where proname like '%cuenta%corriente%' order by 1;
\echo '== T23 borrar pedido? pagos.pedido_id es restrict; borrar pago -> cascade ok como mozo'
select 'final', consumido, saldo, movimientos from public.cuentas_corrientes_saldos;
