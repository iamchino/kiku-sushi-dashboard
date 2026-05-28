-- Kiku Sushi - extensión de facturación electrónica
-- Agrega soporte para Factura A, Notas de Crédito y Notas de Débito
-- Asume que ya corrió 20260523000000_facturacion_impresion.sql

-- 1) Agregar columnas a comprobantes_fiscales para NC y datos extendidos de receptor
do $$
begin
  if to_regclass('public.comprobantes_fiscales') is not null then
    alter table public.comprobantes_fiscales
      add column if not exists cbte_asociado_id uuid
        references public.comprobantes_fiscales(id) on delete restrict;

    alter table public.comprobantes_fiscales
      add column if not exists receptor_domicilio text;

    -- Metadata del receptor (útil para Factura A: razón social, IIBB, etc.)
    alter table public.comprobantes_fiscales
      add column if not exists receptor_metadata jsonb default '{}'::jsonb;

    -- Vencimiento de pago (concepto 2 o 3: servicios)
    alter table public.comprobantes_fiscales
      add column if not exists fecha_vto_pago date;

    -- Período facturado (concepto 2 o 3)
    alter table public.comprobantes_fiscales
      add column if not exists fecha_servicio_desde date;
    alter table public.comprobantes_fiscales
      add column if not exists fecha_servicio_hasta date;
  end if;
end;
$$;

-- 2) Relajar el unique index: permitir múltiples Notas de Crédito por pedido
do $$
begin
  if to_regclass('public.comprobantes_fiscales') is not null then
    drop index if exists public.comprobantes_fiscales_pedido_autorizado_uid;

    -- Sólo una factura (tipo 1 = A, 6 = B, 11 = C) autorizada por pedido
    create unique index if not exists comprobantes_fiscales_pedido_factura_uid
      on public.comprobantes_fiscales (pedido_id)
      where estado = 'autorizado' and tipo_cbte in (1, 6, 11);
  end if;
end;
$$;

-- 3) Validar coherencia tipo_cbte ↔ letra
do $$
begin
  if to_regclass('public.comprobantes_fiscales') is not null then
    alter table public.comprobantes_fiscales
      drop constraint if exists comprobantes_fiscales_tipo_letra_check;

    alter table public.comprobantes_fiscales
      add constraint comprobantes_fiscales_tipo_letra_check
      check (
        (tipo_cbte in (1, 2, 3) and letra = 'A') or
        (tipo_cbte in (6, 7, 8) and letra = 'B') or
        (tipo_cbte in (11, 12, 13) and letra = 'C')
      );
  end if;
end;
$$;

-- 4) Helper: vista que enriquece comprobantes con datos del pedido y comprobante asociado
create or replace view public.comprobantes_fiscales_extendidos as
select
  c.*,
  p.canal as pedido_canal,
  p.mesa as pedido_mesa,
  p.created_at as pedido_created_at,
  asoc.numero as cbte_asociado_numero,
  asoc.punto_venta as cbte_asociado_punto_venta,
  asoc.tipo_cbte as cbte_asociado_tipo
from public.comprobantes_fiscales c
left join public.pedidos p on p.id = c.pedido_id
left join public.comprobantes_fiscales asoc on asoc.id = c.cbte_asociado_id;

grant select on public.comprobantes_fiscales_extendidos to authenticated;

-- 5) Extender facturacion_config con datos para Factura A
do $$
begin
  if to_regclass('public.facturacion_config') is not null then
    alter table public.facturacion_config
      add column if not exists permite_factura_a boolean not null default false;

    -- Alias del certificado (informativo, los secretos viven en Supabase Secrets)
    alter table public.facturacion_config
      add column if not exists certificado_alias text;

    -- Cache del último número usado por (tipo, punto_venta) para evitar query a ARCA
    alter table public.facturacion_config
      add column if not exists ultimos_numeros jsonb default '{}'::jsonb;
  end if;
end;
$$;

-- 6) Tabla de referencia: tipos de comprobante soportados
create table if not exists public.tipos_comprobante (
  codigo integer primary key,
  letra text not null check (letra in ('A', 'B', 'C')),
  descripcion text not null,
  es_nota boolean not null default false,
  signo numeric(2,0) not null default 1 -- 1 para factura/débito, -1 para crédito
);

insert into public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) values
  (1,  'A', 'Factura A', false, 1),
  (2,  'A', 'Nota de Débito A', true, 1),
  (3,  'A', 'Nota de Crédito A', true, -1),
  (6,  'B', 'Factura B', false, 1),
  (7,  'B', 'Nota de Débito B', true, 1),
  (8,  'B', 'Nota de Crédito B', true, -1),
  (11, 'C', 'Factura C', false, 1),
  (12, 'C', 'Nota de Débito C', true, 1),
  (13, 'C', 'Nota de Crédito C', true, -1)
on conflict (codigo) do nothing;

alter table public.tipos_comprobante enable row level security;

drop policy if exists "tipos_comprobante lectura publica" on public.tipos_comprobante;
create policy "tipos_comprobante lectura publica"
  on public.tipos_comprobante
  for select
  to authenticated
  using (true);

-- 7) RPC: número siguiente por (tipo_cbte, punto_venta). Solo lookup local; ARCA es la autoridad real.
create or replace function public.siguiente_numero_comprobante(
  p_tipo_cbte integer,
  p_punto_venta integer
)
returns integer
language sql
stable
as $$
  select coalesce(max(numero), 0) + 1
  from public.comprobantes_fiscales
  where tipo_cbte = p_tipo_cbte
    and punto_venta = p_punto_venta
    and estado = 'autorizado';
$$;

grant execute on function public.siguiente_numero_comprobante(integer, integer) to authenticated;

-- 8) Logging detallado de llamadas a ARCA (audit trail)
create table if not exists public.arca_request_log (
  id uuid primary key default gen_random_uuid(),
  comprobante_id uuid references public.comprobantes_fiscales(id) on delete set null,
  servicio text not null check (servicio in ('wsaa', 'wsfe')),
  metodo text,
  request_payload jsonb,
  response_payload jsonb,
  http_status integer,
  duracion_ms integer,
  error_code text,
  error_mensaje text,
  ambiente text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists arca_request_log_comprobante_idx
  on public.arca_request_log (comprobante_id, created_at desc);

create index if not exists arca_request_log_servicio_idx
  on public.arca_request_log (servicio, created_at desc);

alter table public.arca_request_log enable row level security;

drop policy if exists "arca_request_log admin manage" on public.arca_request_log;
create policy "arca_request_log admin manage"
  on public.arca_request_log
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 9) Cache de tokens WSAA (sobreviven a reinicios de la Edge Function)
create table if not exists public.arca_tokens (
  id uuid primary key default gen_random_uuid(),
  servicio text not null,                       -- 'wsfe'
  ambiente text not null check (ambiente in ('homologacion', 'produccion')),
  cuit text not null,
  token text not null,
  sign text not null,
  generation_time timestamptz not null,
  expiration_time timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists arca_tokens_servicio_ambiente_cuit_uid
  on public.arca_tokens (servicio, ambiente, cuit);

create index if not exists arca_tokens_expiration_idx
  on public.arca_tokens (expiration_time);

alter table public.arca_tokens enable row level security;

-- Sólo el service_role (Edge Function) accede. authenticated NO debe leer tokens.
drop policy if exists "arca_tokens service only" on public.arca_tokens;
create policy "arca_tokens service only"
  on public.arca_tokens
  for all
  to service_role
  using (true)
  with check (true);

-- 10) Refrescar PostgREST
notify pgrst, 'reload schema';
