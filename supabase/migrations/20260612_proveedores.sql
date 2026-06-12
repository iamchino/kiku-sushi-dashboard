-- ============================================================
-- Migración: tabla proveedores
-- Solo accesible por usuarios con rol 'admin' (RLS)
-- ============================================================

create table if not exists public.proveedores (
  id            uuid primary key default gen_random_uuid(),
  razon_social  text        not null,
  nro_cuenta    text,
  cuit_cuil     text,
  cbu           text,
  alias         text,
  telefono      text,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Índice para búsquedas por nombre
create index if not exists proveedores_razon_social_idx
  on public.proveedores (lower(razon_social));

-- Trigger para updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists proveedores_set_updated_at on public.proveedores;
create trigger proveedores_set_updated_at
  before update on public.proveedores
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.proveedores enable row level security;

-- Solo admin puede leer
create policy "proveedores_select_admin"
  on public.proveedores for select
  using (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    or (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Solo admin puede insertar
create policy "proveedores_insert_admin"
  on public.proveedores for insert
  with check (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    or (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Solo admin puede actualizar
create policy "proveedores_update_admin"
  on public.proveedores for update
  using (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    or (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Solo admin puede eliminar
create policy "proveedores_delete_admin"
  on public.proveedores for delete
  using (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
    or (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
  );
