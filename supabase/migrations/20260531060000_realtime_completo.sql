-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Realtime completo para el dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- El dashboard YA se suscribe por realtime (usePedidos, useReservas y la
-- campanita useNotificaciones). Si igual hay que refrescar para ver un pedido
-- o reserva nuevos, es porque las tablas no están en la publicación
-- `supabase_realtime` (sin eso, Supabase no emite los eventos).
--
-- Esta migración asegura que TODAS las tablas que el dashboard escucha estén en
-- la publicación. Es idempotente (se puede correr varias veces sin romper nada).
--
-- Tablas:
--   • reservas              → lista de reservas en vivo
--   • pedidos, pedido_items → kanban de pedidos en vivo
--   • notificaciones        → campanita (la que faltaba)
--   • comprobantes_fiscales → estado de facturación en vivo
--   • stock                 → alertas de stock bajo
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'reservas',
    'pedidos',
    'pedido_items',
    'notificaciones',
    'comprobantes_fiscales',
    'stock'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    exception
      when duplicate_object then null;   -- ya estaba en la publicación
      when undefined_table  then null;   -- la tabla no existe en este entorno
    end;
  end loop;
end
$$;

-- ─── Verificación (corré esto en el SQL Editor para confirmar) ──────────────
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime'
--   order by tablename;
--
-- Tienen que aparecer al menos: reservas, pedidos, pedido_items, notificaciones.
