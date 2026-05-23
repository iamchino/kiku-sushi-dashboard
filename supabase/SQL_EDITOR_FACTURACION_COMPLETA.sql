-- Kiku Sushi - ejecucion completa para Supabase SQL Editor.
-- Pegar completo y ejecutar una vez. Es idempotente: se puede volver a ejecutar.
--
-- Incluye:
-- 1. Roles operativos del dashboard.
-- 2. RPC crear_pedido_con_items para evitar el error de schema cache.
-- 3. RPC avanzar_estado_pedido.
-- 4. Tablas de facturacion electronica e historial de impresiones.

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    'cocina'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_operational_user()
returns boolean
language sql
stable
as $$
  select
    public.current_app_role() in ('admin', 'cocina')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_operational_user() to authenticated;

do $$
begin
  if to_regclass('public.pedidos') is not null then
    alter table public.pedidos add column if not exists descuento_porcentaje numeric(5,2) not null default 0;
    alter table public.pedidos drop constraint if exists pedidos_descuento_porcentaje_check;
    alter table public.pedidos add constraint pedidos_descuento_porcentaje_check
      check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100);
  end if;

  if to_regclass('public.pedido_items') is not null then
    alter table public.pedido_items add column if not exists menu_item_id uuid;
    alter table public.pedido_items add column if not exists variante_id uuid;
  end if;
end;
$$;

create or replace function public.crear_pedido_con_items(
  p_canal text,
  p_mesa text,
  p_notas text,
  p_items jsonb,
  p_descuento_porcentaje numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido_id uuid;
  v_subtotal numeric := 0;
  v_descuento numeric := 0;
  v_total numeric := 0;
  v_has_menu_item_id boolean := false;
  v_has_variante_id boolean := false;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un item';
  end if;

  select coalesce(sum(
    coalesce((item->>'precio_unitario')::numeric, 0) *
    coalesce((item->>'cantidad')::numeric, 0)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  v_descuento := least(100, greatest(0, coalesce(p_descuento_porcentaje, 0)));
  v_total := greatest(0, round(v_subtotal * (1 - (v_descuento / 100)), 2));

  insert into public.pedidos (canal, mesa, notas, total, descuento_porcentaje)
  values (p_canal, nullif(p_mesa, '')::int, nullif(p_notas, ''), v_total, v_descuento)
  returning id into v_pedido_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedido_items'
      and column_name = 'menu_item_id'
  )
  into v_has_menu_item_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedido_items'
      and column_name = 'variante_id'
  )
  into v_has_variante_id;

  if v_has_menu_item_id and v_has_variante_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id, variante_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id,
        i.variante_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid,
        variante_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  elsif v_has_menu_item_id then
    execute $sql$
      insert into public.pedido_items (
        pedido_id, nombre, precio_unitario, cantidad, notas, menu_item_id
      )
      select
        $1,
        i.nombre,
        coalesce(i.precio_unitario, 0),
        coalesce(i.cantidad, 1),
        nullif(i.notas, ''),
        i.menu_item_id
      from jsonb_to_recordset($2) as i(
        nombre text,
        precio_unitario numeric,
        cantidad numeric,
        notas text,
        menu_item_id uuid
      )
    $sql$ using v_pedido_id, p_items;
  else
    insert into public.pedido_items (
      pedido_id,
      nombre,
      precio_unitario,
      cantidad,
      notas
    )
    select
      v_pedido_id,
      i.nombre,
      coalesce(i.precio_unitario, 0),
      coalesce(i.cantidad, 1),
      nullif(i.notas, '')
    from jsonb_to_recordset(p_items) as i(
      nombre text,
      precio_unitario numeric,
      cantidad numeric,
      notas text
    );
  end if;

  return v_pedido_id;
end;
$$;

grant execute on function public.crear_pedido_con_items(text, text, text, jsonb, numeric) to authenticated;

create or replace function public.crear_pedido_con_items(
  p_canal text,
  p_mesa text,
  p_notas text,
  p_items jsonb
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.crear_pedido_con_items(p_canal, p_mesa, p_notas, p_items, 0)
$$;

grant execute on function public.crear_pedido_con_items(text, text, text, jsonb) to authenticated;

create or replace function public.avanzar_estado_pedido(
  p_pedido_id uuid,
  p_estado_actual text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado_actual text;
  v_siguiente text;
begin
  if not public.is_operational_user() then
    raise exception 'No autorizado';
  end if;

  select estado
  into v_estado_actual
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado_actual <> p_estado_actual then
    raise exception 'El pedido cambio de estado. Actualiza la pantalla e intenta de nuevo.';
  end if;

  v_siguiente := case v_estado_actual
    when 'pendiente' then 'preparando'
    when 'preparando' then 'listo'
    when 'listo' then 'entregado'
    else null
  end;

  if v_siguiente is null then
    raise exception 'El pedido no se puede avanzar desde el estado %', v_estado_actual;
  end if;

  update public.pedidos
  set estado = v_siguiente
  where id = p_pedido_id;

  return v_siguiente;
end;
$$;

grant execute on function public.avanzar_estado_pedido(uuid, text) to authenticated;

create table if not exists public.facturacion_config (
  id uuid primary key default gen_random_uuid(),
  razon_social text,
  nombre_fantasia text default 'Kiku Sushi',
  cuit text,
  condicion_iva text default 'Responsable Inscripto',
  domicilio text,
  ingresos_brutos text,
  inicio_actividades date,
  punto_venta integer,
  ambiente text not null default 'homologacion'
    check (ambiente in ('homologacion', 'produccion')),
  alicuota_iva numeric(5,2) not null default 21,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comprobantes_fiscales (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'autorizado', 'rechazado', 'error', 'anulado')),
  letra text not null default 'B',
  tipo_cbte integer not null default 6,
  punto_venta integer,
  numero integer,
  fecha_emision date not null default current_date,
  concepto integer not null default 1,
  doc_tipo integer not null default 99,
  doc_nro text default '0',
  receptor_nombre text default 'Consumidor Final',
  receptor_condicion_iva text default 'Consumidor Final',
  importe_neto numeric(12,2) not null default 0,
  importe_iva numeric(12,2) not null default 0,
  importe_total numeric(12,2) not null default 0,
  moneda text not null default 'PES',
  cotizacion numeric(12,6) not null default 1,
  cae text,
  cae_vto date,
  qr_url text,
  qr_data_url text,
  arca_request jsonb,
  arca_response jsonb,
  error_mensaje text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists comprobantes_fiscales_cbte_uid
  on public.comprobantes_fiscales (tipo_cbte, punto_venta, numero)
  where numero is not null;

create unique index if not exists comprobantes_fiscales_pedido_autorizado_uid
  on public.comprobantes_fiscales (pedido_id)
  where estado = 'autorizado';

create index if not exists comprobantes_fiscales_pedido_idx
  on public.comprobantes_fiscales (pedido_id);

create table if not exists public.impresiones_documentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete set null,
  comprobante_id uuid references public.comprobantes_fiscales(id) on delete set null,
  tipo text not null check (tipo in ('comanda', 'ticket_fiscal', 'ticket_no_fiscal')),
  destino text default 'comandera_usb',
  usuario_id uuid default auth.uid(),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists impresiones_documentos_pedido_idx
  on public.impresiones_documentos (pedido_id, created_at desc);

do $$
declare
  v_table_name text;
  v_policy_name text;
begin
  foreach v_table_name in array array[
    'pedidos',
    'pedido_items',
    'stock',
    'stock_movimientos',
    'menu_items',
    'menu_item_variantes',
    'recetas',
    'receta_ingredientes',
    'combos',
    'combo_items',
    'produccion_listas',
    'produccion_tareas'
  ]
  loop
    if to_regclass(format('public.%I', v_table_name)) is null then
      continue;
    end if;

    v_policy_name := 'operational users manage ' || v_table_name;
    execute format('alter table public.%I enable row level security', v_table_name);
    execute format('drop policy if exists %I on public.%I', v_policy_name, v_table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_operational_user()) with check (public.is_operational_user())',
      v_policy_name,
      v_table_name
    );
  end loop;
end;
$$;

do $$
declare
  v_table_name text;
  v_policy_name text;
begin
  foreach v_table_name in array array[
    'facturacion_config',
    'comprobantes_fiscales',
    'impresiones_documentos'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table_name);
    v_policy_name := 'admin manage ' || v_table_name;
    execute format('drop policy if exists %I on public.%I', v_policy_name, v_table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      v_policy_name,
      v_table_name
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from public.facturacion_config) then
    insert into public.facturacion_config (
      nombre_fantasia,
      condicion_iva,
      ambiente,
      alicuota_iva
    )
    values (
      'Kiku Sushi',
      'Responsable Inscripto',
      'homologacion',
      21
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
