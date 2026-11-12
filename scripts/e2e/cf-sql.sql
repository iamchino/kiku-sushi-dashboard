-- Batería SQL del cash flow (SQL 55). Correr sobre una base de prep-db.sh … sin-datos.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','fin@t','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}')
on conflict do nothing;
create or replace function pg_temp.como(p_id text, p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','app_metadata',json_build_object('role',p_rol))::text, false);
end $$;
-- Meses relativos a hoy (Argentina): m0 = mes en curso.
select date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date as m0 \gset
select (:'m0'::date - interval '1 month')::date as m_1, (:'m0'::date - interval '2 month')::date as m_2,
       (:'m0'::date + interval '1 month')::date as m1, (:'m0'::date + interval '2 month')::date as m2 \gset

insert into public.pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-00000000cf01', 9901, 'salon', 'entregado', 1);
-- Cobros: uno a las 23:30 AR del último día del mes pasado (ya es el mes en
-- curso en UTC: tiene que caer en el mes PASADO), uno a las 00:30 AR del día 1
-- (mes en curso), uno a cuenta corriente (no cuenta) y uno de hace dos meses.
insert into public.pagos (pedido_id, medio_pago, monto, created_at) values
 ('10000000-0000-0000-0000-00000000cf01','efectivo', 1000, (:'m0'::timestamp - interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires'),
 ('10000000-0000-0000-0000-00000000cf01','transferencia', 2000, (:'m0'::timestamp + interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires'),
 ('10000000-0000-0000-0000-00000000cf01','tarjeta_debito', 400, (:'m_2'::timestamp + interval '10 days') at time zone 'America/Argentina/Buenos_Aires');
insert into public.cuentas_corrientes (id, nombre, monto_acordado) values ('30000000-0000-0000-0000-00000000cf01','Canje', 99999);
insert into public.pagos (pedido_id, medio_pago, monto, cuenta_corriente_id, created_at) values
 ('10000000-0000-0000-0000-00000000cf01','cuenta_corriente', 5000, '30000000-0000-0000-0000-00000000cf01', (:'m0'::timestamp + interval '2 days') at time zone 'America/Argentina/Buenos_Aires');
insert into public.egresos (fecha, categoria, descripcion, monto, estado, vencimiento) values
 (:'m_1'::date + 4, 'mercaderia', 'Pescado',        300, 'pagado',    null),
 (:'m_1'::date + 9, 'proveedores','Packaging',      50,  'pagado',    null),
 (:'m0'::date,      'sueldos',    'Quincena',       700, 'pagado',    null),
 (:'m0'::date,      'alquiler',   'Alquiler',       500, 'pendiente', :'m0'::date + 20),
 (:'m0'::date,      'servicios',  'Luz vencida',    80,  'pendiente', :'m_1'::date + 15),
 (:'m0'::date,      'impuestos',  'IIBB mes que viene', 120, 'pendiente', :'m1'::date + 14),
 (:'m0'::date,      'otros',      'Sin fecha',      33,  'pendiente', null),
 (:'m0'::date,      'mercaderia', 'Fuera de rango', 999, 'pendiente', :'m2'::date + 40);

\echo '== C1 finanzas: agregado por mes (m-2..m+1)'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas');
set role authenticated;
select case when mes is null then 'sin-fecha' else 'm' || to_char((extract(year from age(mes, :'m0'::date)) * 12 + extract(month from age(mes, :'m0'::date))), 'FMS0') end
       || '|' || concepto || '|' || pagado || '|' || pendiente || '|' || cantidad
  from public.cashflow_mensual(:'m_2'::date, :'m1'::date);
\echo '== C2 finanzas guarda estimados (alta, cambio, baja) y config'
select 'guardados', public.cashflow_guardar_estimados(jsonb_build_array(
  jsonb_build_object('mes', :'m1', 'concepto', 'ingresos', 'monto', 7700000),
  jsonb_build_object('mes', (:'m1'::date + 12)::text, 'concepto', 'mercaderia', 'monto', 5775000),
  jsonb_build_object('mes', :'m2', 'concepto', 'personal', 'monto', 100)));
select 'cambio', public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m1', 'concepto', 'mercaderia', 'monto', 6000000)));
select 'baja', public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m2', 'concepto', 'personal', 'monto', null)));
select 'estimados', (mes = :'m1'::date), concepto, monto, updated_by from public.cashflow_estimados order by concepto;
select public.cashflow_guardar_config(2800000, :'m0'::date + 10, 500000);
select 'config', saldo_inicial, (saldo_desde = :'m0'::date), saldo_minimo from public.cashflow_config;
select public.cashflow_guardar_config(-150000, null, null);
select 'config2', saldo_inicial, saldo_desde is null, saldo_minimo, (select count(*) from public.cashflow_config) from public.cashflow_config;
\echo '== C3 rechazos: monto negativo, concepto raro, lista vacia de tipo, categoria invalida'
select public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m1', 'concepto', 'ingresos', 'monto', -5)));
select public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m1', 'concepto', 'Ingresos; drop', 'monto', 5)));
select public.cashflow_guardar_estimados('{"mes":"x"}'::jsonb);
reset role;
insert into public.egresos (categoria, descripcion, monto) values ('inventada', 'x', 1);
insert into public.egresos (categoria, descripcion, monto, fecha) values ('comisiones', 'Comisión posnet', 45, :'m_1'::date + 2) returning categoria;

\echo '== C4 mozo: lee pagos para cobrar, pero la función le devuelve vacío y no toca estimados'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo');
set role authenticated;
select 'mozo ve pagos', count(*) > 0 from public.pagos;
select 'mozo cashflow', count(*) from public.cashflow_mensual(:'m_2'::date, :'m1'::date);
select 'mozo estimados', count(*) from public.cashflow_estimados;
select 'mozo config', count(*) from public.cashflow_config;
select public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m1', 'concepto', 'ingresos', 'monto', 1)));
select public.cashflow_guardar_config(1, null, 0);
select 'mozo baja no borra', public.cashflow_guardar_estimados(jsonb_build_array(jsonb_build_object('mes', :'m1', 'concepto', 'ingresos', 'monto', null)));
reset role;
select 'siguen', count(*) from public.cashflow_estimados;

\echo '== C5 admin: a nivel base entra al dominio Finanzas (is_finanzas_user), igual que el resto de Finanzas'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin');
set role authenticated;
select 'admin cashflow', count(*) > 0 from public.cashflow_mensual(:'m_2'::date, :'m1'::date);
reset role;

\echo '== C6 anon'
set role anon;
select count(*) from public.cashflow_mensual(current_date, current_date);
select count(*) from public.cashflow_estimados;
reset role;
\echo '== C7 comisiones aparece en el mes pasado'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas');
set role authenticated;
select 'comisiones', pagado from public.cashflow_mensual(:'m_1'::date, :'m_1'::date) where concepto = 'comisiones';
select 'un solo mes', count(*), sum(pagado) from public.cashflow_mensual(:'m_1'::date, :'m_1'::date) where mes is not null;
reset role;
