-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Pago dividido (varios medios por pedido)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora había un solo pago por pedido (índice único pagos_pedido_uid).
-- Para poder dividir el pago de una mesa / orden en varios medios (ej. parte
-- en efectivo y parte con tarjeta), permitimos varias filas de `pagos` por
-- pedido. El arqueo ya suma por medio_pago, así que el desglose se refleja solo.
--
-- Al re-cobrar un pedido, el frontend borra los pagos previos e inserta los
-- nuevos, así que no quedan duplicados.
-- ════════════════════════════════════════════════════════════════════════════

drop index if exists public.pagos_pedido_uid;

-- Índice no único para buscar/borrar los pagos de un pedido rápido.
create index if not exists pagos_pedido_idx
  on public.pagos (pedido_id);

notify pgrst, 'reload schema';
