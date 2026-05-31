-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Webhook automático de reserva web → WhatsApp a Kiku
-- ════════════════════════════════════════════════════════════════════════════
--
-- Objetivo:
--   Cuando entra una reserva desde la página (origen='web'), además de la
--   notificación realtime al dashboard, se dispara AUTOMÁTICAMENTE un POST a un
--   webhook externo (Make / n8n / Zapier). Esa automatización es la que envía el
--   WhatsApp al número de Kiku, sin que el cliente tenga que mandar nada a mano.
--
-- Diseño:
--   1. Tabla `webhook_config` (una sola fila) guarda:
--        • webhook_url       → URL del webhook no-code (Make / n8n / Zapier).
--        • whatsapp_destino  → número de WhatsApp que recibe el aviso (Kiku).
--        • activo            → permite apagar el envío sin borrar nada.
--      La MISMA URL sirve para reservas y para pedidos; cada payload trae un
--      campo `evento` para distinguirlos. Se cambia todo por SQL, sin redeploy.
--   2. Extensión `pg_net` para hacer el HTTP POST desde Postgres (es la misma
--      que usan los Database Webhooks de Supabase por debajo).
--   3. Trigger AFTER INSERT en `reservas` (solo origen='web') que arma un payload
--      JSON estructurado + un campo `mensaje_whatsapp` ya formateado, y lo postea.
--   4. Todo el envío está envuelto en EXCEPTION: si el webhook falla, la reserva
--      igual se guarda y la notificación al dashboard igual ocurre. Nunca bloquea.
--
-- Para activarlo, después de aplicar la migración, cargar la URL del webhook:
--   update public.webhook_config
--      set webhook_url      = 'https://hook.eu2.make.com/xxxx',
--          whatsapp_destino = '5431501750';   -- número de prueba (cambiar al real)
-- (o el endpoint que te dé n8n / Zapier). Mientras webhook_url esté en NULL, no
-- se envía nada.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extensión pg_net (HTTP desde Postgres) ──────────────────────────────
-- pg_net crea su propio esquema `net` (no es reubicable). En Supabase suele
-- venir preinstalada; este create es idempotente.
create extension if not exists pg_net;

-- ─── 2. Tabla de configuración de webhooks (fila única) ─────────────────────
create table if not exists public.webhook_config (
  -- id boolean fijo en true → garantiza una sola fila (patrón singleton).
  id               boolean primary key default true check (id),
  -- URL del webhook de la automatización no-code (Make / n8n / Zapier).
  -- Sirve para reservas y pedidos (se distingue por el campo `evento`).
  webhook_url      text,
  -- Número de WhatsApp que recibe los avisos (Kiku). Se manda en el payload
  -- como `destino` para que la automatización sepa a quién escribir.
  -- Por defecto un número de PRUEBA: cambialo al real para producción.
  whatsapp_destino text default '5431501750',
  -- Permite apagar el envío sin borrar la URL.
  activo           boolean not null default true,
  updated_at       timestamptz not null default now()
);

comment on table public.webhook_config is
  'Config singleton para webhooks salientes. webhook_url apunta a la automatización no-code (Make/n8n/Zapier) que envía el WhatsApp a whatsapp_destino al entrar una reserva o un pedido desde la web.';

-- Sembramos la fila única (sin URL todavía → no envía hasta que la cargues).
insert into public.webhook_config (id) values (true)
on conflict (id) do nothing;

-- updated_at automático (reusa set_updated_at si existe; si no, lo crea).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'webhook_config_set_updated_at'
  ) then
    create trigger webhook_config_set_updated_at
      before update on public.webhook_config
      for each row execute function public.set_updated_at();
  end if;
exception when undefined_function then
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $func$
  begin
    new.updated_at := now();
    return new;
  end;
  $func$;
  create trigger webhook_config_set_updated_at
    before update on public.webhook_config
    for each row execute function public.set_updated_at();
end;
$$;

-- ─── 3. RLS: lectura para autenticados, escritura solo service_role/admin ───
alter table public.webhook_config enable row level security;

drop policy if exists webhook_config_select on public.webhook_config;
create policy webhook_config_select on public.webhook_config
  for select to authenticated using (true);

-- La escritura queda para el service_role (dashboard admin / SQL editor).
-- No exponemos write a anon: la URL del webhook no debe poder cambiarse desde la web.
drop policy if exists webhook_config_write on public.webhook_config;
create policy webhook_config_write on public.webhook_config
  for all to service_role using (true) with check (true);

-- ─── 4. Función del trigger: arma payload + POST al webhook ─────────────────
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
  v_mensaje      text;
  v_payload      jsonb;
begin
  -- Solo reservas que entran por la página.
  if new.origen <> 'web' then
    return new;
  end if;

  -- Leemos la config del webhook (fila única).
  select webhook_url, whatsapp_destino, activo
    into v_url, v_destino, v_activo
  from public.webhook_config
  where id = true;

  -- Si no hay URL o está desactivado, no hacemos nada (no-op seguro).
  if v_url is null or btrim(v_url) = '' or coalesce(v_activo, false) = false then
    return new;
  end if;

  -- Label legible de la experiencia.
  v_tipo_label := case new.tipo_experiencia
    when 'omakase'              then 'Omakase'
    when 'umami_del_sur'        then 'Umami del Sur'
    when 'pacifico_y_patagonia' then 'Pacífico y Patagonia'
    when 'kiku_libre'           then 'Kiku Libre'
    when 'carta_abierta'        then 'Carta abierta'
    else null
  end;

  -- Código corto (mismo criterio que usaba el front: primeros 8 del uuid).
  v_codigo    := upper(substring(new.id::text, 1, 8));
  v_fecha_txt := to_char(new.fecha, 'DD/MM/YYYY');
  v_hora_txt  := to_char(new.hora, 'HH24:MI');

  -- 22:30 y 23:00 quedan por orden de llegada (sin mesa fija).
  v_orden_lleg := to_char(new.hora, 'HH24:MI') in ('22:30', '23:00');

  -- ─── Mensaje de WhatsApp ya formateado (para mapear directo en el no-code) ──
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
    '🎫 Código #' || v_codigo || E'\n' ||
    '👉 Contactá al cliente para confirmar.';

  -- ─── Payload estructurado (por si querés armar el mensaje en el no-code) ────
  v_payload := jsonb_build_object(
    'evento',           'reserva_nueva_web',
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

  -- ─── POST al webhook. Si algo falla, NO rompemos la reserva. ────────────────
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := v_payload
    );
  exception when others then
    -- Log silencioso: la reserva ya está guardada y la notif al dashboard también.
    raise warning '[reserva_webhook_whatsapp] no se pudo enviar el webhook: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ─── 5. Trigger AFTER INSERT en reservas ────────────────────────────────────
drop trigger if exists trg_reserva_webhook_whatsapp on public.reservas;
create trigger trg_reserva_webhook_whatsapp
  after insert on public.reservas
  for each row execute function public.reserva_webhook_whatsapp();

-- ─── 6. Reload schema (PostgREST) ───────────────────────────────────────────
notify pgrst, 'reload schema';
