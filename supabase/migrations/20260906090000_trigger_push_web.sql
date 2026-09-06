-- ────────────────────────────────────────────────────────────────────────────
-- Dispara la edge function `push-web` desde la propia tabla `pedidos`.
--
-- Reemplaza al "Database Webhook" del dashboard de Supabase. Hace lo mismo
-- (webhooks = un trigger que llama a net.http_post), pero sin depender de la
-- integración `supabase_functions`, que en este proyecto no está habilitada.
--
-- Ventaja extra: acá filtramos en SQL, así que la función solo se llama cuando
-- realmente hay algo que notificar — no en cada UPDATE de un pedido.
--
--   INSERT                    → 🔥 Nuevo pedido      (cocina)
--   UPDATE estado → 'listo'   → 🍣 Listo para servir (mozo)
--
-- pg_net es asíncrono: el llamado HTTP se encola y NO demora el guardado del
-- pedido. Si la función falla, el pedido se crea igual.
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create or replace function public.notificar_push_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions, pg_temp
as $$
declare
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  if tg_op = 'INSERT' then
    perform net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'type',       'INSERT',
        'table',      'pedidos',
        'record',     to_jsonb(new),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );

  elsif tg_op = 'UPDATE'
        and new.estado = 'listo'
        and old.estado is distinct from 'listo' then
    perform net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'type',       'UPDATE',
        'table',      'pedidos',
        'record',     to_jsonb(new),
        'old_record', to_jsonb(old)
      ),
      timeout_milliseconds := 5000
    );
  end if;

  return null;  -- trigger AFTER: el valor de retorno se ignora
end;
$$;

drop trigger if exists trg_push_pedidos on public.pedidos;
create trigger trg_push_pedidos
  after insert or update on public.pedidos
  for each row
  execute function public.notificar_push_pedido();

comment on function public.notificar_push_pedido() is
  'Llama a la edge function push-web cuando entra un pedido o pasa a listo. Reemplaza al Database Webhook.';
