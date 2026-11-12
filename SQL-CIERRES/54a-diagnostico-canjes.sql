-- ════════════════════════════════════════════════════════════════════════════
-- 54a — DIAGNÓSTICO previo a las cuentas corrientes (solo lectura, opcional).
-- No cambia nada. Sirve para dos cosas:
--   A) confirmar que el 54 se puede correr sin sorpresas;
--   B) encontrar los canjes que ya se cerraron con 100 % de descuento, para
--      cargarlos como consumo en Dinero → Cuentas corrientes → Agregar consumo.
-- ════════════════════════════════════════════════════════════════════════════

-- A) Medios de pago que hay hoy en `pagos`. Esperado: solo efectivo,
--    transferencia, tarjeta_credito y tarjeta_debito (el 54 suma
--    cuenta_corriente al check y no toca ninguna fila).
select medio_pago, count(*) as pagos, sum(monto) as total
  from public.pagos
 group by medio_pago
 order by 2 desc;

-- B) Pedidos de los últimos 12 meses cerrados con descuento total (quedaron en
--    $0): casi seguro son canjes o invitaciones. `valor_real` es lo que
--    hubieran pagado: ese es el monto a cargar como consumo.
select (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
       p.numero                                   as pedido,
       coalesce('Mesa ' || nullif(btrim(p.mesa), ''), p.canal) as donde,
       p.cliente_nombre,
       p.descuento_porcentaje,
       p.descuento_detalle,
       (select sum(i.cantidad * i.precio_unitario) from public.pedido_items i where i.pedido_id = p.id) as valor_real,
       p.total
  from public.pedidos p
 where p.estado <> 'cancelado'
   and p.created_at >= now() - interval '12 months'
   and (p.descuento_porcentaje >= 100 or (coalesce(p.total, 0) = 0 and coalesce(p.descuento_monto, 0) > 0))
 order by p.created_at desc
 limit 200;
