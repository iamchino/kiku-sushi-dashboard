-- ============================================================
-- Migración: sección Finanzas
--   * empleados   → legajo del personal (sueldo base, datos de pago)
--   * egresos     → ledger unificado de gastos del negocio
--                   (mercadería, sueldos, proveedores, alquiler, etc.)
-- Todo el dominio financiero es admin-only (RLS con public.is_admin()).
-- Add-only: no toca tablas ni datos existentes.
-- ============================================================

-- ── EMPLEADOS (legajo) ────────────────────────────────────────────────────────
create table if not exists public.empleados (
  id            uuid primary key default gen_random_uuid(),
  nombre        text        not null,
  apellido      text,
  puesto        text,                                   -- cocinero, mozo, cajero, etc.
  sueldo_base   numeric(12,2) not null default 0 check (sueldo_base >= 0),
  fecha_ingreso date,
  cuit_cuil     text,
  cbu           text,
  alias         text,
  telefono      text,
  dia_pago      smallint check (dia_pago is null or (dia_pago >= 1 and dia_pago <= 31)),
  activo        boolean     not null default true,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists empleados_activo_idx
  on public.empleados (activo, lower(nombre));

-- ── EGRESOS (ledger de gastos) ────────────────────────────────────────────────
create table if not exists public.egresos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date        not null default current_date,
  categoria     text        not null default 'otros' check (categoria in (
                  'mercaderia',
                  'sueldos',
                  'proveedores',
                  'alquiler',
                  'servicios',
                  'impuestos',
                  'mantenimiento',
                  'marketing',
                  'otros'
                )),
  subtipo       text,                                   -- sueldo | adelanto | aguinaldo | ...
  descripcion   text        not null,
  monto         numeric(12,2) not null check (monto >= 0),
  medio_pago    text        not null default 'efectivo' check (medio_pago in (
                  'efectivo',
                  'transferencia',
                  'tarjeta_credito',
                  'tarjeta_debito',
                  'cheque',
                  'otro'
                )),
  estado        text        not null default 'pagado' check (estado in ('pagado', 'pendiente')),
  vencimiento   date,                                   -- para cuentas por pagar
  periodo       text,                                   -- 'YYYY-MM' (sueldos / recurrentes)
  recurrente    boolean     not null default false,
  proveedor_id  uuid references public.proveedores(id) on delete set null,
  empleado_id   uuid references public.empleados(id)   on delete set null,
  comprobante_nro text,
  notas         text,
  usuario_id    uuid        default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists egresos_fecha_idx
  on public.egresos (fecha desc, created_at desc);

create index if not exists egresos_categoria_idx
  on public.egresos (categoria, fecha desc);

create index if not exists egresos_estado_idx
  on public.egresos (estado, vencimiento);

create index if not exists egresos_proveedor_idx
  on public.egresos (proveedor_id, fecha desc);

create index if not exists egresos_empleado_idx
  on public.egresos (empleado_id, fecha desc);

-- ── Triggers updated_at (la función public.set_updated_at ya existe) ───────────
drop trigger if exists empleados_set_updated_at on public.empleados;
create trigger empleados_set_updated_at
  before update on public.empleados
  for each row execute function public.set_updated_at();

drop trigger if exists egresos_set_updated_at on public.egresos;
create trigger egresos_set_updated_at
  before update on public.egresos
  for each row execute function public.set_updated_at();

-- ── RLS: solo admin (igual que caja / proveedores) ────────────────────────────
alter table public.empleados enable row level security;
alter table public.egresos   enable row level security;

drop policy if exists "empleados admin manage" on public.empleados;
create policy "empleados admin manage"
  on public.empleados
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "egresos admin manage" on public.egresos;
create policy "egresos admin manage"
  on public.egresos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
