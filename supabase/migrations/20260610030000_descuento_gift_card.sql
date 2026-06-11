-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Descuentos tipo "gift card" (monto o %, total o ítems elegidos)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Amplía el descuento del pedido para soportar:
--   • descuento_tipo    : 'porcentaje' | 'monto'  (gift card = monto fijo)
--   • descuento_valor   : el valor cargado (el % o los $)
--   • descuento_alcance : 'todo' | 'seleccion'    (todo el pedido o ítems elegidos)
--   • descuento_monto   : el descuento YA CALCULADO en $ (fuente de verdad del total)
--   • descuento_items   : ids de los pedido_items a los que aplica (para re-editar)
--
-- El total del pedido se sigue guardando en pedidos.total (= subtotal - descuento_monto),
-- así la facturación y el arqueo no cambian. La columna vieja descuento_porcentaje
-- se mantiene por compatibilidad (se setea cuando el descuento es % sobre todo).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists descuento_tipo text not null default 'porcentaje'
    check (descuento_tipo in ('porcentaje', 'monto'));

alter table public.pedidos
  add column if not exists descuento_valor numeric(12,2) not null default 0;

alter table public.pedidos
  add column if not exists descuento_alcance text not null default 'todo'
    check (descuento_alcance in ('todo', 'seleccion'));

alter table public.pedidos
  add column if not exists descuento_monto numeric(12,2);

alter table public.pedidos
  add column if not exists descuento_items jsonb not null default '[]'::jsonb;

comment on column public.pedidos.descuento_tipo is
  'Tipo de descuento: porcentaje o monto fijo (gift card).';
comment on column public.pedidos.descuento_alcance is
  'Alcance: todo el pedido o una selección de ítems (ej. solo comida o solo bebida).';
comment on column public.pedidos.descuento_monto is
  'Descuento ya calculado en $. Si está set, manda sobre descuento_porcentaje para el total.';
comment on column public.pedidos.descuento_items is
  'Array de ids de pedido_items a los que aplica el descuento (cuando el alcance es selección).';

notify pgrst, 'reload schema';
