-- ============================================================================
-- KDS por plato: una tarjeta por ítem, tres columnas, sin bebidas
--
--   Lo que pidió el salón: que en Cocina cada plato aparezca por separado
--   (hoy los mozos comandan de a uno para lograrlo), que las bebidas no
--   entren a cocina, y que haya una tercera columna LISTO PARA SERVIR donde
--   el mozo marca "EN MESA" — recién ahí el plato desaparece.
--
--   Para eso hacen falta dos datos nuevos:
--     · menu_items.va_a_cocina   → false para bebidas (no aparecen en el KDS
--                                  ni frenan el estado del pedido)
--     · pedido_items.servido_at  → el mozo lo llevó a la mesa
--
--   y que TODO lo que resume el pedido mire solo los ítems que van a cocina.
-- ============================================================================

-- ─── 1. ¿Este producto se cocina? ───────────────────────────────────────────
alter table public.menu_items
  add column if not exists va_a_cocina boolean not null default true;

comment on column public.menu_items.va_a_cocina is
  'false = no pasa por cocina (bebidas): no aparece en el KDS ni cuenta para el estado del pedido. Editable desde Menú.';

-- Primera carga: las categorías de bebidas quedan afuera de cocina.
update public.menu_items
   set va_a_cocina = false
 where va_a_cocina
   and lower(translate(coalesce(categoria, ''), 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun'))
       ~ '(bebida|vino|cervez|gaseosa|agua|trago|coctel|cocktail|cafe|whisk|vodka|\mgin\M|licor|espumante|champ|jugo|limonada|sake|\mte\M|infusion)';

-- Ítems de pedido que no van a cocina (los que no tienen producto asociado
-- se tratan como comida, para no esconder nada).
create or replace function public.pedido_item_va_a_cocina(p_menu_item_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce((select va_a_cocina from public.menu_items where id = p_menu_item_id), true);
$$;

-- ─── 2. "En mesa" por ítem ──────────────────────────────────────────────────
alter table public.pedido_items
  add column if not exists servido_at timestamptz,
  add column if not exists servido_por uuid;

comment on column public.pedido_items.servido_at is
  'Cuándo el mozo llevó este plato a la mesa (o lo entregó). Null = todavía en la columna LISTO PARA SERVIR.';

create index if not exists idx_pedido_items_servido
  on public.pedido_items (pedido_id)
  where listo_at is not null and servido_at is null;

-- Lo que ya estaba servido a nivel pedido queda servido a nivel ítem.
update public.pedido_items i
   set servido_at = p.servido_at
  from public.pedidos p
 where p.id = i.pedido_id
   and i.servido_at is null
   and p.servido_at is not null;

-- ─── 3. El resumen del pedido ignora las bebidas ────────────────────────────
create or replace function public.recalcular_estado_pedido(p_pedido_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sin_tomar int;
  v_sin_listo int;
  v_cocina    int;
  v_total     int;
  v_actual    text;
  v_nuevo     text;
begin
  select estado into v_actual from public.pedidos where id = p_pedido_id;

  if v_actual in ('entregado', 'cancelado') then
    return v_actual;
  end if;

  select count(*) filter (where public.pedido_item_va_a_cocina(menu_item_id) and tomado_at is null),
         count(*) filter (where public.pedido_item_va_a_cocina(menu_item_id) and listo_at  is null),
         count(*) filter (where public.pedido_item_va_a_cocina(menu_item_id)),
         count(*)
    into v_sin_tomar, v_sin_listo, v_cocina, v_total
  from public.pedido_items
  where pedido_id = p_pedido_id;

  if v_total = 0 then
    return v_actual;
  end if;

  v_nuevo := case
               when v_cocina = 0    then 'listo'      -- solo bebidas: nada que cocinar
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

-- ─── 4. Tomar UN plato (columna NUEVOS → EN PREPARACIÓN) ────────────────────
create or replace function public.tomar_item(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedido_id uuid;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
     set tomado_at = coalesce(tomado_at, now())
   where id = p_item_id
  returning pedido_id into v_pedido_id;

  if v_pedido_id is null then
    raise exception 'Ítem no encontrado';
  end if;

  return public.recalcular_estado_pedido(v_pedido_id);
end $$;

revoke execute on function public.tomar_item(uuid) from public;
grant  execute on function public.tomar_item(uuid) to authenticated;

-- ─── 5. Marcar UN plato como servido (EN MESA) ──────────────────────────────
-- Cuando no queda ningún plato de cocina sin servir, el pedido de salón queda
-- servido (pedidos.servido_at), que es lo que hoy mira la pantalla del mozo.
create or replace function public.marcar_item_servido(
  p_item_id uuid,
  p_servido boolean default true
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedido_id  uuid;
  v_pendientes int;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  update public.pedido_items
     set servido_at  = case when p_servido then coalesce(servido_at, now()) else null end,
         servido_por = case when p_servido then coalesce(servido_por, auth.uid()) else null end,
         -- Servir implica que salió de cocina.
         listo_at    = case when p_servido then coalesce(listo_at, now()) else listo_at end,
         tomado_at   = case when p_servido then coalesce(tomado_at, now()) else tomado_at end
   where id = p_item_id
  returning pedido_id into v_pedido_id;

  if v_pedido_id is null then
    raise exception 'Ítem no encontrado';
  end if;

  select count(*) into v_pendientes
    from public.pedido_items
   where pedido_id = v_pedido_id
     and public.pedido_item_va_a_cocina(menu_item_id)
     and servido_at is null;

  update public.pedidos
     set servido_at = case when v_pendientes = 0 then coalesce(servido_at, now()) else null end
   where id = v_pedido_id
     and estado not in ('entregado', 'cancelado');

  return public.recalcular_estado_pedido(v_pedido_id);
end $$;

revoke execute on function public.marcar_item_servido(uuid, boolean) from public;
grant  execute on function public.marcar_item_servido(uuid, boolean) to authenticated;

-- ─── 6. Los avisos a cocina/mozo no cuentan bebidas ─────────────────────────
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
  where pedido_id = v_pedido_id
    and public.pedido_item_va_a_cocina(menu_item_id)
    and listo_at is null;

  select mesa, canal into v_mesa, v_canal
  from public.pedidos where id = v_pedido_id;

  v_estado := public.recalcular_estado_pedido(v_pedido_id);

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

  -- Aviso de AGREGADO solo si lo agregado incluye comida.
  select p.mesa, p.canal,
         string_agg(i.cantidad || '× ' || i.nombre, ', ' order by i.nombre)
    into v_mesa, v_canal, v_detalle
  from public.pedidos p
  join public.pedido_items i on i.pedido_id = p.id
  where p.id = p_pedido_id
    and i.enviado_at = v_ahora
    and public.pedido_item_va_a_cocina(i.menu_item_id)
  group by p.mesa, p.canal;

  if v_previos > 0 and v_detalle is not null then
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

-- Los pedidos en curso que hoy solo tienen bebidas pendientes quedan listos.
do $$
declare r record;
begin
  for r in select id from public.pedidos where estado in ('pendiente', 'preparando') loop
    perform public.recalcular_estado_pedido(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
