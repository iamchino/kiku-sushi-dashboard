-- Kiku Sushi - registro de pagos por pedido (para arqueo de caja)
-- Un pago por pedido en el MVP. Si después necesitan split, agregamos sin romper.

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  comprobante_id uuid references public.comprobantes_fiscales(id) on delete set null,
  medio_pago text not null check (medio_pago in (
    'efectivo',
    'transferencia',
    'tarjeta_credito',
    'tarjeta_debito'
  )),
  numero_operacion text,            -- nro de cupón/operación del posnet (sólo tarjetas)
  monto numeric(12,2) not null check (monto >= 0),
  notas text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Un solo pago por pedido en el MVP
create unique index if not exists pagos_pedido_uid
  on public.pagos (pedido_id);

-- Índices para arqueo (totales por medio + rangos por fecha)
create index if not exists pagos_medio_idx
  on public.pagos (medio_pago, created_at desc);

create index if not exists pagos_created_at_idx
  on public.pagos (created_at desc);

alter table public.pagos enable row level security;

drop policy if exists "pagos admin manage" on public.pagos;
create policy "pagos admin manage"
  on public.pagos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Vista helper: pago + datos relevantes del pedido y comprobante.
-- Ideal para armar el arqueo más adelante.
create or replace view public.pagos_arqueo as
select
  p.id,
  p.medio_pago,
  p.numero_operacion,
  p.monto,
  p.notas,
  p.created_at,
  p.usuario_id,
  ped.id as pedido_id,
  ped.mesa as pedido_mesa,
  ped.canal as pedido_canal,
  ped.total as pedido_total,
  c.id as comprobante_id,
  c.letra as comprobante_letra,
  c.tipo_cbte as comprobante_tipo,
  c.punto_venta as comprobante_pv,
  c.numero as comprobante_numero,
  c.cae as comprobante_cae,
  c.importe_total as comprobante_importe
from public.pagos p
join public.pedidos ped on ped.id = p.pedido_id
left join public.comprobantes_fiscales c on c.id = p.comprobante_id;

grant select on public.pagos_arqueo to authenticated;

notify pgrst, 'reload schema';
