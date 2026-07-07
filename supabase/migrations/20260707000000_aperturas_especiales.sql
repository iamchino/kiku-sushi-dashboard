-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Horarios especiales de apertura (ej. días de partido)
-- ────────────────────────────────────────────────────────────────────────────
-- Saca del código los horarios especiales y los lleva a una tabla que el
-- dashboard puede editar y la web pública lee (clave anon).
--
--   aperturas_especiales:
--     fecha        → día puntual (hora Argentina) con horario distinto
--     canal        → 'takeaway' | 'delivery' | 'ambos'  (a qué aplica)
--     apertura_min → minuto de apertura ese día (13:00 = 780, 17:30 = 1050)
--     activo       → permite desactivar sin borrar
--
-- La web (Pedidos.tsx) usa estas filas para adelantar la apertura del canal
-- indicado ese día. Si no hay fila para una fecha, rige el horario normal
-- (19:30). Al pasar la fecha ya no aplica: no hay que revertir nada.
--
-- Ejecutar desde el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.aperturas_especiales (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  canal        text not null default 'takeaway'
                 check (canal in ('takeaway', 'delivery', 'ambos')),
  apertura_min integer not null check (apertura_min between 0 and 1439),
  nota         text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (fecha, canal)
);

comment on table public.aperturas_especiales is
  'Horarios especiales de apertura por día (ej. días de partido). apertura_min = minuto del día (13:00=780). La web adelanta la apertura del canal indicado.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.aperturas_especiales enable row level security;

-- Lectura pública: la web usa la clave anon para saber el horario del día.
drop policy if exists "aperturas lectura publica" on public.aperturas_especiales;
create policy "aperturas lectura publica"
  on public.aperturas_especiales for select
  to anon, authenticated
  using (true);

-- Escritura solo admin (igual que la config de envío).
drop policy if exists "aperturas admin escribe" on public.aperturas_especiales;
create policy "aperturas admin escribe"
  on public.aperturas_especiales for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Seed: mañana (partido) retiro/takeaway desde las 13:00 ───────────────────
insert into public.aperturas_especiales (fecha, canal, apertura_min, nota)
values ('2026-07-08', 'takeaway', 780, 'Partido Argentina — retiro en local desde 13:00')
on conflict (fecha, canal) do update
  set apertura_min = excluded.apertura_min,
      nota         = excluded.nota,
      activo       = true,
      updated_at   = now();

notify pgrst, 'reload schema';
