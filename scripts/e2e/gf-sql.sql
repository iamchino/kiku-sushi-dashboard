-- Batería SQL de "gastos fijos" (SQL 60). Correr sobre una base de
-- prep-db.sh … si sin-datos. Todo es relativo al mes en curso, así que da lo
-- mismo cualquier día del año.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','noe@kikusushi.com.ar','{"role":"admin"}'),
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
create or replace function pg_temp.sin_usuario() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;
select (now() at time zone 'America/Argentina/Buenos_Aires')::date as hoy \gset
select to_char(:'hoy'::date, 'YYYY-MM') as mes \gset
select to_char(:'hoy'::date + interval '1 month', 'YYYY-MM') as mes_sig \gset
select to_char(:'hoy'::date - interval '3 months', 'YYYY-MM') as mes_3 \gset
select to_char(:'hoy'::date - interval '14 months', 'YYYY-MM') as mes_14 \gset
select (date_trunc('month', :'hoy'::date) + interval '1 month' + interval '8 days')::date as venc_sig \gset

insert into public.proveedores (id, razon_social) values
 ('b0000000-0000-0000-0000-000000000002','Inmobiliaria Centro');
\set INM 'b0000000-0000-0000-0000-000000000002'

\echo '== F1 vencimientos: el día pedido o el último del mes'
select 'f1|' || public.gasto_fijo_vencimiento('2027-02', 31) || '|' || public.gasto_fijo_vencimiento('2028-02', 30)
  || '|' || public.gasto_fijo_vencimiento('2026-11', 31) || '|' || public.gasto_fijo_vencimiento('2026-12', 5)
  || '|' || public.gasto_fijo_mes_texto('2026-09');

\echo '== G1 finanzas carga el alquiler (día 10) y se crea el pendiente del mes'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select (public.gasto_fijo_guardar(null, 'Alquiler', 'alquiler', 800000, 10, 'transferencia', :'INM', 'Contrato hasta 2028')).id as alq \gset
select public.generar_gastos_fijos() as r1 \gset
reset role;
select 'g1 gasto|' || descripcion || '|' || monto || '|' || dia_vencimiento || '|' || (desde = :'mes') || '|' || activo || '|' || coalesce(usuario_nombre, '?')
  from public.gastos_fijos where id = :'alq';
select 'g1 creados|' || (:'r1'::jsonb ->> 'creados');
select 'g1 pago|' || (descripcion = 'Alquiler · ' || public.gasto_fijo_mes_texto(:'mes')) || '|' || estado || '|' || monto || '|' || medio_pago
       || '|' || (vencimiento = public.gasto_fijo_vencimiento(:'mes', 10)) || '|' || (fecha = :'hoy'::date) || '|' || (periodo = :'mes')
       || '|' || recurrente || '|' || coalesce(notas, '') || '|' || (proveedor_id = :'INM')
  from public.egresos where gasto_fijo_id = :'alq';
select 'g1 mes|' || count(*) || '|' || min(origen) from public.gastos_fijos_meses where gasto_fijo_id = :'alq' and egreso_id is not null;

\echo '== G2 llamarla de nuevo no crea nada'
set role authenticated;
select 'g2|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;
select 'g2 pagos|' || count(*) from public.egresos where gasto_fijo_id = :'alq';

\echo '== G3 día 31: vence el último día del mes'
set role authenticated;
select (public.gasto_fijo_guardar(null, 'Autónomos', 'impuestos', 120000, 31, 'transferencia')).id as aut \gset
select public.generar_gastos_fijos() ->> 'creados' as c3 \gset
reset role;
select 'g3|' || :'c3' || '|' || (vencimiento = (date_trunc('month', :'hoy'::date) + interval '1 month - 1 day')::date)
  from public.egresos where gasto_fijo_id = :'aut';

\echo '== G4 empieza el mes que viene: hoy no crea nada'
set role authenticated;
select (public.gasto_fijo_guardar(null, 'Seguro del local', 'otros', 45000, 5, 'tarjeta_credito', null, null, :'mes_sig')).id as seg \gset
select 'g4|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;
select 'g4 pagos|' || count(*) from public.egresos where gasto_fijo_id = :'seg';

\echo '== G5 uno que viene de antes crea los meses que faltan (3 atrás + el actual); otro de hace 14 meses, como mucho 12'
insert into public.gastos_fijos (id, descripcion, categoria, monto, medio_pago, dia_vencimiento, desde)
values ('e6000000-0000-0000-0000-000000000001', 'Luz', 'servicios', 50000, 'transferencia', 15, :'mes_3'),
       ('e6000000-0000-0000-0000-000000000002', 'Comisión del banco', 'comisiones', 9000, 'otro', 1, :'mes_14');
\set LUZ 'e6000000-0000-0000-0000-000000000001'
\set COM 'e6000000-0000-0000-0000-000000000002'
set role authenticated;
select 'g5|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;
select 'g5 luz|' || count(*) || '|' || (min(periodo) = :'mes_3') || '|' || (max(periodo) = :'mes')
       || '|' || count(*) filter (where fecha = to_date(periodo || '-01', 'YYYY-MM-DD')) || '|' || count(*) filter (where fecha = :'hoy'::date)
  from public.egresos where gasto_fijo_id = :'LUZ';
select 'g5 comision|' || count(*) || '|' || (min(periodo) = to_char(:'hoy'::date - interval '11 months', 'YYYY-MM'))
  from public.egresos where gasto_fijo_id = :'COM';

\echo '== G6 si se borra el pendiente de un mes, no vuelve a aparecer'
select id as alq_eg from public.egresos where gasto_fijo_id = :'alq' \gset
set role authenticated;
select public.anular_pago(:'alq_eg', 'Lo cargué a mano');
select 'g6|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;
select 'g6 pagos|' || count(*) || '|' || (select count(*) from public.gastos_fijos_meses where gasto_fijo_id = :'alq')
       || '|' || (select coalesce(egreso_id::text, 'sin pago') from public.gastos_fijos_meses where gasto_fijo_id = :'alq')
  from public.egresos where gasto_fijo_id = :'alq';

\echo '== G7 validaciones (7 errores)'
set role authenticated;
select public.gasto_fijo_guardar(null, 'Sueldo Juan', 'sueldos', 100, 5);
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 0, 5);
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 32);
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 5, 'canje');
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 5, 'transferencia', null, null, :'mes_3');
select public.gasto_fijo_guardar(null, '   ', 'servicios', 100, 5);
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 5, 'transferencia', null, repeat('x', 301));
reset role;
select 'g7 gastos|' || count(*) from public.gastos_fijos;

\echo '== G8 permisos: mozo no carga (1 error), no ve y generar le devuelve 0; lectura ve pero no carga (1 error); anon nada (3 errores)'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 5);
select 'g8 mozo ve|' || count(*) from public.gastos_fijos;
select 'g8 mozo genera|' || (public.generar_gastos_fijos() ->> 'creados') || '|' || (public.generar_gastos_fijos() ->> 'permiso');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000d1','administracion','lectura@t');
set role authenticated;
select 'g8 lectura ve|' || count(*) from public.gastos_fijos;
select public.gasto_fijo_activar(:'alq', false);
reset role;
set role anon;
select count(*) from public.gastos_fijos;
select public.generar_gastos_fijos();
select public.gasto_fijo_guardar(null, 'Gas', 'servicios', 100, 5);
reset role;
select 'g8 alquiler sigue activo|' || activo from public.gastos_fijos where id = :'alq';

\echo '== G9 desde un pago: el F931 pendiente que vence el 9 del mes que viene'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select (public.registrar_pago(p_categoria => 'impuestos', p_descripcion => 'F931 NV NOVIEMBRE26', p_monto => 122000,
  p_medio_pago => 'transferencia', p_estado => 'pendiente', p_vencimiento => :'venc_sig', p_notas => 'F931')) ->> 'egreso_id' as f931 \gset
select (public.gasto_fijo_desde_pago(:'f931', null, 'F931')).id as gf931 \gset
select 'g9 genera|' || (public.generar_gastos_fijos() ->> 'creados');
select public.gasto_fijo_desde_pago(:'f931');
reset role;
select 'g9 gasto|' || descripcion || '|' || dia_vencimiento || '|' || (desde = :'mes_sig') || '|' || monto || '|' || categoria || '|' || coalesce(notas, '')
  from public.gastos_fijos where id = :'gf931';
select 'g9 pago|' || (gasto_fijo_id = :'gf931') || '|' || recurrente || '|' || (periodo = :'mes_sig') || '|' || descripcion
  from public.egresos where id = :'f931';
select 'g9 mes|' || origen || '|' || (periodo = :'mes_sig') from public.gastos_fijos_meses where egreso_id = :'f931';
select 'g9 historial|' || evento || '|' || coalesce(motivo, '') from public.egresos_auditoria where egreso_id = :'f931' order by created_at desc, evento limit 1;

\echo '== G10 desde un pago ya hecho: el mes y el día salen de la fecha'
set role authenticated;
select (public.registrar_pago(p_categoria => 'servicios', p_descripcion => 'Internet', p_monto => 30000,
  p_medio_pago => 'tarjeta_debito', p_fecha => :'hoy')) ->> 'egreso_id' as net \gset
select (public.gasto_fijo_desde_pago(:'net')).id as gfnet \gset
select 'g10 genera|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;
select 'g10|' || descripcion || '|' || (dia_vencimiento = extract(day from :'hoy'::date)) || '|' || (desde = :'mes') || '|' || medio_pago
  from public.gastos_fijos where id = :'gfnet';
select 'g10 pagos|' || count(*) from public.egresos where gasto_fijo_id = :'gfnet';

\echo '== G11 el monto se actualiza con lo último que se pagó (no con un mes viejo ni con canje)'
update public.egresos set estado = 'pagado', monto = 55000, fecha = :'hoy'
 where gasto_fijo_id = :'LUZ' and periodo = :'mes';
select 'g11 luz actual|' || monto from public.gastos_fijos where id = :'LUZ';
update public.egresos set estado = 'pagado', monto = 41000
 where gasto_fijo_id = :'LUZ' and periodo = :'mes_3';
select 'g11 luz viejo|' || monto from public.gastos_fijos where id = :'LUZ';
update public.egresos set estado = 'pagado', monto = 99000, medio_pago = 'canje'
 where gasto_fijo_id = :'aut';
select 'g11 canje|' || monto from public.gastos_fijos where id = :'aut';
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select public.editar_pago(p_egreso_id => e.id, p_categoria => e.categoria, p_descripcion => e.descripcion, p_monto => 9500,
  p_medio_pago => 'otro', p_estado => 'pagado', p_fecha => :'hoy')
  from public.egresos e where e.gasto_fijo_id = :'COM' and e.periodo = :'mes';
reset role;
select 'g11 por el formulario|' || monto from public.gastos_fijos where id = :'COM';

\echo '== G12 pausar y reanudar: al reanudar no crea los meses pausados'
set role authenticated;
select 'g12 pausa|' || (public.gasto_fijo_activar(:'LUZ', false)).activo;
reset role;
update public.gastos_fijos set desde = :'mes_3' where id = :'LUZ';
delete from public.gastos_fijos_meses where gasto_fijo_id = :'LUZ' and periodo = :'mes';
set role authenticated;
select 'g12 pausado genera|' || (public.generar_gastos_fijos() ->> 'creados');
select 'g12 reanuda|' || ((public.gasto_fijo_activar(:'LUZ', true)).desde = :'mes');
select 'g12 genera|' || (public.generar_gastos_fijos() ->> 'creados');
reset role;

\echo '== G13 corregir: vale para los meses que vienen; el primer mes no va para atrás (1 error)'
set role authenticated;
select 'g13|' || (g).monto || '|' || (g).dia_vencimiento || '|' || (g).descripcion
  from (select public.gasto_fijo_guardar(:'alq', 'Alquiler del local', 'alquiler', 880000, 12, 'transferencia', :'INM', null) as g) x;
select public.gasto_fijo_guardar(:'seg', 'Seguro del local', 'otros', 45000, 5, 'tarjeta_credito', null, null, :'mes_3');
reset role;
select 'g13 pendiente viejo|' || count(*) from public.egresos where gasto_fijo_id = :'alq';
select 'g13 notas|' || coalesce(notas, 'sin notas') from public.gastos_fijos where id = :'alq';

\echo '== G14 sin usuario (pg_cron / SQL Editor) también genera'
select pg_temp.sin_usuario();
insert into public.gastos_fijos (id, descripcion, categoria, monto, medio_pago, dia_vencimiento, desde)
values ('e6000000-0000-0000-0000-000000000003', 'Agua', 'servicios', 7000, 'transferencia', 20, :'mes');
select 'g14|' || (public.generar_gastos_fijos() ->> 'creados') || '|' || (public.generar_gastos_fijos() ->> 'creados');

\echo '== G15 borrar: los pagos que creó quedan'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','yamile@kikusushi.com.ar');
set role authenticated;
select public.gasto_fijo_borrar('e6000000-0000-0000-0000-000000000003');
select public.gasto_fijo_borrar('e6000000-0000-0000-0000-000000000003');
reset role;
select 'g15|' || (select count(*) from public.gastos_fijos where id = 'e6000000-0000-0000-0000-000000000003')
  || '|' || (select count(*) from public.gastos_fijos_meses where gasto_fijo_id = 'e6000000-0000-0000-0000-000000000003')
  || '|' || (select count(*) from public.egresos where gasto_fijo_id = 'e6000000-0000-0000-0000-000000000003');

\echo '== G16 escribir directo en las tablas: no (3 errores)'
set role authenticated;
insert into public.gastos_fijos (descripcion, categoria, monto, dia_vencimiento, desde) values ('x', 'otros', 1, 1, :'mes');
update public.gastos_fijos set monto = 1;
delete from public.gastos_fijos_meses;
reset role;

\echo '== Totales'
select 'final|' || (select count(*) from public.gastos_fijos) || '|' || (select count(*) from public.egresos where gasto_fijo_id is not null)
       || '|' || (select count(*) from public.gastos_fijos_meses);
