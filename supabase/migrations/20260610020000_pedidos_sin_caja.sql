-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Órdenes "ya cobradas / que no afectan caja"
-- ════════════════════════════════════════════════════════════════════════════
--
-- Permite cargar pedidos de delivery / take away que ya están cobrados (o que
-- por cualquier motivo no deben impactar el arqueo del turno) dejándolos
-- asentados con sus montos e items, sin generar movimientos de caja.
--
--   • afecta_caja = false  → el pedido NO se cuenta como "pedido sin pago" en el
--     arqueo y, como no se le registra un pago, tampoco suma al turno.
--   • medio_pago            → guarda cómo se pagó (solo como dato; también se
--     imprime en el ticket). No entra al arqueo.
--
-- La fecha real del pedido se maneja con la columna existente created_at
-- (el frontend la setea a la fecha elegida).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists afecta_caja boolean not null default true;

alter table public.pedidos
  add column if not exists medio_pago text;

comment on column public.pedidos.afecta_caja is
  'Si es false, el pedido está cobrado fuera de caja (no impacta el arqueo del turno '
  'ni se marca como pedido sin pago). Default true = operación normal.';
comment on column public.pedidos.medio_pago is
  'Medio de pago informado para el pedido (efectivo/transferencia/tarjeta_*). '
  'Solo dato/impresión; el arqueo se calcula desde la tabla pagos.';

notify pgrst, 'reload schema';
