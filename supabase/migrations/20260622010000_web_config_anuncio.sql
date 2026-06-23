-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Config de la web pública (barra de anuncio / "segundo header")
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tabla única (id=1) con la configuración editable de la web pública. Por ahora:
--   • anuncio_texto  : el mensaje de la barra superior
--                      (ej. "15% de descuento en toda la carta pagando en efectivo")
--   • anuncio_activo : si se muestra o no esa barra
--
-- La web lee esta config con la clave anon (lectura pública). Solo admin la edita,
-- desde el dashboard en /menu → tab "Banner web".
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.web_config (
  id             integer primary key default 1,
  anuncio_texto  text,
  anuncio_activo boolean not null default false,
  updated_at     timestamptz not null default now(),
  constraint web_config_singleton check (id = 1)
);

comment on table public.web_config is
  'Configuración editable de la web pública (fila única id=1). Barra de anuncio, etc.';

-- Seed: fila única con un texto de ejemplo, oculta por defecto.
insert into public.web_config (id, anuncio_texto, anuncio_activo)
values (1, '15% de descuento en toda la carta pagando en efectivo', false)
on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.web_config enable row level security;

drop policy if exists "web_config lectura publica" on public.web_config;
create policy "web_config lectura publica"
  on public.web_config for select
  to anon, authenticated
  using (true);

drop policy if exists "web_config admin escribe" on public.web_config;
create policy "web_config admin escribe"
  on public.web_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
