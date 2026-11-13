-- ════════════════════════════════════════════════════════════════════════════
-- 56a — Diagnóstico de stock (SOLO LECTURA, no cambia nada). Se puede correr
-- antes o después del 56. Sirve para saber con qué datos arranca el reporte de
-- faltantes y la carga de boletas con productos.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) ¿Está aplicado el SQL 56? (t = sí)
select to_regclass('public.compra_items') is not null as sql_56_aplicado;

-- 2) Materia prima sin precio de costo: esos productos van a figurar en el
--    reporte de faltantes en unidades, sin sumar pesos, hasta que entren en
--    una boleta o se les cargue el precio en Inventario.
select count(*) filter (where coalesce(precio_unitario, 0) = 0) as materia_prima_sin_precio,
       count(*) as materia_prima_total
  from public.stock
 where coalesce(tipo_stock, 'materia_prima') = 'materia_prima';

select nombre, unidad, stock_actual
  from public.stock
 where coalesce(tipo_stock, 'materia_prima') = 'materia_prima'
   and coalesce(precio_unitario, 0) = 0
 order by nombre
 limit 50;

-- 3) Productos con stock negativo: se vendió o se produjo sin haber cargado la
--    compra. Conviene contarlos (Inventario → Contar) antes de mirar faltantes.
select nombre, unidad, stock_actual
  from public.stock
 where stock_actual < 0
 order by stock_actual
 limit 50;

-- 4) Qué proveedor anotado en Inventario coincide con un proveedor cargado:
--    esos productos van a aparecer como "habituales" desde la primera boleta.
select p.razon_social as proveedor, count(s.id) as productos_que_lo_nombran
  from public.proveedores p
  left join public.stock s on lower(trim(coalesce(s.proveedor, ''))) = lower(trim(p.razon_social))
 group by p.razon_social
 order by 2 desc, 1;

-- 5) Proveedores escritos en Inventario que NO coinciden con ninguno cargado
--    (otro nombre, un error de tipeo): no rompen nada, solo no se sugieren.
select trim(s.proveedor) as proveedor_en_inventario, count(*) as productos
  from public.stock s
 where coalesce(trim(s.proveedor), '') <> ''
   and not exists (select 1 from public.proveedores p where lower(trim(p.razon_social)) = lower(trim(s.proveedor)))
 group by 1
 order by 2 desc, 1
 limit 50;

-- 6) Movimientos de stock de los últimos 30 días, por tipo.
select tipo, count(*) as movimientos
  from public.stock_movimientos
 where created_at >= now() - interval '30 days'
 group by tipo
 order by 2 desc;
