-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Costo de envío en pedidos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Agrega el costo de envío al pedido. Se SUMA al total (pedidos.total ya queda
-- = subtotal - descuento + costo_envio), por lo que la facturación fiscal lo
-- toma incluido (importe_total = pedidos.total, con su IVA correspondiente) y
-- el arqueo de caja también. Se muestra como línea aparte en el ticket cliente
-- y en el comprobante fiscal.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists costo_envio numeric(12,2) not null default 0;

comment on column public.pedidos.costo_envio is
  'Costo de envío del pedido (delivery). Ya está sumado dentro de pedidos.total.';

notify pgrst, 'reload schema';
