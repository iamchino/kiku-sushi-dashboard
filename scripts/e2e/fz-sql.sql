-- Batería SQL de "pagar con canje" y "saldo de las cuentas del negocio"
-- (SQL 59). Correr sobre una base de prep-db.sh … si sin-datos.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','noe@kikusushi.com.ar','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','yamile@kikusushi.com.ar','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}'),
 ('00000000-0000-0000-0000-0000000000d1','lectura@t','{"role":"administracion"}')
on conflict do nothing;
-- Rol de solo lectura de Finanzas: ve, pero no carga.
insert into public.roles (id, nombre) values ('administracion', 'Administración') on conflict do nothing;
insert into public.rol_permisos (rol_id, recurso_id, ver, editar) values ('administracion', 'finanzas', true, false)
  on conflict (rol_id, recurso_id) do update set ver = true, editar = false;
create or replace function pg_temp.como(p_id text, p_rol text, p_email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','email',p_email,'app_metadata',json_build_object('role',p_rol))::text, false);
end $$;
select (now() at time zone 'America/Argentina/Buenos_Aires')::date as hoy \gset
select (:'hoy'::date - 1)::text as ayer \gset
select (:'hoy'::date + 1)::text as maniana \gset

insert into public.proveedores (id, razon_social) values
 ('b0000000-0000-0000-0000-000000000001','Bodega Los Aromos');
insert into public.stock (id, nombre, unidad, stock_actual, precio_unitario, tipo_stock) values
 ('c0000000-0000-0000-0000-000000000001','Malbec Reserva','u', 6, 9000, 'materia_prima');
\set BOD 'b0000000-0000-0000-0000-000000000001'
\set VIN 'c0000000-0000-0000-0000-000000000001'
select id as galicia from public.cuentas_negocio where tipo = 'banco' order by orden, created_at limit 1 \gset
select id as mp from public.cuentas_negocio where tipo = 'billetera' order by orden, created_at limit 1 \gset
select 'cuentas sembradas|' || count(*) from public.cuentas_negocio;

-- ══ A) PAGAR CON CANJE ══════════════════════════════════════════════════════
\echo '== Z1 finanzas registra una factura pagada con canje: pagada, sin origen, sin caja'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
select count(*) as cm0 from public.caja_movimientos \gset
select count(*) as cf0 from public.caja_fuerte_movimientos \gset
set role authenticated;
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Vinos factura 1201', p_monto => 310000,
  p_medio_pago => 'canje', p_fecha => :'hoy', p_proveedor_id => :'BOD', p_comprobante => 'A 0004-00001201',
  p_notas => 'Canje por cata')) as r1 \gset
reset role;
select 'z1|' || estado || '|' || medio_pago || '|' || coalesce(pagado_desde, 'sin origen') || '|' || coalesce(caja_turno_id::text, 'sin turno') || '|' || monto
  from public.egresos where id = (:'r1'::jsonb ->> 'egreso_id')::uuid;
select 'z1 respuesta|' || coalesce(:'r1'::jsonb ->> 'origen', 'null') || '|' || (:'r1'::jsonb ->> 'descuenta_arqueo');
select 'z1 cajas|' || ((select count(*) from public.caja_movimientos) - :cm0) || '|' || ((select count(*) from public.caja_fuerte_movimientos) - :cf0);
select (:'r1'::jsonb ->> 'egreso_id') as eg1 \gset

\echo '== Z2 un canje no puede quedar pendiente (1 error)'
set role authenticated;
select public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Canje pendiente', p_monto => 1000,
  p_medio_pago => 'canje', p_estado => 'pendiente', p_fecha => :'hoy');
reset role;
select 'z2 filas|' || count(*) from public.egresos;

\echo '== Z3 con el turno abierto: el canje no toca la caja; "banco" con canje se rechaza (1 error)'
insert into public.caja_turnos (id, estado, apertura_monto, business_date, apertura_at)
 values ('20000000-0000-0000-0000-000000000059', 'abierto', 20000, :'hoy', now() - interval '1 hour');
set role authenticated;
select public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Canje desde el banco', p_monto => 1000,
  p_medio_pago => 'canje', p_fecha => :'hoy', p_origen => 'banco');
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Vinos factura 1202', p_monto => 190000,
  p_medio_pago => 'canje', p_fecha => :'hoy', p_proveedor_id => :'BOD', p_comprobante => 'A 0004-00001202',
  p_origen => 'caja')) as r3 \gset
reset role;
select 'z3|' || estado || '|' || coalesce(pagado_desde, 'sin origen') || '|' || coalesce(caja_turno_id::text, 'sin turno')
  from public.egresos where id = (:'r3'::jsonb ->> 'egreso_id')::uuid;
select 'z3 cajas|' || ((select count(*) from public.caja_movimientos) - :cm0);
select 'z3 filas|' || count(*) from public.egresos;

\echo '== Z4 una factura pendiente se cancela con canje (el caso de las dos facturas de vinos)'
set role authenticated;
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Vinos factura 1203', p_monto => 250000,
  p_medio_pago => 'transferencia', p_estado => 'pendiente', p_fecha => :'ayer', p_vencimiento => :'maniana',
  p_proveedor_id => :'BOD', p_comprobante => 'A 0004-00001203') ->> 'egreso_id') as eg4 \gset
select public.editar_pago(:'eg4', 'mercaderia', 'Vinos factura 1203', 250000, 'canje', 'pagado', :'hoy', :'BOD', null, null, null,
  null, 'A 0004-00001203', 'Canje por cata', 'auto', 'Noe la canjeó por una cata') ->> 'origen' is null as sin_origen;
reset role;
select 'z4|' || estado || '|' || medio_pago || '|' || coalesce(vencimiento::text, 'sin vencimiento') || '|' || coalesce(pagado_desde, 'sin origen')
  from public.egresos where id = :'eg4';
select 'z4 historial|' || count(*) || '|' || max(motivo) from public.egresos_auditoria where egreso_id = :'eg4' and evento = 'editado';

\echo '== Z5 un pago en efectivo de la caja pasa a canje: el movimiento de la caja se va'
set role authenticated;
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Hielo', p_monto => 15000,
  p_medio_pago => 'efectivo', p_fecha => :'hoy', p_origen => 'caja') ->> 'egreso_id') as eg5 \gset
reset role;
select 'z5 antes|' || pagado_desde || '|mov ' || (select count(*) from public.caja_movimientos cm where cm.egreso_id = e.id)
  from public.egresos e where id = :'eg5';
set role authenticated;
select public.editar_pago(:'eg5', 'mercaderia', 'Hielo', 15000, 'canje', 'pagado', :'hoy', null, null, null, null,
  null, null, null, 'auto', 'Era canje') ->> 'egreso_id' = :'eg5' as editado;
reset role;
select 'z5 despues|' || medio_pago || '|' || coalesce(pagado_desde, 'sin origen') || '|' || coalesce(caja_turno_id::text, 'sin turno') || '|mov ' || (select count(*) from public.caja_movimientos cm where cm.egreso_id = e.id)
  from public.egresos e where id = :'eg5';

\echo '== Z6 un canje no vuelve a pendiente como canje (1 error); con otro medio, sí'
set role authenticated;
select public.editar_pago(:'eg5', 'mercaderia', 'Hielo', 15000, 'canje', 'pendiente', :'hoy', null, null, null, null,
  :'maniana', null, null, 'auto', null);
select public.editar_pago(:'eg5', 'mercaderia', 'Hielo', 15000, 'transferencia', 'pendiente', :'hoy', null, null, null, null,
  :'maniana', null, null, 'auto', null) ->> 'egreso_id' = :'eg5' as editado;
reset role;
select 'z6|' || estado || '|' || medio_pago from public.egresos where id = :'eg5';

\echo '== Z7 la regla vale también por fuera de las funciones (2 errores)'
update public.egresos set pagado_desde = 'caja' where id = :'eg1';
update public.egresos set estado = 'pendiente' where id = :'eg1';
select 'z7|' || estado || '|' || coalesce(pagado_desde, 'sin origen') from public.egresos where id = :'eg1';

\echo '== Z8 el cash flow no cuenta los canjes'
-- Pagado con plata este mes en Mercadería: nada todavía. Se suma un pago real.
set role authenticated;
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Pescadería', p_monto => 120000.50,
  p_medio_pago => 'efectivo', p_fecha => :'hoy', p_origen => 'ninguno') ->> 'egreso_id') as eg8 \gset
select 'z8 cash flow mercaderia|' || pagado || '|' || cantidad || '|pend ' || pendiente
  from public.cashflow_mensual(:'hoy', :'hoy') where concepto = 'mercaderia' and mes is not null;
reset role;
select 'z8 en la tabla|plata ' || coalesce(sum(monto) filter (where medio_pago <> 'canje'), 0) || '|canje ' || coalesce(sum(monto) filter (where medio_pago = 'canje'), 0)
  from public.egresos where estado = 'pagado' and categoria = 'mercaderia';

\echo '== Z9 una boleta con productos pagada con canje: la mercadería entra igual'
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Vinos factura 1204','monto',60000,'medio_pago','canje',
    'estado','pagado','fecha', :'hoy','proveedor_id', :'BOD','comprobante','A 0004-00001204','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'VIN', 'cantidad', 6, 'precio_unitario', 10000))) ->> 'egreso_id') as eg9 \gset
reset role;
select 'z9|' || e.medio_pago || '|' || e.estado || '|vino ' || s.stock_actual || '|' || s.precio_unitario::numeric(14,2)
  from public.egresos e, public.stock s where e.id = :'eg9' and s.id = :'VIN';

\echo '== Z10 anular un pago con canje'
set role authenticated;
select public.anular_pago(:'eg9', 'Se cargó dos veces') ->> 'egreso_id' = :'eg9' as anulado;
reset role;
select 'z10|' || (select count(*) from public.egresos where id = :'eg9') || '|vino ' || stock_actual from public.stock where id = :'VIN';

\echo '== Z11 el mozo no registra pagos, con canje tampoco (1 error)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Canje del mozo', p_monto => 1000, p_medio_pago => 'canje');
reset role;
select 'z11 canjes|' || count(*) || '|' || sum(monto) from public.egresos where medio_pago = 'canje';

-- ══ B) SALDO DE LAS CUENTAS ═════════════════════════════════════════════════
\echo '== B1 finanzas informa el saldo del banco'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select 'b1|' || saldo || '|' || (fecha = :'hoy'::date) || '|' || usuario_nombre || '|' || coalesce(nota, 'sin nota')
  from public.cuenta_negocio_informar_saldo(:'galicia', 500000.004, null, '   ');
select 'b1 vigentes|' || nombre || '|' || coalesce(saldo::text, 'sin saldo') || '|' || pagado_despues || '|' || pagos_despues
  from public.cuentas_negocio_saldos_vigentes() order by orden;

\echo '== B2 validaciones (5 errores)'
select public.cuenta_negocio_informar_saldo(:'galicia', null);
select public.cuenta_negocio_informar_saldo('00000000-0000-0000-0000-00000000dead', 1000);
select public.cuenta_negocio_informar_saldo(:'galicia', 1000, :'maniana');
select public.cuenta_negocio_informar_saldo(:'galicia', 1000, :'hoy', repeat('a', 201));
select public.cuenta_negocio_informar_saldo(:'galicia', 1000000000000);
select 'b2 filas|' || count(*) from public.cuentas_negocio_saldos;

\echo '== B3 queda el historial; manda la fecha más nueva y, a igual fecha, lo último cargado'
select 'b3 de ayer|' || saldo from public.cuenta_negocio_informar_saldo(:'galicia', 400000, :'ayer', 'saldo de ayer, cargado tarde');
select 'b3 vigente|' || saldo || '|' || (fecha = :'hoy'::date) from public.cuentas_negocio_saldos_vigentes() where cuenta_id = :'galicia';
select 'b3 corregido|' || saldo from public.cuenta_negocio_informar_saldo(:'galicia', 520000, :'hoy', 'entró una acreditación');
select 'b3 vigente|' || saldo || '|' || nota from public.cuentas_negocio_saldos_vigentes() where cuenta_id = :'galicia';
select 'b3 filas|' || count(*) from public.cuentas_negocio_saldos;
select 'b3 negativo|' || saldo from public.cuenta_negocio_informar_saldo(:'mp', -35000.5, :'ayer');

\echo '== B4 lo pagado por transferencia DESPUÉS del saldo, por cuenta'
-- De Galicia, hoy y cargado después del saldo: cuenta.
select public.registrar_pago(p_categoria => 'servicios', p_descripcion => 'Luz', p_monto => 80000, p_medio_pago => 'transferencia',
  p_fecha => :'hoy', p_origen => 'banco', p_cuenta_id => :'galicia') ->> 'origen' as origen_luz \gset
-- De Galicia pero con fecha de ayer (anterior al saldo): no cuenta.
select public.registrar_pago(p_categoria => 'servicios', p_descripcion => 'Gas de ayer', p_monto => 30000, p_medio_pago => 'transferencia',
  p_fecha => :'ayer', p_origen => 'banco', p_cuenta_id => :'galicia') ->> 'origen' as origen_gas \gset
-- De Mercado Pago, hoy: cuenta para Mercado Pago (su saldo es de ayer), no para Galicia.
select public.registrar_pago(p_categoria => 'marketing', p_descripcion => 'Publicidad', p_monto => 12000, p_medio_pago => 'transferencia',
  p_fecha => :'hoy', p_origen => 'banco', p_cuenta_id => :'mp') ->> 'origen' as origen_pub \gset
-- Pendiente y con canje: no son plata que salió del banco.
select public.registrar_pago(p_categoria => 'servicios', p_descripcion => 'Internet a pagar', p_monto => 9000, p_medio_pago => 'transferencia',
  p_estado => 'pendiente', p_fecha => :'hoy', p_vencimiento => :'maniana') ->> 'origen' as origen_pend \gset
select 'b4|' || nombre || '|' || saldo || '|' || pagado_despues || '|' || pagos_despues
  from public.cuentas_negocio_saldos_vigentes() order by orden;
reset role;

\echo '== B5 una cuenta nueva aparece sin saldo; desactivada y sin saldo, no aparece; con saldo, sí'
insert into public.cuentas_negocio (id, nombre, tipo, activa, orden) values
 ('a0000000-0000-0000-0000-000000000003', 'Banco Macro', 'banco', true, 5),
 ('a0000000-0000-0000-0000-000000000004', 'Cuenta vieja', 'banco', false, 6);
update public.cuentas_negocio set activa = false where id = :'mp';
set role authenticated;
select 'b5|' || nombre || '|' || activa || '|' || coalesce(saldo::text, 'sin saldo') from public.cuentas_negocio_saldos_vigentes() order by orden;
reset role;
update public.cuentas_negocio set activa = true where id = :'mp';

\echo '== B6 solo lectura de Finanzas: ve los saldos, no los carga (1 error)'
select pg_temp.como('00000000-0000-0000-0000-0000000000d1','administracion','lectura@t');
set role authenticated;
select 'b6 ve|' || count(*) || '|' || sum(saldo) from public.cuentas_negocio_saldos_vigentes();
select 'b6 historial|' || count(*) from public.cuentas_negocio_saldos;
select public.cuenta_negocio_informar_saldo(:'galicia', 1);
reset role;

\echo '== B7 el mozo no ve ni carga (1 error)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select 'b7 vigentes|' || count(*) from public.cuentas_negocio_saldos_vigentes();
select 'b7 tabla|' || count(*) from public.cuentas_negocio_saldos;
select public.cuenta_negocio_informar_saldo(:'galicia', 1);
reset role;

\echo '== B8 la tabla no se escribe directo, ni siendo finanzas (3 errores)'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
insert into public.cuentas_negocio_saldos (cuenta_id, fecha, saldo) values (:'galicia', :'hoy', 1);
update public.cuentas_negocio_saldos set saldo = 1;
delete from public.cuentas_negocio_saldos;
reset role;
select 'b8 filas|' || count(*) || '|' || sum(saldo) from public.cuentas_negocio_saldos;

\echo '== B9 anon: nada (3 errores)'
set role anon;
select count(*) from public.cuentas_negocio_saldos;
select public.cuentas_negocio_saldos_vigentes();
select public.cuenta_negocio_informar_saldo(:'galicia', 1);
reset role;

\echo '== B10 quien tiene ficha de empleado queda con su nombre (rol admin: cuenta como Finanzas en la base)'
insert into public.empleados (id, nombre, apellido, user_id, activo)
 values ('e0000000-0000-0000-0000-000000000001', 'Noelia', 'Pérez', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin','noe@kikusushi.com.ar');
set role authenticated;
select 'b10|' || usuario_nombre from public.cuenta_negocio_informar_saldo(:'galicia', 530000, :'hoy');
reset role;

\echo '== B11 borrar la cuenta se lleva sus saldos'
delete from public.cuentas_negocio where id = :'mp';
select 'b11 filas|' || count(*) from public.cuentas_negocio_saldos;
