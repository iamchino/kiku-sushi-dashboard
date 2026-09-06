-- ============================================================================
-- Cada tanda enviada a cocina es una tarjeta propia
--
--   Antes: sumar un plato a una mesa en curso mandaba la tarjeta ENTERA de
--   vuelta a NUEVOS. Cocina volvía a ver los 4 platos que ya estaba haciendo,
--   con el agregado escondido entre ellos.
--
--   Ahora: la mesa se queda en EN PREPARACIÓN con lo suyo, y lo agregado
--   aparece como una tarjeta APARTE en NUEVOS, con la misma mesa. Lo nuevo
--   queda solo, imposible de pasar por alto, y lo que ya se está cocinando no
--   se toca.
--
--   Para eso hace falta un dato que no existía: si una tanda fue TOMADA. El
--   estado del pedido no alcanza — es uno solo para todas las tandas. Con
--   pedido_items.tomado_at, cada tanda sabe en qué columna va:
--
--       tanda sin tomar          → NUEVOS
--       tanda tomada, sin acabar → EN PREPARACIÓN
--       tanda toda lista         → sale del KDS
--
--   pedidos.estado se sigue manteniendo como resumen (lo usan la pantalla del
--   mozo, las mesas y las notificaciones): 'pendiente' si hay alguna tanda sin
--   tomar, 'preparando' si están todas tomadas, 'listo' cuando no queda nada.
-- ============================================================================

-- ─── 1. Estado de "tomado" por ítem ─────────────────────────────────────────
alter table public.pedido_items
  add column if not exists tomado_at timestamptz;

comment on column public.pedido_items.tomado_at is
  'Cuándo cocina tomó esta tanda. Null = todavía está en la columna NUEVOS.';

-- Backfill: sin esto, al aplicar la migración TODO lo que está en curso
-- aparecería como sin tomar y saltaría a NUEVOS en plena cena.
update public.pedido_items i
set tomado_at = coalesce(i.enviado_at, now())
from public.pedidos p
where p.id = i.pedido_id
  and i.tomado_at is null
  and p.estado in ('preparando', 'listo', 'entregado');

-- ─── 2. Resumen del pedido a partir de sus ítems ────────────────────────────
-- Una sola definición de la verdad, en vez de repetir el cálculo en cada RPC.
create or replace function public.recalcular_estado_pedido(p_pedido_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sin_tomar int;
  v_sin_listo int;
  v_total     int;
  v_actual    text;
  v_nuevo     text;
begin
  select estado into v_actual from public.pedidos where id = p_pedido_id;

  -- Los pedidos cerrados no se reabren solos.
  if v_actual in ('entregado', 'cancelado') then
    return v_actual;
  end if;

  select count(*) filter (where tomado_at is null),
         count(*) filter (where listo_at  is null),
         count(*)
    into v_sin_tomar, v_sin_listo, v_total
  from public.pedido_items
  where pedido_id = p_pedido_id;

  -- Un pedido sin ítems no es un pedido listo: es uno vacío. Sin esta guarda,
  -- el 0 = 0 de abajo lo daría por terminado y le avisaría al mozo.
  if v_total = 0 then
    return v_actual;
  end if;

  v_nuevo := case
               when v_sin_listo = 0 then 'listo'
               when v_sin_tomar > 0 then 'pendiente'
               else 'preparando'
             end;

  if v_nuevo is distinct from v_actual then
    update public.pedidos
    set estado = v_nuevo, updated_at = now()
    where id = p_pedido_id;
  end if;

  return v_nuevo;
end $$;

comment on function public.recalcular_estado_pedido(uuid) is
  'Deriva pedidos.estado de sus ítems. Es el resumen que leen el mozo, las '
  'mesas y las notificaciones; el KDS trabaja por tanda.';

-- ─── 3. Tomar una tanda ─────────────────────────────────────────────────────
create or replace function public.tomar_tanda(
  p_pedido_id  uuid,
  p_enviado_at timestamptz
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
  set tomado_at = now()
  where pedido_id = p_pedido_id
    and tomado_at is null
    and enviado_at is not distinct from p_enviado_at;

  return public.recalcular_estado_pedido(p_pedido_id);
end $$;

revoke execute on function public.tomar_tanda(uuid, timestamptz) from public;
grant  execute on function public.tomar_tanda(uuid, timestamptz) to authenticated;

-- ─── 4. Marcar lista una tanda entera ───────────────────────────────────────
-- Existe para no mandar N notificaciones cuando cocina marcha la tarjeta
-- completa: marca todo y avisa una sola vez.
create or replace function public.marcar_tanda_lista(
  p_pedido_id  uuid,
  p_enviado_at timestamptz
)
returns text
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $$
declare
  v_pendientes int;
  v_estado     text;
  v_mesa       text;
  v_canal      text;
  v_detalle    text;
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
  set listo_at  = coalesce(listo_at, now()),
      tomado_at = coalesce(tomado_at, now())
  where pedido_id = p_pedido_id
    and enviado_at is not distinct from p_enviado_at;

  select count(*) into v_pendientes
  from public.pedido_items
  where pedido_id = p_pedido_id and listo_at is null;

  v_estado := public.recalcular_estado_pedido(p_pedido_id);

  -- Si el pedido quedó completo avisa trg_push_pedidos; acá solo el caso
  -- parcial, que si no dejaría al mozo sin enterarse de que puede adelantar
  -- toda esta tanda.
  if v_pendientes > 0 then
    select p.mesa, p.canal,
           string_agg(i.cantidad || '× ' || i.nombre, ', ' order by i.nombre)
      into v_mesa, v_canal, v_detalle
    from public.pedidos p
    join public.pedido_items i on i.pedido_id = p.id
    where p.id = p_pedido_id
      and i.enviado_at is not distinct from p_enviado_at
    group by p.mesa, p.canal;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'type',   'ITEM_LISTO',
        'table',  'pedido_items',
        'record', jsonb_build_object(
          'pedido_id', p_pedido_id,
          'nombre',    v_detalle,
          'cantidad',  '',
          'mesa',      v_mesa,
          'canal',     v_canal,
          'restantes', v_pendientes
        ),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );
  end if;

  return v_estado;
end $$;

revoke execute on function public.marcar_tanda_lista(uuid, timestamptz) from public;
grant  execute on function public.marcar_tanda_lista(uuid, timestamptz) to authenticated;

-- ─── 5. marcar_item_listo pasa a usar el resumen ────────────────────────────
create or replace function public.marcar_item_listo(
  p_item_id uuid,
  p_listo   boolean default true
)
returns text
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $$
declare
  v_pedido_id  uuid;
  v_nombre     text;
  v_cantidad   int;
  v_mesa       text;
  v_canal      text;
  v_pendientes int;
  v_estado     text;
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  -- Marcar un plato implica que la tanda está en curso.
  update public.pedido_items
  set listo_at  = case when p_listo then now() else null end,
      listo_por = case when p_listo then auth.uid() else null end,
      tomado_at = case when p_listo then coalesce(tomado_at, now()) else tomado_at end
  where id = p_item_id
  returning pedido_id, nombre, cantidad into v_pedido_id, v_nombre, v_cantidad;

  if v_pedido_id is null then
    raise exception 'Ítem no encontrado';
  end if;

  select count(*) into v_pendientes
  from public.pedido_items
  where pedido_id = v_pedido_id and listo_at is null;

  select mesa, canal into v_mesa, v_canal
  from public.pedidos where id = v_pedido_id;

  v_estado := public.recalcular_estado_pedido(v_pedido_id);

  -- Si quedó todo listo, el aviso lo manda trg_push_pedidos con el mensaje del
  -- pedido completo. Mandar además el del ítem sería avisar dos veces lo mismo.
  if p_listo and v_pendientes > 0 then
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'type',   'ITEM_LISTO',
        'table',  'pedido_items',
        'record', jsonb_build_object(
          'pedido_id', v_pedido_id,
          'nombre',    v_nombre,
          'cantidad',  v_cantidad,
          'mesa',      v_mesa,
          'canal',     v_canal,
          'restantes', v_pendientes
        ),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );
  end if;

  return v_estado;
end $$;

-- ─── 6. enviar_a_cocina: la tanda nueva nace SIN tomar, y avisa a cocina ────
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
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  -- ¿Ya había comida en cocina para este pedido? Si sí, esto es un AGREGADO.
  select count(*) into v_previos
  from public.pedido_items
  where pedido_id = p_pedido_id and enviado_cocina = true;

  -- Todos los ítems de esta tanda comparten enviado_at (now() es el instante
  -- de la transacción): es lo que agrupa la tarjeta en el KDS.
  update public.pedido_items
  set enviado_cocina = true,
      enviado_at     = v_ahora
  where pedido_id = p_pedido_id
    and enviado_cocina = false;

  get diagnostics v_enviados = row_count;

  if v_enviados = 0 then
    return 0;
  end if;

  -- El pedido vuelve a 'pendiente' porque tiene una tanda sin tomar. El KDS no
  -- mueve la tarjeta vieja: cada tanda va a su columna por su cuenta.
  perform public.recalcular_estado_pedido(p_pedido_id);

  if v_previos > 0 then
    select p.mesa, p.canal,
           string_agg(i.cantidad || '× ' || i.nombre, ', ' order by i.nombre)
      into v_mesa, v_canal, v_detalle
    from public.pedidos p
    join public.pedido_items i on i.pedido_id = p.id
    -- Solo la tanda recién enviada: si el pedido tenía otra sin tomar, no
    -- corresponde repetirla en el aviso de "se agregó esto".
    where p.id = p_pedido_id and i.enviado_at = v_ahora
    group by p.mesa, p.canal;

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
  end if;

  return v_enviados;
end $$;

comment on function public.enviar_a_cocina(uuid) is
  'Sella una tanda de ítems y la deja sin tomar (columna NUEVOS del KDS). Si '
  'el pedido ya tenía comida en cocina, avisa a cocina que se agregó algo.';
