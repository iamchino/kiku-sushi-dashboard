-- Kiku Sushi - facturacion electronica e historial de impresiones.
-- Ejecutar desde Supabase SQL Editor antes de usar Caja y Facturacion.

do $$
begin
  if to_regclass('public.pedidos') is not null then
    alter table public.pedidos add column if not exists descuento_porcentaje numeric(5,2) not null default 0;
    alter table public.pedidos drop constraint if exists pedidos_descuento_porcentaje_check;
    alter table public.pedidos add constraint pedidos_descuento_porcentaje_check
      check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100);
  end if;
end;
$$;

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
begin
  if to_regclass('public.facturacion_config') is not null then
    alter table public.facturacion_config enable row level security;
  end if;

  if to_regclass('public.comprobantes_fiscales') is not null then
    alter table public.comprobantes_fiscales enable row level security;
  end if;

  if to_regclass('public.impresiones_documentos') is not null then
    alter table public.impresiones_documentos enable row level security;
  end if;
end;
$$;

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'facturacion_config',
    'comprobantes_fiscales',
    'impresiones_documentos'
  ]
  loop
    v_policy := 'admin manage ' || v_table;
    execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      v_policy,
      v_table
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
