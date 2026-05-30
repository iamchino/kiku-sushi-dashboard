-- Kiku Sushi - arqueo profesional de caja y movimientos.
-- Base operativa: turnos de caja, movimientos manuales y pagos vinculados.

create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  caja_nombre text not null default 'Caja principal',
  business_date date not null default current_date,
  estado text not null default 'abierto'
    check (estado in ('abierto', 'cerrado')),
  apertura_monto numeric(12,2) not null default 0
    check (apertura_monto >= 0),
  apertura_usuario_id uuid default auth.uid(),
  apertura_at timestamptz not null default now(),
  cierre_monto numeric(12,2)
    check (cierre_monto is null or cierre_monto >= 0),
  efectivo_esperado numeric(12,2),
  diferencia numeric(12,2),
  deposito_monto numeric(12,2) not null default 0
    check (deposito_monto >= 0),
  cierre_usuario_id uuid,
  cierre_at timestamptz,
  denominaciones_apertura jsonb not null default '{}'::jsonb,
  denominaciones_cierre jsonb not null default '{}'::jsonb,
  notas_apertura text,
  notas_cierre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caja_turnos_cierre_consistente check (
    (estado = 'abierto' and cierre_at is null)
    or
    (estado = 'cerrado' and cierre_at is not null and cierre_monto is not null)
  )
);

create unique index if not exists caja_turnos_caja_abierta_uid
  on public.caja_turnos (lower(caja_nombre))
  where estado = 'abierto';

create index if not exists caja_turnos_business_date_idx
  on public.caja_turnos (business_date desc, apertura_at desc);

create table if not exists public.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid references public.caja_turnos(id) on delete set null,
  tipo text not null check (tipo in (
    'ingreso',
    'egreso',
    'retiro',
    'deposito',
    'gasto',
    'propina',
    'ajuste',
    'no_venta'
  )),
  medio_pago text not null default 'efectivo' check (medio_pago in (
    'efectivo',
    'transferencia',
    'tarjeta_credito',
    'tarjeta_debito',
    'otro'
  )),
  monto numeric(12,2) not null check (monto >= 0),
  categoria text,
  descripcion text not null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  pago_id uuid references public.pagos(id) on delete set null,
  comprobante_id uuid references public.comprobantes_fiscales(id) on delete set null,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint caja_movimientos_monto_operativo check (
    tipo = 'no_venta' or monto > 0
  )
);

create index if not exists caja_movimientos_turno_idx
  on public.caja_movimientos (turno_id, created_at desc);

create index if not exists caja_movimientos_created_at_idx
  on public.caja_movimientos (created_at desc);

alter table public.pagos
  add column if not exists caja_turno_id uuid references public.caja_turnos(id) on delete set null;

create index if not exists pagos_caja_turno_idx
  on public.pagos (caja_turno_id, created_at desc);

alter table public.caja_turnos enable row level security;
alter table public.caja_movimientos enable row level security;

drop policy if exists "caja_turnos admin manage" on public.caja_turnos;
create policy "caja_turnos admin manage"
  on public.caja_turnos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "caja_movimientos admin manage" on public.caja_movimientos;
create policy "caja_movimientos admin manage"
  on public.caja_movimientos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Vista helper ampliada: pago + datos relevantes del pedido, comprobante y turno.
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
  c.importe_total as comprobante_importe,
  p.caja_turno_id
from public.pagos p
join public.pedidos ped on ped.id = p.pedido_id
left join public.comprobantes_fiscales c on c.id = p.comprobante_id;

grant select on public.pagos_arqueo to authenticated;

comment on table public.caja_turnos is
  'Apertura y cierre de caja por turno operativo. Conserva efectivo esperado, contado y diferencia.';
comment on table public.caja_movimientos is
  'Movimientos manuales del turno: ingresos, egresos, retiros, gastos, propinas, ajustes y aperturas no venta.';
comment on column public.pagos.caja_turno_id is
  'Turno de caja asociado al pago para arqueo y conciliacion.';

notify pgrst, 'reload schema';
