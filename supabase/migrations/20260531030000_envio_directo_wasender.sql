-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Envío directo a WasenderAPI (sin Make)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Antes el trigger posteaba a un webhook de Make, que reenviaba a WhatsApp.
-- Ahora Supabase llama DIRECTO a WasenderAPI (con pg_net), sacando Make del medio.
--
-- También RECREA los dos triggers (reservas y pedido_items) para garantizar que
-- ambos existan — el de reservas se había perdido por un truncado en una
-- migración anterior (de ahí que el pedido avisaba y la reserva no).
--
-- Después de aplicar, cargar la API key de WasenderAPI:
--   update public.webhook_config
--      set wasender_api_key = 'TU_API_KEY',
--          whatsapp_destino = '5493415051750',
--          activo           = true;
--
-- Requiere las migraciones previas (pg_net + webhook_config).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Config: URL y API key de WasenderAPI ────────────────────────────────
alter table public.webhook_config
  add column if not exists wasender_api_url text default 'https://www.wasenderapi.com/api/send-message';
alter table public.webhook_config
  add column if not exists wasender_api_key text;

comment on column public.webhook_config.wasender_api_key is
  'Token (Bearer) de WasenderAPI. Lo usa el trigger para enviar el WhatsApp directo. Sin "Bearer ", solo el token.';

-- ─── 2. Reservas → WasenderAPI ──────────────────────────────────────────────
create or replace function public.reserva_webhook_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_api_url     text;
  v_api_key     text;
  v_destino     text;
  v_activo      boolean;
  v_to          text;
  v_tipo_label  text;
  v_codigo      text;
  v_fecha_txt   text;
  v_hora_txt    text;
  v_orden_lleg  boolean;
  v_mensaje     text;
begin
  if new.origen <> 'web' then
    return new;
  end if;

  select wasender_api_url, wasender_api_key, whatsapp_destino, activo
    into v_api_url, v_api_key, v_destino, v_activo
  from public.webhook_config
  where id = true;

  if coalesce(v_activo, false) = false
     or v_api_url is null or btrim(v_api_url) = ''
     or v_api_key is null or btrim(v_api_key) = ''
     or v_destino is null or btrim(v_destino) = '' then
    return new;
  end if;

  v_tipo_label := case new.tipo_experiencia
    when 'omakase'              then 'Omakase'
    when 'umami_del_sur'        then 'Umami del Sur'
    when 'pacifico_y_patagonia' then 'Pacífico y Patagonia'
    when 'kiku_libre'           then 'Kiku Libre'
    when 'carta_abierta'        then 'Carta abierta'
    else null
  end;

  v_codigo    := upper(substring(new.id::text, 1, 8));
  v_fecha_txt := to_char(new.fecha, 'DD/MM/YYYY');
  v_hora_txt  := to_char(new.hora, 'HH24:MI');
  v_orden_lleg := to_char(new.hora, 'HH24:MI') in ('22:30', '23:00');

  v_mensaje :=
    '🍣 *Nueva reserva web — Kiku Sushi*' || E'\n' ||
    '———————————————' || E'\n' ||
    '👤 ' || coalesce(new.cliente_nombre, 'Sin nombre') || E'\n' ||
    '📞 ' || coalesce(new.cliente_telefono, '—') || E'\n' ||
    case when new.cliente_email is not null then '📧 ' || new.cliente_email || E'\n' else '' end ||
    '📅 ' || v_fecha_txt || '   🕐 ' || v_hora_txt || E'\n' ||
    '👥 ' || new.personas || (case when new.personas = 1 then ' persona' else ' personas' end) || E'\n' ||
    case when v_tipo_label is not null then '✨ ' || v_tipo_label || E'\n' else '' end ||
    case when v_orden_lleg then '⏱️ Por orden de llegada (sin mesa fija)' || E'\n' else '' end ||
    case when new.restricciones is not null then '🥗 Restricciones: ' || new.restricciones || E'\n' else '' end ||
    case when new.accesibilidad is not null then '♿ Accesibilidad: ' || new.accesibilidad || E'\n' else '' end ||
    case when new.notas is not null then '📝 Notas: ' || new.notas || E'\n' else '' end ||
    '———————————————' || E'\n' ||
    '🎫 Código #' || v_codigo;

  v_to := case when v_destino like '+%' then v_destino else '+' || v_destino end;

  begin
    perform net.http_post(
      url     := v_api_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || v_api_key
                 ),
      body    := jsonb_build_object('to', v_to, 'text', v_mensaje)
    );
  exception when others then
    raise warning '[reserva_webhook_whatsapp] no se pudo enviar: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ─── 3. Pedidos → WasenderAPI ───────────────────────────────────────────────
create or replace function public.pedido_webhook_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_api_url  text;
  v_api_key  text;
  v_destino  text;
  v_activo   boolean;
  v_to       text;
  r          record;
  v_ped      record;
  v_items    text;
  v_canal    text;
  v_titulo   text;
  v_emoji    text;
  v_mensaje  text;
begin
  select wasender_api_url, wasender_api_key, whatsapp_destino, activo
    into v_api_url, v_api_key, v_destino, v_activo
  from public.webhook_config
  where id = true;

  if coalesce(v_activo, false) = false
     or v_api_url is null or btrim(v_api_url) = ''
     or v_api_key is null or btrim(v_api_key) = ''
     or v_destino is null or btrim(v_destino) = '' then
    return null;
  end if;

  v_to := case when v_destino like '+%' then v_destino else '+' || v_destino end;

  for r in select distinct pedido_id from nuevos loop

    select * into v_ped from public.pedidos where id = r.pedido_id;

    if v_ped.id is null or coalesce(v_ped.origen, 'dashboard') <> 'web' then
      continue;
    end if;

    select string_agg(
             '• ' || coalesce(cantidad, 1) || 'x ' || nombre ||
             ' — $' || round(coalesce(precio_unitario, 0))::bigint::text,
             E'\n' order by nombre)
      into v_items
    from public.pedido_items
    where pedido_id = v_ped.id;

    v_canal := coalesce(v_ped.canal, 'pedido');
    v_emoji := case v_canal when 'delivery' then '🛵' when 'takeaway' then '🛍️' else '🔔' end;
    v_titulo := case v_canal
      when 'delivery' then 'Nuevo pedido DELIVERY'
      when 'takeaway' then 'Nuevo pedido TAKEAWAY'
      else 'Nuevo pedido'
    end;

    v_mensaje :=
      v_emoji || ' *' || v_titulo || ' — Kiku Sushi*' || E'\n' ||
      '———————————————' || E'\n' ||
      '👤 ' || coalesce(v_ped.cliente_nombre, 'Sin nombre') || E'\n' ||
      '📞 ' || coalesce(v_ped.cliente_telefono, '—') || E'\n' ||
      case when v_canal = 'delivery' and v_ped.cliente_direccion is not null
           then '🏠 ' || v_ped.cliente_direccion || E'\n' else '' end ||
      '———————————————' || E'\n' ||
      case when v_ped.numero is not null then '🧾 Pedido #' || v_ped.numero || E'\n' else '' end ||
      coalesce(v_items, '(sin items)') || E'\n' ||
      '———————————————' || E'\n' ||
      '💰 Total: $' || round(coalesce(v_ped.total, 0))::bigint::text ||
        case when v_canal = 'delivery' then ' (incluye envío)' else '' end || E'\n' ||
      case when v_ped.notas is not null then '📝 Notas: ' || v_ped.notas || E'\n' else '' end ||
      '👉 Preparar y coordinar con el cliente.';

    begin
      perform net.http_post(
        url     := v_api_url,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_api_key
                   ),
        body    := jsonb_build_object('to', v_to, 'text', v_mensaje)
      );
    exception when others then
      raise warning '[pedido_webhook_whatsapp] no se pudo enviar: %', sqlerrm;
    end;

  end loop;

  return null;
end;
$$;

-- ─── 4. Recrear AMBOS triggers (garantiza que el de reservas exista) ────────
drop trigger if exists trg_reserva_webhook_whatsapp on public.reservas;
create trigger trg_reserva_webhook_whatsapp
  after insert on public.reservas
  for each row execute function public.reserva_webhook_whatsapp();

drop trigger if exists trg_pedido_webhook_whatsapp on public.pedido_items;
create trigger trg_pedido_webhook_whatsapp
  after insert on public.pedido_items
  referencing new table as nuevos
  for each statement execute function public.pedido_webhook_whatsapp();

notify pgrst, 'reload schema';
