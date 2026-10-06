-- ════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD · CAPA 1 — Cerrar la base a los anónimos
--
-- La clave pública (anon key) viaja en la web y en el dashboard: cualquiera
-- puede hablar con la base sin pasar por las pantallas. Hasta hoy la frenaban
-- solo las policies, y había agujeros:
--   · 107 funciones ejecutables sin usuario (Postgres da EXECUTE a PUBLIC por
--     defecto). Varias son SECURITY DEFINER.
--   · current_app_role() sin usuario devolvía 'cocina': un anónimo heredaba
--     los permisos de la cocina.
--   · anon podía leer e insertar en pedidos y pedido_items (datos de clientes).
--   · anon tenía GRANT ALL sobre todas las tablas (frenado solo por RLS).
--   · 5 vistas corrían con permisos del dueño, no del que consulta.
--   · La edge function push-web aceptaba a cualquiera.
--
-- Después de esto, un anónimo puede: leer la carta, especiales, horarios y
-- config pública; y ejecutar 4 funciones: crear_pedido_web, crear_reserva,
-- crear_lista_espera y slots_disponibles. Nada más.
--
-- La web pública (kiku-sushi-web) pasa a crear pedidos con crear_pedido_web()
-- en vez de insertar en las tablas. Hay que deployar la web junto con esto.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Sin usuario no hay rol ───────────────────────────────────────────────
create or replace function public.current_app_role()
returns text
language sql
stable
set search_path to ''
as $$
  -- SOLO app_metadata (user_metadata la escribe el usuario). Sin sesión → null:
  -- todas las guardas (is_admin, tiene_permiso, puede_tabla…) dan false.
  -- Un usuario logueado sin rol asignado sigue siendo 'cocina' (mínimo).
  select case
    when auth.uid() is null then null
    else coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
  end
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado, leído de app_metadata. NULL sin sesión (anon no hereda nada). Default cocina solo para usuarios logueados sin rol.';

-- ── 2) Funciones: nadie sin usuario, salvo las 4 de la web ──────────────────
-- Saca el EXECUTE por defecto (PUBLIC) y el explícito de anon. Vuelve a dar a
-- authenticated y service_role lo que tenían, y deja eso como default para
-- las funciones que se creen de acá en más.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant  execute on functions to authenticated, service_role;

-- ── 3) Tablas: anon solo lee el catálogo público ────────────────────────────
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant select on
  public.menu_items,
  public.menu_item_variantes,
  public.especiales,
  public.especial_pasos,
  public.aperturas_especiales,
  public.envio_config,
  public.envio_zonas,
  public.reservas_config,
  public.reservas_dias,
  public.web_config
to anon;

-- Las policies de anon sobre pedidos ya no hacen falta (y eran el agujero).
drop policy if exists "anon crear pedidos"      on public.pedidos;
drop policy if exists "anon leer pedidos"       on public.pedidos;
drop policy if exists "anon crear pedido_items" on public.pedido_items;
drop policy if exists "anon leer pedido_items"  on public.pedido_items;

-- ── 4) Pedido web por RPC ───────────────────────────────────────────────────
-- Reemplaza el insert directo de la web. Valida en el servidor y toma el
-- precio del menú cuando el ítem existe (no se confía en el precio que manda
-- el navegador). Devuelve id y número para la pantalla de confirmación.
create or replace function public.crear_pedido_web(
  p_canal             text,
  p_items             jsonb,
  p_cliente_nombre    text,
  p_cliente_telefono  text,
  p_cliente_direccion text default null,
  p_envio_zona        text default null,
  p_costo_envio       numeric default 0,
  p_notas             text default null,
  p_programado_para   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id       uuid;
  v_numero   bigint;
  v_subtotal numeric := 0;
  v_envio    numeric := greatest(0, least(coalesce(p_costo_envio, 0), 100000));
  v_nombre   text := nullif(btrim(coalesce(p_cliente_nombre, '')), '');
  v_tel      text := nullif(regexp_replace(coalesce(p_cliente_telefono, ''), '[^0-9+ ]', '', 'g'), '');
  v_dir      text := nullif(btrim(coalesce(p_cliente_direccion, '')), '');
  v_items    jsonb := '[]'::jsonb;
  it         record;
  v_precio   numeric;
  v_recientes int;
begin
  if p_canal not in ('delivery', 'takeaway') then
    raise exception 'Canal inválido.';
  end if;
  if v_nombre is null or length(v_nombre) > 80 then
    raise exception 'Falta el nombre (máx. 80 caracteres).';
  end if;
  if v_tel is null or length(v_tel) < 6 or length(v_tel) > 25 then
    raise exception 'Teléfono inválido.';
  end if;
  if p_canal = 'delivery' and (v_dir is null or length(v_dir) > 160) then
    raise exception 'Falta la dirección de entrega.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then
    raise exception 'El pedido debe tener entre 1 y 60 ítems.';
  end if;
  if length(coalesce(p_notas, '')) > 600 then
    raise exception 'Las notas son demasiado largas.';
  end if;

  -- Freno simple: más de 5 pedidos web en 10 minutos desde el mismo teléfono.
  select count(*) into v_recientes
  from public.pedidos
  where origen = 'web'
    and cliente_telefono = v_tel
    and created_at > now() - interval '10 minutes';
  if v_recientes >= 5 then
    raise exception 'Demasiados pedidos seguidos. Esperá unos minutos o llamanos.';
  end if;

  -- Normalizar ítems: precio del menú si el producto existe y tiene precio.
  for it in
    select
      nullif(btrim(coalesce(i.nombre, '')), '')        as nombre,
      greatest(1, least(coalesce(i.cantidad, 1), 50))  as cantidad,
      greatest(0, coalesce(i.precio_unitario, 0))      as precio_cliente,
      i.menu_item_id
    from jsonb_to_recordset(p_items)
      as i(nombre text, cantidad numeric, precio_unitario numeric, menu_item_id uuid)
  loop
    if it.nombre is null then
      raise exception 'Hay un ítem sin nombre.';
    end if;
    v_precio := it.precio_cliente;
    if it.menu_item_id is not null then
      select coalesce(m.precio_num, it.precio_cliente) into v_precio
      from public.menu_items m
      where m.id = it.menu_item_id and m.activo = true;
      if not found then
        -- Producto inexistente u oculto: se deja el ítem pero sin vínculo.
        it.menu_item_id := null;
        v_precio := it.precio_cliente;
      end if;
    end if;
    v_subtotal := v_subtotal + v_precio * it.cantidad;
    v_items := v_items || jsonb_build_object(
      'nombre', left(it.nombre, 120),
      'cantidad', it.cantidad,
      'precio_unitario', round(v_precio, 2),
      'menu_item_id', it.menu_item_id
    );
  end loop;

  insert into public.pedidos (
    canal, origen, estado, total, costo_envio,
    cliente_nombre, cliente_telefono, cliente_direccion,
    envio_zona, notas, programado_para
  ) values (
    p_canal, 'web', 'pendiente', round(v_subtotal + v_envio, 2), v_envio,
    v_nombre, v_tel, case when p_canal = 'delivery' then v_dir else null end,
    left(nullif(btrim(coalesce(p_envio_zona, '')), ''), 120),
    nullif(btrim(coalesce(p_notas, '')), ''),
    p_programado_para
  )
  returning id, numero into v_id, v_numero;

  insert into public.pedido_items (pedido_id, nombre, cantidad, precio_unitario, menu_item_id)
  select v_id, i.nombre, i.cantidad, i.precio_unitario, i.menu_item_id
  from jsonb_to_recordset(v_items)
    as i(nombre text, cantidad numeric, precio_unitario numeric, menu_item_id uuid);

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

comment on function public.crear_pedido_web(text, jsonb, text, text, text, text, numeric, text, timestamptz) is
  'Pedido desde la web pública (anon). Valida, toma el precio del menú y crea pedido + ítems. Reemplaza el insert directo.';

-- Lo único que la web puede ejecutar sin usuario.
grant execute on function public.crear_pedido_web(text, jsonb, text, text, text, text, numeric, text, timestamptz) to anon;
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('crear_reserva', 'crear_lista_espera', 'slots_disponibles')
  loop
    execute format('grant execute on function %s to anon', r.fn);
  end loop;
end $$;

-- ── 5) Vistas con los permisos del que consulta ─────────────────────────────
alter view public.pagos_arqueo                     set (security_invoker = on);
alter view public.comprobantes_fiscales_extendidos set (security_invoker = on);
alter view public.v_alertas_stock                  set (security_invoker = on);
alter view public.v_kpis_dia                       set (security_invoker = on);
alter view public.v_mesas_estado                   set (security_invoker = on);

-- ── 6) push-web con secreto compartido ──────────────────────────────────────
-- El secreto vive en un esquema que PostgREST no expone. Las funciones que
-- avisan (security definer) lo leen y lo mandan en el header x-push-secret;
-- la edge function lo compara con PUSH_WEB_SECRET.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  clave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.config from public, anon, authenticated;

insert into private.config (clave, valor) values
  ('push_web_url',    'https://sepyieuxsmxhzobtmzxb.supabase.co/functions/v1/push-web'),
  ('push_web_secret', 'CAMBIAR-POR-UN-SECRETO-LARGO')
on conflict (clave) do nothing;

create or replace function public.push_web_post(p_body jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'net', 'extensions', 'pg_temp'
as $$
declare
  v_url    text;
  v_secret text;
begin
  select valor into v_url    from private.config where clave = 'push_web_url';
  select valor into v_secret from private.config where clave = 'push_web_secret';
  if v_url is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body    := p_body,
    timeout_milliseconds := 5000
  );
end $$;

revoke execute on function public.push_web_post(jsonb) from public, anon, authenticated;

-- Las cuatro funciones que avisan, ahora a través de push_web_post().
CREATE OR REPLACE FUNCTION public.notificar_push_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions', 'pg_temp'
AS $function$
declare
begin
  if tg_op = 'INSERT' then
    -- Mesa recién abierta: todavía no hay nada que cocinar. El aviso lo manda
    -- enviar_a_cocina() cuando salen los primeros platos.
    if new.mesa_id is not null then
      return null;
    end if;

    perform public.push_web_post(jsonb_build_object(
        'type',       'INSERT',
        'table',      'pedidos',
        'record',     to_jsonb(new),
        'old_record', null
      ));

  elsif tg_op = 'UPDATE'
        and new.estado = 'listo'
        and old.estado is distinct from 'listo' then
    perform public.push_web_post(jsonb_build_object(
        'type',       'UPDATE',
        'table',      'pedidos',
        'record',     to_jsonb(new),
        'old_record', to_jsonb(old)
      ));
  end if;

  return null;  -- trigger AFTER: el valor de retorno se ignora
end;
$function$

;
CREATE OR REPLACE FUNCTION public.enviar_a_cocina(p_pedido_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
declare
  v_enviados int;
  v_previos  int;
  v_ahora    timestamptz := now();
  v_mesa     text;
  v_canal    text;
  v_detalle  text;
  v_pedido   public.pedidos%rowtype;
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
    perform public.push_web_post(jsonb_build_object(
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
      ));
  else
    -- Primer envío con comida. Si es una mesa, este es el "Nuevo pedido"
    -- (el INSERT de la mesa vacía no avisó). Los demás pedidos ya avisaron
    -- al crearse.
    select * into v_pedido from public.pedidos where id = p_pedido_id;

    if v_pedido.mesa_id is not null then
      perform public.push_web_post(jsonb_build_object(
          'type',       'INSERT',
          'table',      'pedidos',
          'record',     to_jsonb(v_pedido),
          'old_record', null
        ));

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
end $function$

;
CREATE OR REPLACE FUNCTION public.marcar_item_listo(p_item_id uuid, p_listo boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
declare
  v_pedido_id  uuid;
  v_nombre     text;
  v_cantidad   int;
  v_mesa       text;
  v_canal      text;
  v_pendientes int;
  v_estado     text;
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
    perform public.push_web_post(jsonb_build_object(
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
      ));
  end if;

  return v_estado;
end $function$

;
CREATE OR REPLACE FUNCTION public.marcar_tanda_lista(p_pedido_id uuid, p_enviado_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
declare
  v_pendientes int;
  v_estado     text;
  v_mesa       text;
  v_canal      text;
  v_detalle    text;
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

    perform public.push_web_post(jsonb_build_object(
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
      ));
  end if;

  return v_estado;
end $function$

;


notify pgrst, 'reload schema';
