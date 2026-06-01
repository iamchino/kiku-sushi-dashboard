-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Pedidos programados (delivery/takeaway con anticipación)
-- ════════════════════════════════════════════════════════════════════════════
--
-- La web ahora está siempre abierta para armar el pedido. En el checkout el
-- cliente elige:
--   • "Lo antes posible" (programado_para = NULL) → solo si el local está abierto AHORA.
--   • "Programar"        (programado_para = ts)   → para un día/hora futuro válido.
--
-- Reglas para programar:
--   • Anticipación mínima: 30 minutos.
--   • Ventana máxima: 3 días.
--   • El horario pedido tiene que caer dentro de atención:
--       Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00 (hora Argentina).
--
-- Requiere migraciones previas (pedidos, pg_net, webhook_config, wasender).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columna programado_para ─────────────────────────────────────────────
alter table public.pedidos
  add column if not exists programado_para timestamptz;

comment on column public.pedidos.programado_para is
  'Fecha/hora para la que el cliente programó el pedido. NULL = lo antes posible (inmediato).';

-- ─── 2. Validación de horario (ASAP vs programado) ──────────────────────────
create or replace function public.pedido_web_horario_check()
returns trigger
language plpgsql
as $$
declare
  v_ahora   timestamp := (now() at time zone 'America/Argentina/Buenos_Aires');
  v_target  timestamp;
  v_dow     int;
  v_t       time;
  v_abierto boolean;
begin
  if new.origen = 'web' and coalesce(new.canal, '') in ('delivery', 'takeaway') then

    if new.programado_para is null then
      -- Inmediato: se valida contra la hora actual.
      v_target := v_ahora;
    else
      -- Programado: anticipación 30 min, ventana 3 días.
      if new.programado_para < now() + interval '30 minutes' then
        raise exception 'Programá con al menos 30 minutos de anticipación.';
      end if;
      if new.programado_para > now() + interval '3 days' then
        raise exception 'Solo se puede programar hasta 3 días de anticipación.';
      end if;
      v_target := (new.programado_para at time zone 'America/Argentina/Buenos_Aires');
    end if;

    v_dow := extract(dow from v_target)::int;   -- 0=Dom .. 6=Sáb
    v_t   := v_target::time;
    v_abierto :=
         (v_dow in (2, 3, 4, 5, 6) and v_t >= time '19:30')
      or (v_dow in (6, 0)          and v_t <= time '01:00');

    if not v_abierto then
      if new.programado_para is null then
        raise exception 'Estamos cerrados ahora. Programá tu pedido (Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00).';
      else
        raise exception 'Ese horario está fuera de atención (Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00).';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedido_web_horario on public.pedidos;
create trigger trg_pedido_web_horario
  before insert on public.pedidos
  for each row execute function public.pedido_web_horario_check();

-- ─── 3. Webhook a WasenderAPI incluyendo la hora programada ─────────────────
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
  v_cuando   text;
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

    v_cuando := case
      when v_ped.programado_para is not null
        then '🕒 Programado: ' ||
             to_char(v_ped.programado_para at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' hs'
      else '🕒 Lo antes posible'
    end;

    v_mensaje :=
      v_emoji || ' *' || v_titulo || ' — Kiku Sushi*' || E'\n' ||
      '———————————————' || E'\n' ||
      '👤 ' || coalesce(v_ped.cliente_nombre, 'Sin nombre') || E'\n' ||
      '📞 ' || coalesce(v_ped.cliente_telefono, '—') || E'\n' ||
      case when v_canal = 'delivery' and v_ped.cliente_direccion is not null
           then '🏠 ' || v_ped.cliente_direccion || E'\n' else '' end ||
      v_cuando || E'\n' ||
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

drop trigger if exists trg_pedido_webhook_whatsapp on public.pedido_items;
create trigger trg_pedido_webhook_whatsapp
  after insert on public.pedido_items
  referencing new table as nuevos
  for each statement execute function public.pedido_webhook_whatsapp();

notify pgrst, 'reload schema';
