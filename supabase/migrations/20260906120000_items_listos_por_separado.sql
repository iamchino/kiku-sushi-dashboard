-- ============================================================================
-- Ítems listos de a uno (sushi y cocina marchan por separado)
--
--   La cocina está partida en dos: sushi y caliente. Cada estación termina lo
--   suyo en momentos distintos, pero el "listo" vivía solo a nivel PEDIDO, así
--   que la mesa entera esperaba a que estuviera todo. Ahora cada ítem tiene su
--   propio estado y el mozo puede adelantar lo que ya salió.
--
--   No hay estaciones en el modelo, a propósito: todos ven todo y cada uno
--   marca lo que le corresponde. Menos configuración, y ningún plato queda
--   huérfano por estar mal clasificado.
--
--   Piezas:
--     • pedido_items.listo_at / listo_por  → el estado por ítem
--     • marcar_item_listo()                → lo marca y decide si avisar
--     • trg_items_listos_al_marcar_pedido  → mantiene coherencia cuando cocina
--                                            usa el botón de tarjeta completa
--
--   Sobre las notificaciones, que es la parte delicada:
--     - Marcás un ítem y el pedido queda INCOMPLETO → push "listo para
--       adelantar" con ese plato.
--     - Marcás el ÚLTIMO ítem → el pedido pasa a 'listo' y avisa el trigger que
--       ya existe (trg_push_pedidos), con el mensaje de siempre.
--   Por eso el aviso por ítem se manda desde acá y no desde un trigger por
--   fila: un trigger no puede saber si es el último, y el mozo recibiría dos
--   notificaciones del mismo plato — o cinco de golpe cuando cocina marca la
--   tarjeta entera.
-- ============================================================================

-- ─── 1. Estado por ítem ─────────────────────────────────────────────────────
alter table public.pedido_items
  add column if not exists listo_at  timestamptz,
  add column if not exists listo_por uuid;

create index if not exists pedido_items_pedido_listo_idx
  on public.pedido_items (pedido_id, listo_at);

comment on column public.pedido_items.listo_at is
  'Cuándo cocina marcó este plato listo para despachar. Null = todavía no.';

-- ─── 2. Marcar / desmarcar un ítem ──────────────────────────────────────────
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
  v_pendientes int;
  v_estado     text;
  v_mesa       text;
  v_canal      text;
  v_nombre     text;
  v_cantidad   int;
  v_url text := 'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web';
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
  set listo_at  = case when p_listo then now() else null end,
      listo_por = case when p_listo then auth.uid() else null end
  where id = p_item_id
  returning pedido_id, nombre, cantidad into v_pedido_id, v_nombre, v_cantidad;

  if v_pedido_id is null then
    raise exception 'Ítem no encontrado';
  end if;

  -- ¿Queda algo sin marcar en este pedido?
  select count(*) into v_pendientes
  from public.pedido_items
  where pedido_id = v_pedido_id and listo_at is null;

  select estado, mesa, canal into v_estado, v_mesa, v_canal
  from public.pedidos where id = v_pedido_id;

  if v_pendientes = 0 and v_estado in ('pendiente', 'preparando') then
    -- Último ítem: el pedido entero queda listo. Avisa trg_push_pedidos, así
    -- que acá se corta y NO se manda el aviso por ítem: si no, el mozo
    -- recibiría dos notificaciones por el mismo plato.
    update public.pedidos
    set estado = 'listo', updated_at = now()
    where id = v_pedido_id;
    return 'listo';
  end if;

  if v_pendientes > 0 and v_estado = 'listo' then
    -- Se desmarcó algo de un pedido que ya estaba listo: vuelve atrás.
    update public.pedidos
    set estado = 'preparando', updated_at = now()
    where id = v_pedido_id;
    v_estado := 'preparando';

  elsif v_pendientes > 0 and v_estado = 'pendiente' and p_listo then
    -- Alguien empezó a marchar este pedido: sale de NUEVOS. Sin esto la
    -- tarjeta se quedaba en la primera columna con ítems ya tildados, y la
    -- otra estación no tenía forma de saber que estaba en curso.
    update public.pedidos
    set estado = 'preparando', updated_at = now()
    where id = v_pedido_id;
    v_estado := 'preparando';
  end if;

  -- Listo parcial: el mozo puede adelantar este plato.
  -- v_pendientes > 0 es la guarda que evita avisar sobre un pedido que ya
  -- estaba completo (p. ej. re-marcar un ítem de un pedido entregado).
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

  return coalesce(v_estado, 'preparando');
end $$;

revoke execute on function public.marcar_item_listo(uuid, boolean) from public;
grant  execute on function public.marcar_item_listo(uuid, boolean) to authenticated;

comment on function public.marcar_item_listo(uuid, boolean) is
  'Marca un plato listo para despachar. Si era el último del pedido, pasa el '
  'pedido a listo; si no, avisa al mozo que puede adelantarlo.';

-- ─── 3. Coherencia con el botón de tarjeta completa ─────────────────────────
-- Cocina puede marchar el pedido entero desde el KDS (avanzar_estado_pedido).
-- Sin esto, el pedido quedaría 'listo' con todos sus ítems en null y la
-- pantalla del mozo mostraría "0 de 4 listos" sobre un pedido terminado.
create or replace function public.sincronizar_items_al_marcar_listo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.estado = 'listo' and old.estado is distinct from 'listo' then
    update public.pedido_items
    set listo_at = now()
    where pedido_id = new.id and listo_at is null;
  end if;
  return null;
end $$;

drop trigger if exists trg_items_listos_al_marcar_pedido on public.pedidos;
create trigger trg_items_listos_al_marcar_pedido
  after update on public.pedidos
  for each row
  execute function public.sincronizar_items_al_marcar_listo();

comment on function public.sincronizar_items_al_marcar_listo() is
  'Cuando el pedido entero pasa a listo, da por listos los ítems que faltaban. '
  'No manda push: de eso se encarga trg_push_pedidos con el aviso del pedido.';
