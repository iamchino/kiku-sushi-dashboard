-- Batería SQL de stock + compras (SQL 56). Correr sobre una base de
-- prep-db.sh … sin-datos con SQL-CIERRES/24 aplicado (registrar_movimiento_stock).
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t','{"role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000f1','fin@t','{"role":"finanzas"}'),
 ('00000000-0000-0000-0000-0000000000b1','mozo@t','{"role":"mozo"}'),
 ('00000000-0000-0000-0000-0000000000e1','emp@t','{"role":"empleado"}')
on conflict do nothing;
create or replace function pg_temp.como(p_id text, p_rol text, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claims', json_build_object('sub',p_id,'role','authenticated','email',p_email,'app_metadata',json_build_object('role',p_rol))::text, false);
end $$;
select (now() at time zone 'America/Argentina/Buenos_Aires')::date as hoy \gset

-- El admin está vinculado a un empleado; finanzas no (se muestra el mail).
insert into public.empleados (id, nombre, apellido, user_id) values
 ('e0000000-0000-0000-0000-000000000001','Ana','Encargada','00000000-0000-0000-0000-0000000000a1');
insert into public.proveedores (id, razon_social) values
 ('b0000000-0000-0000-0000-000000000001','Pescadería Mar'),
 ('b0000000-0000-0000-0000-000000000002','Almacén Sur');
insert into public.stock (id, nombre, unidad, stock_actual, precio_unitario, tipo_stock, proveedor) values
 ('c0000000-0000-0000-0000-000000000001','Salmón','kg', 5, 10000, 'materia_prima', null),
 ('c0000000-0000-0000-0000-000000000002','Arroz','kg', 20, 2000, 'materia_prima', null),
 ('c0000000-0000-0000-0000-000000000003','Palta','kg', 4, 3000, 'materia_prima', null),
 ('c0000000-0000-0000-0000-000000000004','Wasabi','kg', 1, 500, 'materia_prima', ' almacén sur '),
 ('c0000000-0000-0000-0000-000000000005','Roll Kiku','roll', 6, 0, 'servicio', null);
\set SAL 'c0000000-0000-0000-0000-000000000001'
\set ARR 'c0000000-0000-0000-0000-000000000002'
\set PAL 'c0000000-0000-0000-0000-000000000003'
\set P1  'b0000000-0000-0000-0000-000000000001'
\set P2  'b0000000-0000-0000-0000-000000000002'

\echo '== S1 finanzas registra una boleta con dos productos'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Boleta pescadería','monto',140000,
    'medio_pago','transferencia','estado','pagado','fecha', :'hoy','proveedor_id', :'P1',
    'comprobante','A-0001','origen','ninguno'),
  jsonb_build_array(
    jsonb_build_object('stock_id', :'SAL', 'cantidad', 10, 'precio_unitario', 12000),
    jsonb_build_object('stock_id', :'PAL', 'cantidad', 5,  'precio_unitario', 4000))
) ->> 'egreso_id') as eg1 \gset
reset role;
select 's1 egreso|' || categoria || '|' || monto || '|' || estado || '|' || coalesce(comprobante_nro,'') from public.egresos where id = :'eg1';
select 's1 item|' || nombre || '|' || unidad || '|' || cantidad || '|' || precio_unitario::numeric(14,2) || '|' || subtotal || '|' || precio_anterior::numeric(14,2)
  from public.compra_items where egreso_id = :'eg1' order by nombre;
select 's1 stock|' || nombre || '|' || stock_actual || '|' || precio_unitario::numeric(14,2) from public.stock where id in (:'SAL', :'PAL') order by nombre;
select 's1 mov|' || s.nombre || '|' || m.tipo || '|' || m.cantidad || '|' || m.stock_antes || '>' || m.stock_despues || '|' || m.origen || '|' || (m.egreso_id = :'eg1') || '|' || m.usuario_nombre || '|' || m.costo_unitario::numeric(14,2) || '|' || m.notas
  from public.stock_movimientos m join public.stock s on s.id = m.stock_id order by s.nombre, m.created_at;

\echo '== S2 el total no coincide: se rechaza TODO (ni pago ni stock)'
select count(*) as antes from public.egresos \gset
set role authenticated;
select public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','No cierra','monto',99999,'medio_pago','transferencia','fecha', :'hoy','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'ARR', 'cantidad', 2, 'precio_unitario', 2500)));
reset role;
select 's2 egresos de mas|' || (count(*) - :antes) from public.egresos;
select 's2 arroz|' || stock_actual from public.stock where id = :'ARR';

\echo '== S3 con la diferencia aceptada (impuestos, envío) entra'
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Con percepciones','monto',6000,'medio_pago','transferencia','fecha', :'hoy','origen','ninguno','proveedor_id', :'P2'),
  jsonb_build_array(jsonb_build_object('stock_id', :'ARR', 'cantidad', 2, 'precio_unitario', 2500)),
  true) -> 'compra' ->> 'diferencia') as dif3 \gset
reset role;
select 's3 diferencia|' || :'dif3'::numeric(14,2) || '|arroz ' || stock_actual || '|' || precio_unitario::numeric(14,2) from public.stock where id = :'ARR';

\echo '== S4 corregir la boleta: menos salmón, sin palta, más arroz'
select count(*) as movs_antes from public.stock_movimientos \gset
set role authenticated;
select public.editar_compra(:'eg1',
  jsonb_build_object('categoria','mercaderia','descripcion','Boleta pescadería','monto',104000,
    'medio_pago','transferencia','estado','pagado','fecha', :'hoy','proveedor_id', :'P1','comprobante','A-0001','origen','ninguno'),
  jsonb_build_array(
    jsonb_build_object('stock_id', :'SAL', 'cantidad', 8, 'precio_unitario', 12000),
    jsonb_build_object('stock_id', :'ARR', 'cantidad', 4, 'precio_unitario', 2000)),
  'se contó mal') -> 'compra' ->> 'items';
reset role;
select 's4 stock|' || nombre || '|' || stock_actual || '|' || precio_unitario::numeric(14,2) from public.stock where id in (:'SAL', :'PAL', :'ARR') order by nombre;
select 's4 movs nuevos|' || (count(*) - :movs_antes) from public.stock_movimientos;
select 's4 mov|' || s.nombre || '|' || m.tipo || '|' || m.cantidad || '|' || split_part(m.notas, ':', 1) || '|' || (m.egreso_id is not null)
  from public.stock_movimientos m join public.stock s on s.id = m.stock_id
 where m.created_at >= (select max(created_at) from public.stock_movimientos) order by s.nombre;
select 's4 monto|' || monto from public.egresos where id = :'eg1';

\echo '== S5 guardar de nuevo lo mismo no genera movimientos'
select count(*) as movs_antes from public.stock_movimientos \gset
set role authenticated;
select public.compra_guardar_items(:'eg1', jsonb_build_array(
    jsonb_build_object('stock_id', :'SAL', 'cantidad', 8, 'precio_unitario', 12000),
    jsonb_build_object('stock_id', :'ARR', 'cantidad', 4, 'precio_unitario', 2000))) ->> 'items';
reset role;
select 's5 movs nuevos|' || (count(*) - :movs_antes) from public.stock_movimientos;

\echo '== S6 validaciones (5 rechazos)'
set role authenticated;
select public.compra_guardar_items(:'eg1', jsonb_build_array(
    jsonb_build_object('stock_id', :'SAL', 'cantidad', 4, 'precio_unitario', 12000),
    jsonb_build_object('stock_id', :'SAL', 'cantidad', 4, 'precio_unitario', 12000)), true);
select public.compra_guardar_items(:'eg1', jsonb_build_array(jsonb_build_object('stock_id', :'SAL', 'cantidad', 0, 'precio_unitario', 12000)), true);
select public.compra_guardar_items(:'eg1', jsonb_build_array(jsonb_build_object('stock_id', :'SAL', 'cantidad', 1, 'precio_unitario', -5)), true);
select public.compra_guardar_items(:'eg1', jsonb_build_array(jsonb_build_object('stock_id', 'c0000000-0000-0000-0000-0000000000ff', 'cantidad', 1, 'precio_unitario', 5)), true);
select public.registrar_compra(
  jsonb_build_object('categoria','sueldos','descripcion','Sueldo','monto',5000,'empleado_id','e0000000-0000-0000-0000-000000000001','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'SAL', 'cantidad', 1, 'precio_unitario', 5000)));
reset role;
select 's6 salmon sigue|' || stock_actual from public.stock where id = :'SAL';

\echo '== S7 permisos: el mozo no carga compras (2 rechazos) pero ve la lista; el empleado no ve nada'
select pg_temp.como('00000000-0000-0000-0000-0000000000b1','mozo','mozo@t');
set role authenticated;
select public.registrar_compra(jsonb_build_object('categoria','mercaderia','descripcion','x','monto',1), '[]'::jsonb);
select public.compra_guardar_items(:'eg1', '[]'::jsonb);
select 's7 mozo lista|' || count(*) from public.compra_productos(null);
select 's7 mozo faltantes ok|' || (count(*) >= 0) from public.stock_faltantes(:'hoy', :'hoy');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000e1','empleado','emp@t');
set role authenticated;
select 's7 empleado lista|' || count(*) from public.compra_productos(null);
select 's7 empleado faltantes|' || count(*) from public.stock_faltantes(:'hoy', :'hoy');
select 's7 empleado items|' || count(*) from public.compra_items;
reset role;

\echo '== S8 habituales por proveedor'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select 's8 P1|' || nombre || '|' || habitual || '|' || veces || '|' || coalesce(ultimo_precio::numeric(14,2)::text,'-') || '|' || coalesce(ultima_cantidad::text,'-') || '|' || precio_actual::numeric(14,2)
  from public.compra_productos(:'P1') order by nombre;
select 's8 P2|' || nombre || '|' || habitual || '|' || veces from public.compra_productos(:'P2') where habitual order by nombre;
select 's8 sin proveedor|' || count(*) filter (where habitual) || '|' || count(*) from public.compra_productos(null);
reset role;

\echo '== S9 la API no deja escribir compra_items a mano (3 rechazos) y anon no entra (3 rechazos)'
set role authenticated;
insert into public.compra_items (egreso_id, stock_id, nombre, cantidad) values (:'eg1', :'PAL', 'x', 1);
update public.compra_items set cantidad = 99 where egreso_id = :'eg1';
delete from public.compra_items where egreso_id = :'eg1';
select 's9 fin lee|' || count(*) from public.compra_items where egreso_id = :'eg1';
reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.role', '', false) \gset
set role anon;
select count(*) from public.compra_items;
select count(*) from public.compra_productos(null);
select count(*) from public.stock_faltantes(:'hoy', :'hoy');
reset role;

\echo '== S10 una boleta vieja no pisa el precio de una más nueva'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Boleta atrasada','monto',9000,'medio_pago','transferencia','fecha', (:'hoy'::date - 10)::text,'proveedor_id', :'P1','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'SAL', 'cantidad', 1, 'precio_unitario', 9000))) ->> 'egreso_id') as eg_vieja \gset
reset role;
select 's10 precio salmon|' || precio_unitario::numeric(14,2) || '|stock ' || stock_actual from public.stock where id = :'SAL';

\echo '== S11 quién hizo cada movimiento manual'
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin','admin@t');
set role authenticated;
select public.registrar_movimiento_stock(:'SAL', 'merma', 1, 'se cayó una bandeja');
select public.registrar_conteo_stock(jsonb_build_array(jsonb_build_object('stock_id', :'SAL', 'contado', 11.5)), 'Conteo de inventario') -> 0 ->> 'diferencia';
reset role;
select 's11 mov|' || m.tipo || '|' || m.stock_antes || '>' || m.stock_despues || '|' || m.usuario_nombre || '|' || (m.usuario_id = '00000000-0000-0000-0000-0000000000a1') || '|' || m.costo_unitario::numeric(14,2) || '|' || coalesce(m.origen, 'manual')
  from public.stock_movimientos m where m.stock_id = :'SAL' and m.tipo in ('merma','ajuste') order by m.created_at, m.tipo desc;

\echo '== S12 reporte de faltantes del día'
-- Una venta (3 kg) y un movimiento de AYER 23:30 (no tiene que entrar).
insert into public.pedidos (id, numero, canal, estado, total) values ('10000000-0000-0000-0000-00000000f001', 9911, 'salon', 'entregado', 1);
update public.stock set stock_actual = stock_actual - 3 where id = :'SAL';
insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, pedido_id)
  values (:'SAL', 'salida', 3, 11.5, 8.5, 'Venta pedido 9911', '10000000-0000-0000-0000-00000000f001');
insert into public.stock_movimientos (stock_id, tipo, cantidad, stock_antes, stock_despues, notas, created_at)
  values (:'ARR', 'ajuste', 1, 30, 1, 'Conteo de ayer', (:'hoy'::timestamp - interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires');
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select 's12|' || nombre || '|ini ' || stock_inicial || '|compra ' || comprado || '|venta ' || vendido || '|merma ' || merma || '|conteos ' || conteos
       || '|falta ' || faltante || '|sobra ' || sobrante || '|$falta ' || valor_faltante || '|$merma ' || valor_merma || '|fin ' || stock_final || '|det ' || jsonb_array_length(detalle)
  from public.stock_faltantes(:'hoy', :'hoy') where nombre in ('Salmón', 'Arroz', 'Palta') order by nombre;
select 's12 quien|' || (detalle -> 0 ->> 'quien') || '|' || (detalle -> 0 ->> 'tipo') || '|' || (detalle -> 0 ->> 'diferencia') from public.stock_faltantes(:'hoy', :'hoy') where nombre = 'Salmón';
select 's12 ayer|' || nombre || '|falta ' || faltante from public.stock_faltantes((:'hoy'::date - 1), (:'hoy'::date - 1)) order by nombre;
reset role;

\echo '== S13 anular el pago devuelve el stock y el precio'
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select public.anular_pago(:'eg1', 'boleta duplicada') ->> 'egreso_id' = :'eg1';
reset role;
select 's13 items|' || count(*) from public.compra_items where egreso_id = :'eg1';
select 's13 stock|' || nombre || '|' || stock_actual || '|' || precio_unitario::numeric(14,2) from public.stock where id in (:'SAL', :'ARR') order by nombre;
select 's13 mov|' || s.nombre || '|' || m.tipo || '|' || m.cantidad || '|' || m.notas || '|' || m.origen || '|' || (m.egreso_id is null) || '|' || m.usuario_nombre
  from public.stock_movimientos m join public.stock s on s.id = m.stock_id where m.notas like 'Compra anulada%' and m.created_at >= now() - interval '5 seconds' order by s.nombre;
-- Anulada también la vieja: el salmón vuelve al precio de antes de las compras.
set role authenticated;
select public.anular_pago(:'eg_vieja', null) ->> 'egreso_id' = :'eg_vieja';
reset role;
select 's13 precio final salmon|' || precio_unitario::numeric(14,2) from public.stock where id = :'SAL';

\echo '== S14 con la caja abierta: efectivo de la caja del día + productos, y todo o nada'
insert into public.caja_turnos (id, estado, apertura_monto, business_date, apertura_at)
 values ('20000000-0000-0000-0000-000000000056', 'abierto', 20000, :'hoy', now() - interval '1 hour');
select count(*) as cm_antes from public.caja_movimientos \gset
set role authenticated;
-- No cierra el total → no queda ni el egreso ni el movimiento de caja.
select public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Verdulería (no cierra)','monto',5000,'medio_pago','efectivo','fecha', :'hoy','origen','caja'),
  jsonb_build_array(jsonb_build_object('stock_id', :'PAL', 'cantidad', 2, 'precio_unitario', 3500)));
reset role;
select 's14 caja tras rechazo|' || (count(*) - :cm_antes) from public.caja_movimientos;
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Verdulería','monto',7000,'medio_pago','efectivo','fecha', :'hoy','origen','caja'),
  jsonb_build_array(jsonb_build_object('stock_id', :'PAL', 'cantidad', 2, 'precio_unitario', 3500))) ->> 'descuenta_arqueo') as arqueo \gset
reset role;
select 's14 arqueo|' || :'arqueo' || '|caja ' || (count(*) - :cm_antes) from public.caja_movimientos;
select 's14 palta|' || stock_actual || '|' || precio_unitario::numeric(14,2) from public.stock where id = :'PAL';

\echo '== S15 un pago pendiente (cuenta por pagar) igual mete la mercadería'
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','proveedores','descripcion','Arroz a 15 días','monto',20000,'medio_pago','transferencia','estado','pendiente',
    'fecha', :'hoy','vencimiento', (:'hoy'::date + 15)::text,'proveedor_id', :'P2'),
  jsonb_build_array(jsonb_build_object('stock_id', :'ARR', 'cantidad', 10, 'precio_unitario', 2000))) ->> 'egreso_id') as eg_pend \gset
reset role;
select 's15|' || e.estado || '|' || e.vencimiento - :'hoy'::date || '|arroz ' || s.stock_actual from public.egresos e, public.stock s where e.id = :'eg_pend' and s.id = :'ARR';

\echo '== S16 si se borra el producto de Inventario, el renglón queda con su nombre'
reset role;
delete from public.stock where id = :'PAL';
select 's16|' || ci.nombre || '|' || (ci.stock_id is null) || '|' || ci.subtotal from public.compra_items ci join public.egresos e on e.id = ci.egreso_id where e.descripcion = 'Verdulería';

\echo '== S17 base sin el parámetro de cuenta (registrar_pago de 14 y editar_pago de 16)'
begin;
alter function public.registrar_pago(text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,uuid) rename to registrar_pago_con_cuenta;
create function public.registrar_pago(p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.registrar_pago_con_cuenta(p_categoria, p_descripcion, p_monto, p_medio_pago, p_estado, p_fecha, p_proveedor_id, p_empleado_id, p_subtipo, p_periodo, p_vencimiento, p_comprobante, p_notas, p_origen, null) $$;
grant execute on function public.registrar_pago(text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text) to authenticated;
alter function public.editar_pago(uuid,text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,text,uuid) rename to editar_pago_con_cuenta;
create function public.editar_pago(p_egreso_id uuid, p_categoria text, p_descripcion text, p_monto numeric, p_medio_pago text, p_estado text, p_fecha date, p_proveedor_id uuid, p_empleado_id uuid, p_subtipo text, p_periodo text, p_vencimiento date, p_comprobante text, p_notas text, p_origen text, p_motivo text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.editar_pago_con_cuenta(p_egreso_id, p_categoria, p_descripcion, p_monto, p_medio_pago, p_estado, p_fecha, p_proveedor_id, p_empleado_id, p_subtipo, p_periodo, p_vencimiento, p_comprobante, p_notas, p_origen, p_motivo, null) $$;
grant execute on function public.editar_pago(uuid,text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,text) to authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1','finanzas','fin@t');
set role authenticated;
select (public.registrar_compra(
  jsonb_build_object('categoria','mercaderia','descripcion','Base vieja','monto',4000,'medio_pago','transferencia','fecha', :'hoy','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'ARR', 'cantidad', 2, 'precio_unitario', 2000))) ->> 'egreso_id') as eg_v \gset
select public.editar_compra(:'eg_v',
  jsonb_build_object('categoria','mercaderia','descripcion','Base vieja','monto',6000,'medio_pago','transferencia','estado','pagado','fecha', :'hoy','origen','ninguno'),
  jsonb_build_array(jsonb_build_object('stock_id', :'ARR', 'cantidad', 3, 'precio_unitario', 2000)), 'eran 3') -> 'compra' ->> 'items';
reset role;
select 's17|' || e.monto || '|arroz ' || s.stock_actual from public.egresos e, public.stock s where e.id = :'eg_v' and s.id = :'ARR';
rollback;

\echo '== S18 el historial del pago sigue registrando (auditoría de egresos)'
select 's18|' || evento || '|' || coalesce(motivo, '-') from public.egresos_auditoria where egreso_id = :'eg1' order by created_at, evento;

\echo '== S19 dos movimientos del mismo producto en la misma transacción (misma hora): había y quedó no dependen del orden'
insert into public.stock (id, nombre, unidad, stock_actual, precio_unitario, tipo_stock) values
 ('c0000000-0000-0000-0000-000000000019','Queso crema','kg', 6, 5500, 'materia_prima');
select pg_temp.como('00000000-0000-0000-0000-0000000000a1','admin','admin@t');
begin;
set local role authenticated;
select public.registrar_movimiento_stock('c0000000-0000-0000-0000-000000000019', 'merma', 1, 'pote vencido');
select public.registrar_conteo_stock(jsonb_build_array(jsonb_build_object('stock_id', 'c0000000-0000-0000-0000-000000000019', 'contado', 4.2)), 'Conteo') -> 0 ->> 'diferencia';
commit;
select 's19 misma hora|' || count(distinct created_at) from public.stock_movimientos where stock_id = 'c0000000-0000-0000-0000-000000000019';
set role authenticated;
select 's19|ini ' || stock_inicial || '|merma ' || merma || '|falta ' || faltante || '|$falta ' || valor_faltante || '|fin ' || stock_final
  from public.stock_faltantes(:'hoy', :'hoy') where nombre = 'Queso crema';
reset role;
