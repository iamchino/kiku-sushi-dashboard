-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Habilitar Realtime en las tablas que dispara el dashboard
-- ════════════════════════════════════════════════════════════════════════════
--
-- Por defecto Supabase NO incluye automáticamente las tablas creadas vía SQL
-- custom en la publication `supabase_realtime`. Esto es necesario para que el
-- hook `useNotificaciones` reciba los eventos INSERT/UPDATE.
--
-- Esta migración es idempotente: ignora errores si la tabla ya está agregada.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  -- reservas (origen del bug que dispara este parche)
  begin
    alter publication supabase_realtime add table public.reservas;
  exception when duplicate_object then null;
  end;

  -- pedidos (notif de nuevo pedido + cambios de estado)
  begin
    alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null;
  end;

  -- stock (alertas de stock bajo)
  begin
    alter publication supabase_realtime add table public.stock;
  exception when duplicate_object then null;
  end;

  -- pedido_items (por si en el futuro se quiere notif de items nuevos en mesa)
  begin
    alter publication supabase_realtime add table public.pedido_items;
  exception when duplicate_object then null;
  end;
end
$$;

-- Verificación rápida (corré esto manualmente después para confirmar):
--   select schemaname, tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' order by tablename;
