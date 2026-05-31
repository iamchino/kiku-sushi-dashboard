-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Webhook automático de pedido web (delivery/takeaway) → WhatsApp
-- ════════════════════════════════════════════════════════════════════════════
--
-- Igual que el de reservas, pero para los pedidos que entran desde la página.
-- Cuando un cliente confirma un pedido delivery/takeaway en la web, además de la
-- notificación realtime al dashboard, se dispara un POST al MISMO webhook no-code
-- (Make/n8n/Zapier) que manda el WhatsApp a Kiku con el detalle del pedido.
--
-- ─── Por qué el trigger va sobre `pedido_items` y no sobre `pedidos` ─────────
-- La web hace dos llamadas: primero inserta la fila en `pedidos`, y DESPUÉS
-- inserta los items en `pedido_items`. Si disparáramos el webhook al insertar el
-- pedido, todavía no existirían los items (el WhatsApp saldría sin saber qué
-- pidió el cliente). Por eso el trigger se dispara cuando entran los items, ya
-- con el pedido creado, y arma el mensaje completo (cliente + items + total).
--
-- Usa una "transition table" (REFERENCING NEW TABLE) + FOR EACH STATEMENT para
-- dispararse UNA sola vez por pedido (no una vez por item).
--
-- Solo envía cuando el pedido tiene origen='web'. Los pedidos cargados desde el
-- dashboard (origen='dashboard') no disparan nada.
--
-- Requiere la migración 20260531000000 (crea pg_net y webhook_config).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columna `origen` en pedidos ─────────────────────────────────────────
-- Distingue el pedido de la web del cargado a mano en el dashboard.
alter table public.pedidos
  add column if not exists origen text not null default 'dashboard';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_origen_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_origen_check
      check (origen in ('web', 'dashboard', 'telefono', 'whatsapp', 'pedidosya', 'rappi'));
  end if;
end$$;

comment on column public.pedidos.origen is
  'De dónde entró el pedido: web (página pública) | dashboard | telefono | whatsapp | pedidosya | rappi. La web manda origen=web y eso dispara el webhook de WhatsApp.';

create index if not exists idx_pedidos_origen
  on public.pedidos(origen);

-- ─── 2. Función del trigger: arma payload + POST al webhook ─────────────────
create or replace function public.pedido_webhook_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url      text;
  v_destino  text;
  v_activo   boolean;
  r          record;   -- itera sobre los pedido_id de este lote de items
  v_ped      record;   -- la fila de pedidos
  v_items    text;
  v_canal    text;
  v_titulo   text;
  v_emoji    text;
  v_mensaje  text;
  v_payload  jsonb;
begin
  -- Config del webhook (fila única).
  select webhook_url, whatsapp_destino, activo
    into v_url, v_destino, v_activo
  from public.webhook_config
  where id = true;

  -- Sin URL o desactivado → no-op seguro.
  if v_url is null or btrim(v_url) = '' or coalesce(v_activo, false) = false then
    return null;
  end if;

  -- Recorremos los pedidos afectados por este INSERT de items (normalmente 1).
  for r in select distinct pedido_id from nuevos loop

    select * into v_ped from public.pedidos where id = r.pedido_id;

    -- Solo pedidos de la web. Los del dashboard se ignoran.
    if v_ped.id is null or coalesce(v_ped.origen, 'dashboard') <> 'web' then
      continue;
    end if;

    -- Detalle de items del pedido (ya están todos insertados en este punto).
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

    -- ─── Mensaje de WhatsApp ya formateado ──────────────────────────────────
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

    -- ─── Payload estructurado ───────────────────────────────────────────────
    v_payload := jsonb_build_object(
      'evento',            'pedido_nuevo_web',
      'destino',           v_destino,
      'pedido_id',         v_ped.id,
      'numero',            v_ped.numero,
      'canal',             v_ped.canal,
      'total',             v_ped.total,
      'cliente_nombre',    v_ped.cliente_nombre,
      'cliente_telefono',  v_ped.cliente_telefono,
      'cliente_direccion', v_ped.cliente_direccion,
      'notas',             v_ped.notas,
      'items_texto',       v_items,
      'mensaje_whatsapp',  v_mensaje
    );

    -- POST al webhook. Si falla, NO rompemos el pedido (ya está guardado).
    begin
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := v_payload
      );
    exception when others then
      raise warning '[pedido_webhook_whatsapp] no se pudo enviar el webhook: %', sqlerrm;
    end;

  end loop;

  return null;  -- trigger AFTER ... FOR EACH STATEMENT
end;
$$;

-- ─── 3. Trigger AFTER INSERT en pedido_items (statement-level + transition) ──
drop trigger if exists trg_pedido_webhook_whatsapp on public.pedido_items;
create trigger trg_pedido_webhook_whatsapp
  after insert on public.pedido_items
  referencing new table as nuevos
  for each statement
  execute function public.pedido_webhook_whatsapp();

-- ─── 4. Reload schema (PostgREST) ───────────────────────────────────────────
notify pgrst, 'reload schema';
