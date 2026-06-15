-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — FIX: faltan las funciones de rol y las policies de escritura
-- ════════════════════════════════════════════════════════════════════════════
--
-- SÍNTOMA: "new row violates row-level security policy" al crear desde el
--          dashboard tanto ESPECIALES como PRODUCTOS de delivery/take.
--          Y al correr el fix de especiales: "Falta la función
--          public.is_operational_user()".
--
-- CAUSA:   en esta base nunca se aplicaron las migraciones que crean las
--          funciones de rol (current_app_role, is_operational_user, …) ni las
--          policies de escritura operativa. RLS está activado y solo existen
--          las policies de lectura, así que toda escritura directa a las tablas
--          (menu_items, especiales, …) se rechaza. La carta se venía cargando
--          por SQL directo (service role), que saltea RLS — por eso no saltaba.
--
-- QUÉ HACE este script (idempotente, seguro de re-correr):
--   1. Crea/actualiza las funciones de rol.
--   2. Activa RLS y crea la policy de escritura operativa en cada tabla
--      operativa que exista.
--   3. Asegura lectura pública (anon) en el catálogo y los especiales.
--
-- Pegar tal cual en Supabase Studio → SQL Editor → Run.
-- (Reemplaza al script 20260615000000_fix_rls_especiales_escritura.sql.)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Funciones de rol ────────────────────────────────────────────────────

create or replace function public.current_app_role()
returns text language sql stable as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    'cocina'
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_mozo()
returns boolean language sql stable as $$
  select public.current_app_role() = 'mozo'
$$;

create or replace function public.is_operational_user()
returns boolean language sql stable as $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

create or replace function public.puede_cobrar()
returns boolean language sql stable as $$
  select public.current_app_role() in ('admin', 'mozo')
$$;

grant execute on function public.current_app_role()    to authenticated;
grant execute on function public.is_admin()            to authenticated;
grant execute on function public.is_mozo()             to authenticated;
grant execute on function public.is_operational_user() to authenticated;
grant execute on function public.puede_cobrar()        to authenticated;

-- ─── 2. Policies de escritura operativa (admin + cocina + mozo) ──────────────
-- Loop con guarda: solo toca las tablas que existan. Idempotente.

do $kiku$
declare
  v_table text;
begin
  foreach v_table in array array[
    'pedidos',
    'pedido_items',
    'stock',
    'stock_movimientos',
    'menu_items',
    'menu_item_variantes',
    'recetas',
    'receta_ingredientes',
    'combos',
    'combo_items',
    'produccion_listas',
    'produccion_tareas',
    'especiales',
    'especial_pasos'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise notice 'Salteando tabla inexistente public.%', v_table;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);

    execute format('drop policy if exists "operational users manage %1$s" on public.%1$I', v_table);
    execute format($p$
      create policy "operational users manage %1$s"
        on public.%1$I
        for all
        to authenticated
        using (public.is_operational_user())
        with check (public.is_operational_user())
    $p$, v_table);
  end loop;
end;
$kiku$;

-- ─── 3. Lectura pública (anon) del catálogo y los especiales ────────────────
-- Necesaria para la web pública (carta de delivery + especiales). Son policies
-- aparte de las de escritura; agregarlas no rompe las de lectura ya existentes
-- (varias policies SELECT para anon se evalúan con OR).

do $kiku$
begin
  if to_regclass('public.menu_items') is not null then
    drop policy if exists "anon leer menu_items (catalogo)" on public.menu_items;
    create policy "anon leer menu_items (catalogo)"
      on public.menu_items for select to anon using (activo = true);
  end if;

  if to_regclass('public.menu_item_variantes') is not null then
    drop policy if exists "anon leer menu_item_variantes (catalogo)" on public.menu_item_variantes;
    create policy "anon leer menu_item_variantes (catalogo)"
      on public.menu_item_variantes for select to anon using (true);
  end if;

  if to_regclass('public.especiales') is not null then
    drop policy if exists "anon leer especiales (web)" on public.especiales;
    create policy "anon leer especiales (web)"
      on public.especiales for select to anon using (activo = true);
  end if;

  if to_regclass('public.especial_pasos') is not null then
    drop policy if exists "anon leer especial_pasos (web)" on public.especial_pasos;
    create policy "anon leer especial_pasos (web)"
      on public.especial_pasos for select to anon using (exists (
        select 1 from public.especiales e
        where e.id = especial_id and e.activo = true
      ));
  end if;
end;
$kiku$;

-- ─── 4. Recargar el schema cache de PostgREST ───────────────────────────────
notify pgrst, 'reload schema';

-- ─── 5. Diagnóstico: funciones y policies resultantes ───────────────────────
select 'función' as tipo, proname as nombre
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('current_app_role','is_admin','is_mozo','is_operational_user','puede_cobrar')
union all
select 'policy ' || tablename, policyname
from pg_policies
where tablename in ('menu_items','menu_item_variantes','especiales','especial_pasos')
order by 1, 2;
