-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Configuración de envío + integridad del total del pedido
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) Hace configurable el costo de envío:
--      • envio_config : fila única con la BASE del envío (ej. $3500).
--      • envio_zonas  : zonas con su RECARGO sobre la base (Centro +0, Norte +1500…).
--    La web pública (anon) puede LEER ambas; solo admin puede editarlas.
--    Se agrega pedidos.envio_zona para dejar registrada la zona elegida.
--
-- 2) Garantiza que pedidos.total SIEMPRE = subtotal - descuento + costo_envio,
--    sin importar qué función/RPC lo escriba. Un trigger lo recalcula cada vez
--    que cambian los items del pedido o el descuento/envío del pedido. Así el
--    descuento deja de "perderse" cuando una RPC pisa el total con el subtotal.
--
-- Ejecutar desde el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONFIGURACIÓN DE ENVÍO
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.envio_config (
  id          integer primary key default 1,
  base        numeric(12,2) not null default 3500,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  constraint envio_config_singleton check (id = 1)
);

comment on table public.envio_config is
  'Configuración global del costo de envío. Fila única (id=1). base = costo de envío por defecto.';

create table if not exists public.envio_zonas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  recargo     numeric(12,2) not null default 0,
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.envio_zonas is
  'Zonas de delivery. El costo final = envio_config.base + zona.recargo.';

-- Columna para registrar la zona elegida en cada pedido (informativa / ticket).
alter table public.pedidos
  add column if not exists envio_zona text;

comment on column public.pedidos.envio_zona is
  'Nombre de la zona de envío elegida para el pedido (informativo).';

-- Seed: una sola fila de config con la base actual ($3500).
insert into public.envio_config (id, base)
values (1, 3500)
on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.envio_config enable row level security;
alter table public.envio_zonas  enable row level security;

-- Lectura pública (la web usa la clave anon para mostrar el costo de envío).
drop policy if exists "envio_config lectura publica" on public.envio_config;
create policy "envio_config lectura publica"
  on public.envio_config for select
  to anon, authenticated
  using (true);

drop policy if exists "envio_zonas lectura publica" on public.envio_zonas;
create policy "envio_zonas lectura publica"
  on public.envio_zonas for select
  to anon, authenticated
  using (true);

-- Escritura solo admin.
drop policy if exists "envio_config admin escribe" on public.envio_config;
create policy "envio_config admin escribe"
  on public.envio_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "envio_zonas admin escribe" on public.envio_zonas;
create policy "envio_zonas admin escribe"
  on public.envio_zonas for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INTEGRIDAD DEL TOTAL DEL PEDIDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Fuente de verdad del total. Replica exactamente la lógica de orders.js:
--   subtotal  = Σ (precio_unitario * cantidad)   de los pedido_items
--   descuento = descuento_monto si está seteado (gift card / selección),
--               si no  = round(subtotal * descuento_porcentaje / 100)
--               (siempre acotado entre 0 y el subtotal)
--   total     = max(0, subtotal - descuento) + costo_envio
--
-- Devuelve el total calculado para un pedido a partir de una fila `pedidos`.
create or replace function public.kiku_total_pedido(p_pedido public.pedidos)
returns numeric
language sql
stable
as $$
  with sub as (
    select coalesce(sum(precio_unitario * cantidad), 0)::numeric as subtotal
    from public.pedido_items
    where pedido_id = p_pedido.id
  )
  select greatest(
           0,
           sub.subtotal - least(
             greatest(
               0,
               case
                 when p_pedido.descuento_monto is not null
                   then round(p_pedido.descuento_monto)
                 else round(sub.subtotal * coalesce(p_pedido.descuento_porcentaje, 0) / 100)
               end
             ),
             sub.subtotal
           )
         ) + coalesce(p_pedido.costo_envio, 0)
  from sub;
$$;

-- Trigger sobre pedidos: antes de insertar/actualizar, fija total al valor correcto.
-- Esto neutraliza cualquier RPC que intente pisar el total con el subtotal pelado.
create or replace function public.kiku_pedidos_set_total()
returns trigger
language plpgsql
as $$
begin
  new.total := public.kiku_total_pedido(new);
  return new;
end;
$$;

drop trigger if exists trg_pedidos_set_total on public.pedidos;
create trigger trg_pedidos_set_total
  before insert or update of descuento_monto, descuento_porcentaje, descuento_valor,
                            descuento_tipo, descuento_alcance, descuento_items,
                            costo_envio, total
  on public.pedidos
  for each row
  execute function public.kiku_pedidos_set_total();

-- Trigger sobre pedido_items: cuando cambian los items, recalcula el total del
-- pedido padre (dispara, a su vez, una UPDATE que pasa por el trigger de arriba).
create or replace function public.kiku_items_recompute_total()
returns trigger
language plpgsql
as $$
declare
  v_pedido uuid;
begin
  v_pedido := coalesce(new.pedido_id, old.pedido_id);
  if v_pedido is not null then
    update public.pedidos
      set total = public.kiku_total_pedido(pedidos)
      where id = v_pedido;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_items_recompute_total on public.pedido_items;
create trigger trg_items_recompute_total
  after insert or update or delete
  on public.pedido_items
  for each row
  execute function public.kiku_items_recompute_total();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Corrección de datos existentes: recalcula el total de los pedidos abiertos
--    (no facturados) para que reflejen su descuento/envío actual.
-- ─────────────────────────────────────────────────────────────────────────────
update public.pedidos p
  set total = public.kiku_total_pedido(p)
  where p.estado in ('pendiente', 'preparando', 'listo', 'entregado');

notify pgrst, 'reload schema';
