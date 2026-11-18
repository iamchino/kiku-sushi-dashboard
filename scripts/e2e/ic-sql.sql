-- Batería SQL del IVA de las compras (SQL 61). Correr sobre una base de
-- prep-db.sh … si sin-datos. Todo es relativo al día de hoy.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1','yamile@kikusushi.com.ar','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}'),
 ('00000000-0000-0000-0000-0000000000d1','lectura@t','{"role":"administracion"}')
on conflict do nothing;
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
select date_trunc('month', :'hoy'::date)::date as ini \gset
select (date_trunc('month', :'hoy'::date) + interval '1 month - 1 day')::date as fin \gset

\echo '== I1 una factura A de $16.644,03 con IVA 21 % de $2.888,63'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Tapas', p_monto => 16644.03,
  p_medio_pago => 'transferencia', p_fecha => :'hoy')) ->> 'egreso_id' as e1 \gset
select public.egreso_guardar_iva(:'e1', 2888.63, '21', :'ini') ->> 'iva_credito' as r1 \gset
reset role;
select 'i1|' || iva_credito || '|' || iva_alicuota || '|' || (factura_fecha = :'ini'::date) from public.egresos where id = :'e1';

\echo '== I2 una pendiente al 10,5 % y una con canje: las dos cuentan; la fecha de la factura, si no se dice, es la del pago'
set role authenticated;
select (public.registrar_pago(p_categoria => 'proveedores', p_descripcion => 'Verdulería', p_monto => 110500,
  p_medio_pago => 'transferencia', p_estado => 'pendiente', p_fecha => :'hoy', p_vencimiento => :'fin')) ->> 'egreso_id' as e2 \gset
select public.egreso_guardar_iva(:'e2', 10500, '10.5');
select (public.registrar_pago(p_categoria => 'mercaderia', p_descripcion => 'Vinos canje', p_monto => 121000,
  p_medio_pago => 'canje', p_fecha => :'hoy')) ->> 'egreso_id' as e3 \gset
select public.egreso_guardar_iva(:'e3', 21000, '21', :'hoy');
reset role;
select 'i2|' || (factura_fecha = :'hoy'::date) || '|' || iva_alicuota from public.egresos where id = :'e2';

\echo '== I3 una de otro mes (por fecha de factura) y un pago sin IVA: no cuentan en este mes'
set role authenticated;
select (public.registrar_pago(p_categoria => 'servicios', p_descripcion => 'Luz octubre', p_monto => 60500,
  p_medio_pago => 'transferencia', p_fecha => :'hoy')) ->> 'egreso_id' as e4 \gset
select public.egreso_guardar_iva(:'e4', 10500, '21', (:'ini'::date - 5));
select public.registrar_pago(p_categoria => 'otros', p_descripcion => 'Sin IVA', p_monto => 5000, p_fecha => :'hoy');
select 'i3|' || (r ->> 'facturas') || '|' || (r ->> 'iva') || '|' || (r ->> 'total') || '|' || (r ->> 'sin_iva')
       || '|' || (r -> 'por_alicuota' -> '21' ->> 'facturas') || '|' || (r -> 'por_alicuota' -> '10.5' ->> 'iva')
  from (select public.iva_compras_resumen(:'ini', :'fin') as r) x;
select 'i3 mes anterior|' || (public.iva_compras_resumen((:'ini'::date - 10), (:'ini'::date - 1)) ->> 'iva');
reset role;

\echo '== I4 validaciones (5 errores: mayor que el monto, negativo, alícuota, fecha futura, sueldo)'
set role authenticated;
select public.egreso_guardar_iva(:'e1', 20000, '21');
select public.egreso_guardar_iva(:'e1', -1, '21');
select public.egreso_guardar_iva(:'e1', 100, '19');
select public.egreso_guardar_iva(:'e1', 100, '21', (:'hoy'::date + 1));
reset role;
insert into public.empleados (id, nombre) values ('c9000000-0000-0000-0000-000000000001', 'Juan') on conflict do nothing;
insert into public.egresos (id, categoria, descripcion, monto, empleado_id) values ('c9000000-0000-0000-0000-000000000002', 'sueldos', 'Sueldo Juan', 1000, 'c9000000-0000-0000-0000-000000000001');
set role authenticated;
select public.egreso_guardar_iva('c9000000-0000-0000-0000-000000000002', 100, '21');
reset role;
select 'i4|' || iva_credito || '|' || iva_alicuota from public.egresos where id = :'e1';

\echo '== I5 corregir el monto por debajo del IVA se frena con un mensaje claro (1 error); escribir directo, igual (1 error)'
set role authenticated;
select public.editar_pago(p_egreso_id => :'e1', p_categoria => 'mercaderia', p_descripcion => 'Tapas', p_monto => 2000,
  p_medio_pago => 'transferencia', p_estado => 'pagado', p_fecha => :'hoy');
reset role;
update public.egresos set iva_credito = 999999 where id = :'e1';
select 'i5|' || monto || '|' || iva_credito from public.egresos where id = :'e1';
\echo '== I5b corregir otras cosas no toca el IVA'
set role authenticated;
select public.editar_pago(p_egreso_id => :'e1', p_categoria => 'mercaderia', p_descripcion => 'Tapas de copetín', p_monto => 16644.03,
  p_medio_pago => 'transferencia', p_estado => 'pagado', p_fecha => :'hoy');
reset role;
select 'i5b|' || descripcion || '|' || iva_credito || '|' || iva_alicuota || '|' || (factura_fecha = :'ini'::date) from public.egresos where id = :'e1';

\echo '== I6 sacar el IVA borra también la alícuota y la fecha de la factura'
set role authenticated;
select public.egreso_guardar_iva(:'e4', null);
reset role;
select 'i6|' || coalesce(iva_credito::text, 'sin iva') || '|' || coalesce(iva_alicuota, 'sin alicuota') || '|' || coalesce(factura_fecha::text, 'sin fecha') from public.egresos where id = :'e4';

\echo '== I7 el historial del pago registra el cambio de IVA'
select 'i7|' || count(*) from public.egresos_auditoria where egreso_id = :'e1' and evento = 'editado' and detalle -> 'cambios' ? 'iva_credito';

\echo '== I8 permisos: mozo nada (2 errores); solo lectura ve el resumen pero no carga (1 error); anon nada (2 errores)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select public.egreso_guardar_iva(:'e1', 100, '21');
select public.iva_compras_resumen(:'ini', :'fin');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000d1','administracion','lectura@t');
set role authenticated;
select 'i8 lectura|' || (public.iva_compras_resumen(:'ini', :'fin') ->> 'iva');
select public.egreso_guardar_iva(:'e1', 100, '21');
reset role;
set role anon;
select public.egreso_guardar_iva(:'e1', 100, '21');
select public.iva_compras_resumen(:'ini', :'fin');
reset role;

\echo '== I9 anular un pago lo saca del IVA'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select public.anular_pago(:'e3', 'era otra factura');
select 'i9|' || (public.iva_compras_resumen(:'ini', :'fin') ->> 'facturas') || '|' || (public.iva_compras_resumen(:'ini', :'fin') ->> 'iva');
reset role;
