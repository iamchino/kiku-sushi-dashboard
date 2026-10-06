-- ────────────────────────────────────────────────────────────────────────────
-- Mesas: a cocina le avisa cuando el mozo MANDA platos, no cuando abre la mesa.
--
-- Antes: abrir_mesa() inserta un pedido vacío y dos triggers sobre INSERT en
-- pedidos avisaban en ese momento ("🔥 Nuevo pedido" por push y la campanita).
-- Cocina se enteraba de una mesa sin nada que cocinar, y cuando el mozo
-- mandaba los platos (primer envío) no sonaba nada.
--
-- Ahora, para pedidos de mesa (mesa_id no nulo):
--   · el INSERT no avisa (ni push ni campanita);
--   · enviar_a_cocina(), en el PRIMER envío que incluye comida, manda el
--     "🔥 Nuevo pedido" por push y deja la notificación en la campanita.
-- Los envíos siguientes siguen avisando como "➕ Se agregó a un pedido".
-- Delivery, take away y web no cambian: avisan al crearse, como siempre.
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Push: el INSERT de un pedido de mesa no avisa.
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
    -- Mesa recién abierta: todavía no hay nada que cocinar. El aviso lo manda
    -- enviar_a_cocina() cuando salen los primeros platos.
    if new.mesa_id is not null then
      return null;
    end if;

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

-- 2) Campanita: el INSERT de un pedido de mesa no deja notificación.
create or replace function public.notif_on_pedido_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emoji  text;
  v_titulo text;
  v_canal  text;
begin
  -- Mesa recién abierta: la notificación la deja enviar_a_cocina().
  if new.mesa_id is not null then
    return new;
  end if;

  v_canal := coalesce(new.canal, 'pedido');
  v_emoji := case v_canal
    when 'delivery'   then '🛵'
    when 'takeaway'   then '🛍️'
    when 'salon'      then '🍽️'
    when 'whatsapp'   then '💬'
    when 'pedidosya'  then '🟢'
    when 'rappi'      then '🟠'
    else                   '🔔'
  end;

  v_titulo := 'Nuevo pedido' ||
              case when v_canal = 'pedido' then '' else ' · ' || initcap(v_canal) end;

  insert into public.notificaciones (
    tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
  ) values (
    'pedido_nuevo',
    v_emoji || ' ' || v_titulo,
    coalesce(new.cliente_nombre, 'Sin nombre') ||
      ' · $' || coalesce(new.total, 0)::text ||
      case when new.numero is not null then ' · #' || new.numero::text else '' end,
    new.id,
    'pedidos',
    jsonb_build_object(
      'canal',             new.canal,
      'numero',            new.numero,
      'total',             new.total,
      'cliente_nombre',    new.cliente_nombre,
      'cliente_telefono',  new.cliente_telefono,
      'cliente_direccion', new.cliente_direccion,
      'estado',            new.estado,
      'mesa_id',           new.mesa_id,
      'notas',             new.notas
    )
  );

  return new;
end;
$$;

-- 3) enviar_a_cocina: el primer envío con comida de una mesa avisa como
--    "Nuevo pedido". Resto igual a 20260916010000_kds_por_plato.
create or replace function public.enviar_a_cocina(p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $$
declare
  v_enviados int;
  v_previos  int;
  v_ahora    timestamptz := now();
  v_mesa     text;
  v_canal    text;
  v_detalle  text;
  v_pedido   public.pedidos%rowtype;
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  select count(*) into v_previos
  from public.pedido_items
  where pedido_id = p_pedido_id
    and enviado_cocina = true
    and public.pedido_item_va_a_cocina(menu_item_id);

  update public.pedido_items
  set enviado_cocina = true,
      enviado_at     = v_ahora
  where pedido_id = p_pedido_id
    and enviado_cocina = false;

  get diagnostics v_enviados = row_count;

  if v_enviados = 0 then
    return 0;
  end if;

  perform public.recalcular_estado_pedido(p_pedido_id);

  -- Detalle de lo que se mandó ahora (solo comida).
  select p.mesa, p.canal,
         string_agg(i.cantidad || '× ' || i.nombre, ', ' order by i.nombre)
    into v_mesa, v_canal, v_detalle
  from public.pedidos p
  join public.pedido_items i on i.pedido_id = p.id
  where p.id = p_pedido_id
    and i.enviado_at = v_ahora
    and public.pedido_item_va_a_cocina(i.menu_item_id)
  group by p.mesa, p.canal;

  if v_detalle is null then
    return v_enviados;  -- solo bebidas: cocina no se entera
  end if;

  if v_previos > 0 then
    -- Ya había comida en cocina: es un agregado.
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'type',   'ITEMS_AGREGADOS',
        'table',  'pedido_items',
        'record', jsonb_build_object(
          'pedido_id', p_pedido_id,
          'mesa',      v_mesa,
          'canal',     v_canal,
          'detalle',   v_detalle,
          'cantidad',  v_enviados
        ),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );
  else
    -- Primer envío con comida. Si es una mesa, este es el "Nuevo pedido"
    -- (el INSERT de la mesa vacía no avisó). Los demás pedidos ya avisaron
    -- al crearse.
    select * into v_pedido from public.pedidos where id = p_pedido_id;

    if v_pedido.mesa_id is not null then
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'type',       'INSERT',
          'table',      'pedidos',
          'record',     to_jsonb(v_pedido),
          'old_record', null
        ),
        timeout_milliseconds := 5000
      );

      insert into public.notificaciones (
        tipo, titulo, mensaje, referencia_id, referencia_tabla, metadata
      ) values (
        'pedido_nuevo',
        '🍽️ Nuevo pedido · Mesa ' || coalesce(v_mesa, '?'),
        v_detalle,
        p_pedido_id,
        'pedidos',
        jsonb_build_object(
          'canal',   v_pedido.canal,
          'mesa',    v_pedido.mesa,
          'mesa_id', v_pedido.mesa_id,
          'estado',  v_pedido.estado,
          'detalle', v_detalle
        )
      );
    end if;
  end if;

  return v_enviados;
end $$;

notify pgrst, 'reload schema';
