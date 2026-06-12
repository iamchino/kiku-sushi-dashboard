-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Productos solo de salón + contador de rondas Kiku libre
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) menu_items.solo_salon
--    Permite que un producto (ej. "Cubierto" o "Kiku libre") esté DISPONIBLE
--    para el admin en mesas / órdenes aunque NO sea visible en la carta web
--    pública. La web pública filtra por `activo`; el salón muestra los items
--    con `activo = true` O `solo_salon = true`.
--    Para tener un producto oculto en la web pero usable en mesa:
--      activo = false  +  solo_salon = true
--
-- 2) pedidos.kiku_libre_rondas
--    Contador interno (total de la mesa) de cuántas veces repitieron en un
--    pedido de Kiku libre. No afecta el total; es solo control + comanda.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.menu_items
  add column if not exists solo_salon boolean not null default false;

comment on column public.menu_items.solo_salon is
  'Si es true, el producto se ofrece en salón/mesas (admin) aunque esté oculto en '
  'la carta web pública (que filtra por activo). Útil para cubierto / Kiku libre.';

alter table public.pedidos
  add column if not exists kiku_libre_rondas integer not null default 0
    check (kiku_libre_rondas >= 0);

comment on column public.pedidos.kiku_libre_rondas is
  'Contador interno de repeticiones (rondas) de Kiku libre para la mesa. '
  'No afecta el total; se imprime en comanda por ronda.';

notify pgrst, 'reload schema';
