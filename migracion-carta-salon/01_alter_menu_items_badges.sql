-- ============================================================
-- 01 · Badges en menu_items  (picante / vegano / vegetariano / sin_tacc)
-- Ejecutar UNA vez en Supabase -> SQL Editor.
-- Seguro de re-correr (IF NOT EXISTS).
-- ============================================================
alter table public.menu_items
  add column if not exists picante      smallint not null default 0,
  add column if not exists vegano       boolean  not null default false,
  add column if not exists vegetariano  boolean  not null default false,
  add column if not exists sin_tacc     boolean  not null default false;

-- picante: 0 = no pica · 1 = Leve · 2 = Medio · 3 = Muy Picante
alter table public.menu_items drop constraint if exists menu_items_picante_chk;
alter table public.menu_items
  add constraint menu_items_picante_chk check (picante between 0 and 3);

comment on column public.menu_items.picante     is '0 ninguno · 1 Leve · 2 Medio · 3 Muy Picante';
comment on column public.menu_items.vegano      is 'Apto vegano (icono veggie verde)';
comment on column public.menu_items.vegetariano is 'Apto vegetariano';
comment on column public.menu_items.sin_tacc    is 'Sin TACC (apto celíacos)';
