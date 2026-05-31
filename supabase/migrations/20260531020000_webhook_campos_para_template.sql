-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Campos de una sola línea para la plantilla de WhatsApp
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las plantillas (templates) de WhatsApp Cloud API NO permiten saltos de línea,
-- tabs ni más de 4 espacios seguidos dentro del valor de una variable {{n}}.
-- Por eso el campo `mensaje_whatsapp` (multilínea) no se puede usar como variable
-- de plantilla.
--
-- Esta migración agrega al payload de ambos webhooks dos campos en UNA sola línea,
-- pensados para mapearse directo a las variables de la plantilla:
--   • tipo_aviso → "reserva" | "pedido DELIVERY" | "pedido TAKEAWAY"
--   • resumen    → todo el detalle en una línea (personas/fecha/hora o items/total)
--
-- Se mantiene `mensaje_whatsapp` por si se usa en Telegram o para debug.
-- Requiere las migraciones 20260531000000 y 20260531010000.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Reservas: agrega tipo_aviso + resumen ───────────────────────────────
create or replace function public.reserva_webhook_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url          text;
  v_destino      text;
  v_activo       boolean;
  v_tipo_label   text;
  v_codigo       text;
  v_fecha_txt    text;
  v_hora_txt     text;
  v_orden_lleg   boolean;
  v_resumen      text;
  v_mensaje      text;
  v_payload      jsonb;
begin
  if new.origen <> 'web' then
    return new;
  end if;

  select webhook_url, whatsapp_destino, activo
    into v_url, v_destino, v_activo
  from public.webhook_config
  where id = true;

  if v_url is null or btrim(v_url) = '' or coalesce(v_activo, false) = false then
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

  -- Resumen en UNA línea para la variable de la plantilla.
  v_resumen :=
    new.personas || (case when new.personas = 1 then ' persona' else ' personas' end)
    || ' · ' || v_fecha_txt || ' ' || v_hora_txt
    || coalesce(' · ' || v_tipo_label, '')
    || case when v_orden_lleg then ' · por orden de llegada' else '' end
    || ' · cod #' || v_codigo;

  -- Mensaje multilínea (para Telegram / debug).
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

  v_payload := jsonb_build_object(
    'evento',           'reserva_nueva_web',
    'tipo_aviso',       'reserva',
    'resumen',          v_resumen,
    'destino',          v_destino,
    'reserva_id',       new.id,
    'codigo',           v_codigo,
    'fecha',            new.fecha,
    'fecha_txt',        v_fecha_txt,
    'hora',             to_char(new.hora, 'HH24:MI'),
    'personas',         new.personas,
    'tipo_experiencia', new.tipo_experiencia,
    'tipo_label',       v_tipo_label,
    'orden_llegada',    v_orden_lleg,
    'cliente_nombre',   new.cliente_nombre,
    'cliente_telefono', new.cliente_telefono,
    'cliente_email',    new.cliente_email,
    'restricciones',    new.restricciones,
    'accesibilidad',    new.accesibilidad,
    'notas',            new.notas,
    'estado',           new.estado,
    'creada_at',        new.created_at,
    'mensaje_whatsapp', v_mensaje
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := v_payload
    );
  exception when others then
    raise warning '[reserva_webhook_whatsapp] no se pudo enviar el webhook: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ─── 2. Pedidos: agrega tipo_aviso + resumen ────────────────────────────────
create or replace function public.pedido_webhook_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url           text;
  v_destino       text;
  v_activo        boolean;
  r               record;
  v_ped           record;
  v_items         text;
  v_items_inline  text;
  v_canal         text;
  v_titulo        text;
  v_emoji         text;
  v_tipo_aviso    text;
  v_resumen       text;
  v_mensaje       text;
  v_payload       jsonb;
begin
  select webhook_url, whatsapp_destino, activo
    into v_url, v_destino, v_activo
  from public.webhook_config
  where id = true;

  if v_url is null or btrim(v_url) = '' or coalesce(v_activo, false) = false then
    return null;
  end if;

  for r in select distinct pedido_id from nuevos loop

    select * into v_ped from public.pedidos where id = r.pedido_id;

    if v_ped.id is null or coalesce(v_ped.origen, 'dashboard') <> 'web' then
      continue;
    end if;

    -- Items multilínea (para mensaje_whatsapp).
    select string_agg(
             '• ' || coalesce(cantidad, 1) || 'x ' || nombre ||
             ' — $' || round(coalesce(precio_unitario, 0))::bigint::text,
             E'\n' order by nombre)
      into v_items
    from public.pedido_items
    where pedido_id = v_ped.id;

    -- Items en UNA línea (para la variable de la plantilla).
    select string_agg(coalesce(cantidad, 1) || 'x ' || nombre, ', ' order by nombre)
      into v_items_inline
    from public.pedido_items
    where pedido_id = v_ped.id;

    v_canal := coalesce(v_ped.canal, 'pedido');
    v_emoji := case v_canal when 'delivery' then '🛵' when 'takeaway' then '🛍️' else '🔔' end;
    v_titulo := case v_canal
      when 'delivery' then 'Nuevo pedido DELIVERY'
      when 'takeaway' then 'Nuevo pedido TAKEAWAY'
      else 'Nuevo pedido'
    end;

    v_tipo_aviso := case v_canal
      when 'delivery' then 'pedido DELIVERY'
      when 'takeaway' then 'pedido TAKEAWAY'
      else 'pedido'
    end;

    -- Resumen en UNA línea para la variable de la plantilla.
    v_resumen :=
      coalesce(v_items_inline, '(sin items)')
      || ' · Total $' || round(coalesce(v_ped.total, 0))::bigint::text
      || case when v_canal = 'delivery' then ' (incluye envío)' else '' end
      || coalesce(' · #' || v_ped.numero::text, '')
      || case when v_canal = 'delivery' and v_ped.cliente_direccion is not null
              then ' · ' || v_ped.cliente_direccion else '' end;

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

    v_payload := jsonb_build_object(
      'evento',            'pedido_nuevo_web',
      'tipo_aviso',        v_tipo_aviso,
      'resumen',           v_resumen,
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
      'items_inline',      v_items_inline,
      'mensaje_whatsapp',  v_mensaje
    );

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

  return null;
end;
$$;

notify pgrst, 'reload schema';
