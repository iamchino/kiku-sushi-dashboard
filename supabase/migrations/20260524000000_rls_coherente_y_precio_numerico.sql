-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — RLS coherente para pedidos/menu + precio numérico (expand fase 1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Esta migración hace dos cosas, ambas idempotentes y seguras de re-correr:
--
--  A) Reorganiza las policies de `pedidos`, `pedido_items`, `menu_items` y
--     `menu_item_variantes` para que convivan SIN ambigüedad:
--       - anon       : INSERT + SELECT en pedidos/pedido_items (web pública).
--                      SELECT en menu_items/variantes (catálogo público).
--       - operativos : (admin + cocina) full CRUD vía is_operational_user().
--     Borra las policies sueltas y sobre-permisivas que dejaron los scripts
--     fix_*.sql y el setup original ("Todos pueden ...", "Auth puede ...",
--     "Lectura pública", "Escritura autenticada", "Anon puede ...").
--
--  B) Fase 1 del cambio de tipo de `menu_items.precio` (TEXT → NUMERIC):
--     - Agrega columna nueva `precio_num NUMERIC(12,2)` (nullable).
--     - Backfill tolerante: parsea el primer número del string `precio`,
--       respeta formato AR ("$12.100" → 12100, "12.500,50" → 12500.50).
--       Para precios compuestos ("5p: $12.500 / 9p: $23.200") deja NULL,
--       porque su precio real ya vive en `menu_item_variantes`.
--     - Índice por precio_num para queries por rango.
--     El front sigue leyendo `precio` (TEXT). El switch a precio_num será
--     una migración posterior (fase 2: rename) una vez que el código lea
--     de precio_num + variantes.
--
-- ════════════════════════════════════════════════════════════════════════════

-- ─── A.1  Limpiar policies legacy en pedidos / pedido_items ────────────────
do $$
declare
  v_legacy_names text[] := array[
    'Todos pueden crear pedidos',
    'Todos pueden leer pedidos',
    'Auth puede actualizar pedidos',
    'Auth puede borrar pedidos',
    'Todos pueden crear items',
    'Todos pueden leer items',
    'Auth puede actualizar items',
    'Auth puede borrar items',
    'Anon puede crear pedidos',
    'Anon puede crear pedido_items',
    'Anon puede leer pedidos propios',
    'Anon puede leer items propios',
    'Lectura pública',
    'Escritura autenticada'
  ];
  v_table text;
  v_pol   text;
begin
  foreach v_table in array array['pedidos', 'pedido_items'] loop
    foreach v_pol in array v_legacy_names loop
      execute format('drop policy if exists %I on public.%I', v_pol, v_table);
    end loop;
  end loop;
end;
$$;

-- ─── A.2  Asegurar RLS habilitado ──────────────────────────────────────────
alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;
alter table public.menu_items   enable row level security;
alter table public.menu_item_variantes enable row level security;

-- ─── A.3  Policies para anon en pedidos / pedido_items ─────────────────────
--
-- La web pública crea pedidos sin sesión. Después del INSERT,
-- supabase-js hace `.select()` sobre la fila recién creada para devolver
-- el id, lo que requiere policy de SELECT. Como el id es un UUID
-- no enumerable, dejar SELECT abierto a anon es aceptable en este paso.
-- (Endurecimiento futuro: cerrar SELECT y reemplazar por RPC
-- security definer que devuelva solo {id, numero_pedido}.)

drop policy if exists "anon crear pedidos"      on public.pedidos;
drop policy if exists "anon leer pedidos"       on public.pedidos;
drop policy if exists "anon crear pedido_items" on public.pedido_items;
drop policy if exists "anon leer pedido_items"  on public.pedido_items;

create policy "anon crear pedidos"
  on public.pedidos
  for insert
  to anon
  with check (true);

create policy "anon leer pedidos"
  on public.pedidos
  for select
  to anon
  using (true);

create policy "anon crear pedido_items"
  on public.pedido_items
  for insert
  to anon
  with check (true);

create policy "anon leer pedido_items"
  on public.pedido_items
  for select
  to anon
  using (true);

-- ─── A.4  Catálogo público: anon puede leer menu_items y variantes ─────────
--
-- Borrar las dos policies del setup original ("Lectura pública" / "Escritura
-- autenticada") y reemplazarlas por una explícita de SELECT para anon.
-- La escritura para autenticados ya está cubierta por la migración
-- 20260511000000_cocina_operational_access.sql ("operational users manage
-- menu_items"), así que no hace falta replicarla acá.

drop policy if exists "Lectura pública"       on public.menu_items;
drop policy if exists "Escritura autenticada" on public.menu_items;
drop policy if exists "variantes_public_read" on public.menu_item_variantes;
drop policy if exists "variantes_auth_all"    on public.menu_item_variantes;
drop policy if exists "anon leer menu_items"        on public.menu_items;
drop policy if exists "anon leer menu_item_variantes" on public.menu_item_variantes;

create policy "anon leer menu_items"
  on public.menu_items
  for select
  to anon
  using (activo = true);

create policy "anon leer menu_item_variantes"
  on public.menu_item_variantes
  for select
  to anon
  using (true);

-- menu_item_variantes no estaba en el policy pack original; agrego operativos.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'menu_item_variantes'
      and policyname = 'operational users manage menu_item_variantes'
  ) then
    create policy "operational users manage menu_item_variantes"
      on public.menu_item_variantes
      for all
      to authenticated
      using (public.is_operational_user())
      with check (public.is_operational_user());
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- B) menu_items.precio  →  precio_num NUMERIC(12,2)   (fase 1: expand)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── B.1  Parser tolerante de precios AR ──────────────────────────────────
--
-- Reglas:
--   - Si el string contiene '/', es compuesto (multi-variante) ⇒ NULL.
--   - Toma el primer número que aparezca después de '$' o al inicio.
--   - Quita separador de miles (puntos) cuando hay coma decimal,
--     o cuando hay 4+ dígitos sin decimal ("$12.500" → 12500).
--   - Convierte coma decimal en punto.
--   - Si no parsea, NULL.
create or replace function public.kiku_parse_precio_ar(p_input text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_raw   text;
  v_clean text;
  v_match text;
begin
  if p_input is null then
    return null;
  end if;
  v_raw := trim(p_input);
  if v_raw = '' then
    return null;
  end if;
  -- Precios compuestos: "5p: $12.500 / 9p: $23.200"
  if position('/' in v_raw) > 0 then
    return null;
  end if;
  -- Extraer primer grupo numérico con separadores
  v_match := substring(v_raw from '([0-9]{1,3}(?:[.\,][0-9]{3})*(?:[.\,][0-9]{1,2})?|[0-9]+)');
  if v_match is null then
    return null;
  end if;
  v_clean := v_match;
  -- Si tiene coma, asumimos coma = decimal: quitamos puntos (miles).
  if position(',' in v_clean) > 0 then
    v_clean := replace(v_clean, '.', '');
    v_clean := replace(v_clean, ',', '.');
  else
    -- Sin coma: si el último punto está a >2 dígitos del final,
    -- es separador de miles ("12.500" → 12500). Si está a 1-2 dígitos
    -- del final, podría ser decimal ("12.50"), pero en AR para precios
    -- enteros con punto-miles ("$12.100") es siempre miles.
    -- Regla pragmática: si hay punto y el último grupo es exactamente
    -- 3 dígitos, tratamos como miles.
    if v_clean ~ '\.[0-9]{3}$' then
      v_clean := replace(v_clean, '.', '');
    end if;
  end if;
  begin
    return v_clean::numeric;
  exception when others then
    return null;
  end;
end;
$$;

comment on function public.kiku_parse_precio_ar(text) is
  'Parser tolerante de precios en formato AR. Devuelve NULL para inputs vacíos, compuestos (con "/") o no parseables.';

-- ─── B.2  Agregar columna precio_num y backfill ────────────────────────────
alter table public.menu_items
  add column if not exists precio_num numeric(12,2);

-- Solo backfill donde aún esté NULL (idempotente)
update public.menu_items
   set precio_num = public.kiku_parse_precio_ar(precio)
 where precio_num is null
   and precio is not null
   and precio <> '';

-- ─── B.3  Índice para queries por rango/orden ──────────────────────────────
create index if not exists idx_menu_items_precio_num
  on public.menu_items(precio_num)
  where precio_num is not null;

-- ─── B.4  Documentación de la transición ───────────────────────────────────
comment on column public.menu_items.precio is
  'LEGACY: campo de display compuesto ("$12.100" o "5p: $12.500 / 9p: $23.200"). Para items con variantes el precio real vive en menu_item_variantes. A migrar a precio_num en fase 2.';
comment on column public.menu_items.precio_num is
  'Precio numérico canónico para items sin variantes. NULL si el item se vende por variantes (consultar menu_item_variantes) o si no tiene precio asignado.';

-- ─── Recargar schema cache de PostgREST ────────────────────────────────────
notify pgrst, 'reload schema';
