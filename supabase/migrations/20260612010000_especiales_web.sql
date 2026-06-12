-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Especiales de la web pública (editables desde el dashboard)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Los "Especiales de Kiku" (Umami del Sur, Pacífico y Patagonia, Pasta Nikkei)
-- estaban hardcodeados en la web (`EspecialesSection.tsx`). Esta migración crea:
--
--   - `especiales`      : un especial por fila (título, kanji, precio, imagen…).
--   - `especial_pasos`  : pasos del especial (Entrada / Principal / Maridaje),
--                         con lista opcional de rolls en `items` (jsonb).
--
-- RLS (mismo patrón que menu_items):
--   - anon          : SELECT solo de activos (web pública).
--   - operativos    : full CRUD vía is_operational_user() (dashboard).
--
-- Seed: los 3 especiales actuales con sus textos exactos, para que la web
-- no cambie de contenido al hacer el switch. Idempotente (on conflict).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tablas ──────────────────────────────────────────────────────────────

create table if not exists public.especiales (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,            -- ancla DOM + mapeo de imagen local
  orden         int  not null default 0,
  activo        boolean not null default true,   -- disponibilidad on/off
  experiencia   text not null,                   -- id del form de reservas (?experiencia=)
  numero        text,                            -- "01", "02"...
  overline      text,                            -- kanji decorativo
  titulo        text not null,
  titulo_acento text,                            -- parte con gradiente ("del Sur")
  descripcion   text,
  precio        numeric(12,2),                   -- la web formatea "$39.500"
  precio_nota   text,                            -- "por persona"
  firma         text,                            -- "— Chef Selection · ... —"
  imagen_url    text,                            -- Storage; NULL → asset local por slug
  imagen_alt    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.especial_pasos (
  id          uuid primary key default gen_random_uuid(),
  especial_id uuid not null references public.especiales(id) on delete cascade,
  orden       int  not null default 0,
  etiqueta    text not null,                     -- "Entrada" / "Principal" / "Maridaje"
  texto       text not null,
  items       jsonb not null default '[]'::jsonb, -- [{ "roll": "...", "detalle": "..." }]
  unique (especial_id, orden)
);

create index if not exists idx_especial_pasos_especial
  on public.especial_pasos(especial_id, orden);

-- ─── 2. updated_at automático ──────────────────────────────────────────────

create or replace function public.kiku_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_especiales_touch on public.especiales;
create trigger trg_especiales_touch
  before update on public.especiales
  for each row execute function public.kiku_touch_updated_at();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

alter table public.especiales     enable row level security;
alter table public.especial_pasos enable row level security;

drop policy if exists "anon leer especiales" on public.especiales;
create policy "anon leer especiales"
  on public.especiales
  for select
  to anon
  using (activo = true);

drop policy if exists "operational users manage especiales" on public.especiales;
create policy "operational users manage especiales"
  on public.especiales
  for all
  to authenticated
  using (public.is_operational_user())
  with check (public.is_operational_user());

drop policy if exists "anon leer especial_pasos" on public.especial_pasos;
create policy "anon leer especial_pasos"
  on public.especial_pasos
  for select
  to anon
  using (exists (
    select 1 from public.especiales e
    where e.id = especial_id and e.activo = true
  ));

drop policy if exists "operational users manage especial_pasos" on public.especial_pasos;
create policy "operational users manage especial_pasos"
  on public.especial_pasos
  for all
  to authenticated
  using (public.is_operational_user())
  with check (public.is_operational_user());

-- ─── 4. Seed: los 3 especiales actuales ─────────────────────────────────────
-- UUIDs fijos para idempotencia y para poder sembrar los pasos.

insert into public.especiales
  (id, slug, orden, activo, experiencia, numero, overline, titulo, titulo_acento,
   descripcion, precio, precio_nota, firma, imagen_url, imagen_alt)
values
  (
    'c0ffee00-0000-4000-a000-000000000001', 'umami', 0, true,
    'umami_del_sur', '01', '— 南の旨味 —', 'Umami', 'del Sur',
    'Una experiencia de pasos donde el mar toma protagonismo. Los sabores se vuelven más profundos, cada paso está pensado para sorprender.',
    39500, 'por persona', null, null,
    'Especial Umami — pasos de mar con maridaje'
  ),
  (
    'c0ffee00-0000-4000-a000-000000000002', 'pacifico', 1, true,
    'pacifico_y_patagonia', '02', '— 太平洋 と パタゴニア —', 'Pacífico', 'y Patagonia',
    'El mar en cada paso: de la costa peruana a los fríos del sur, con maridaje by Viñas Las Perdices.',
    39500, 'por persona', null, null,
    'Especial Pacífico y Patagonia — rolls con maridaje'
  ),
  (
    'c0ffee00-0000-4000-a000-000000000003', 'pasta-nikkei', 2, true,
    'pasta_nikkei', '03', '— 日系 パスタ —', 'Pasta Nikkei', 'del Atlántico',
    'Pasta negra con tinta de calamar, crema suave de miso, mejillones y langostinos salteados, terminada con aceite picante y crocante de almendras.',
    30000, 'por persona', null, null,
    'Pasta Nikkei del Atlántico — pasta negra con mejillones y langostinos'
  )
on conflict (slug) do nothing;

insert into public.especial_pasos (especial_id, orden, etiqueta, texto, items)
values
  -- Umami del Sur
  ('c0ffee00-0000-4000-a000-000000000001', 0, 'Entrada',
   'Ostras gratinadas en emulsión de manteca, lima y parmesano.', '[]'),
  ('c0ffee00-0000-4000-a000-000000000001', 1, 'Principal',
   '15 piezas de autor.',
   '[
      {"roll": "Centolla roll",   "detalle": "shiromi furai y palta, coronado con centolla y mayo nipona."},
      {"roll": "Maki de vieiras", "detalle": "salmón, rúcula y pepino en juliana, coronado de tartar de vieiras y emulsión cítrica."},
      {"roll": "Ebi furai roll",  "detalle": "langostinos furai y queso crema, chimi nipón, coronado con crocante de boniato."}
    ]'),
  ('c0ffee00-0000-4000-a000-000000000001', 2, 'Maridaje',
   'Albariño y Riesling de Viña las Perdices.', '[]'),
  -- Pacífico y Patagonia
  ('c0ffee00-0000-4000-a000-000000000002', 0, 'Entrada',
   'Causa limeña con navajas del Sur.', '[]'),
  ('c0ffee00-0000-4000-a000-000000000002', 1, 'Principal',
   '15 piezas de sushi.',
   '[
      {"roll": "Huancaína roll", "detalle": "langostinos furai y palta, semicubierto de salmón, salsa huancaína y polvo de aceituna."},
      {"roll": "Maguro roll",    "detalle": "tartar de atún rojo y paltas selladas, semicubierto de salmón, salsa brava."},
      {"roll": "Ceviche roll",   "detalle": "langostinos furai y queso crema, coronado con ceviche confitado de langostinos australes y pesca blanca, con notas cítricas."}
    ]'),
  ('c0ffee00-0000-4000-a000-000000000002', 2, 'Maridaje',
   'Albariño y Riesling de Viña las Perdices.', '[]')
on conflict (especial_id, orden) do nothing;

-- ─── 5. Recargar schema cache de PostgREST ──────────────────────────────────
notify pgrst, 'reload schema';
