-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Especiales: columnas del botón + admin con acceso TOTAL
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contexto: delivery ya deja crear (su policy operativa quedó OK). Especiales
-- sigue fallando porque el dashboard ahora manda columnas nuevas del botón
-- (cta_tipo, cta_producto_id, cta_url, cta_label) que todavía no existen en la
-- tabla → toda alta/edición de especial falla.
--
-- Este script, idempotente y seguro de re-correr:
--   1. Asegura las funciones de rol.
--   2. Crea las columnas del botón en `especiales`.
--   3. Garantiza RLS + policies (operativa y de lectura) en especiales/pasos.
--   4. Le da al ADMIN acceso total (CRUD) a TODAS las tablas del esquema public.
--
-- Pegar tal cual en Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Funciones de rol (por si faltara alguna) ────────────────────────────

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

create or replace function public.is_operational_user()
returns boolean language sql stable as $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

grant execute on function public.current_app_role()    to authenticated;
grant execute on function public.is_admin()            to authenticated;
grant execute on function public.is_operational_user() to authenticated;

-- ─── 2. Columnas del botón en especiales (la causa del fallo actual) ────────

alter table public.especiales
  add column if not exists cta_tipo        text,
  add column if not exists cta_producto_id uuid,
  add column if not exists cta_url         text,
  add column if not exists cta_label       text;

update public.especiales set cta_tipo = 'reservar' where cta_tipo is null;
alter table public.especiales alter column cta_tipo set default 'reservar';
alter table public.especiales alter column cta_tipo set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'especiales_cta_tipo_check') then
    alter table public.especiales
      add constraint especiales_cta_tipo_check
      check (cta_tipo in ('reservar', 'pedir', 'link'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'especiales_cta_producto_fk') then
    alter table public.especiales
      add constraint especiales_cta_producto_fk
      foreign key (cta_producto_id) references public.menu_items(id) on delete set null;
  end if;
end;
$$;

-- ─── 3. Policies de especiales / especial_pasos (garantizadas) ──────────────

do $kiku$
begin
  -- especiales
  if to_regclass('public.especiales') is not null then
    alter table public.especiales enable row level security;

    drop policy if exists "operational users manage especiales" on public.especiales;
    create policy "operational users manage especiales"
      on public.especiales for all to authenticated
      using (public.is_operational_user()) with check (public.is_operational_user());

    drop policy if exists "anon leer especiales (web)" on public.especiales;
    create policy "anon leer especiales (web)"
      on public.especiales for select to anon using (activo = true);
  end if;

  -- especial_pasos
  if to_regclass('public.especial_pasos') is not null then
    alter table public.especial_pasos enable row level security;

    drop policy if exists "operational users manage especial_pasos" on public.especial_pasos;
    create policy "operational users manage especial_pasos"
      on public.especial_pasos for all to authenticated
      using (public.is_operational_user()) with check (public.is_operational_user());

    drop policy if exists "anon leer especial_pasos (web)" on public.especial_pasos;
    create policy "anon leer especial_pasos (web)"
      on public.especial_pasos for select to anon using (exists (
        select 1 from public.especiales e
        where e.id = especial_id and e.activo = true
      ));
  end if;
end;
$kiku$;

-- ─── 4. ADMIN con acceso TOTAL a todas las tablas de public ─────────────────
-- Agrega una policy permisiva "admin full access" en cada tabla del esquema.
-- · En tablas con RLS activado → el admin puede hacer TODO (las demás policies
--   se mantienen, se evalúan con OR).
-- · En tablas con RLS desactivado → la policy queda inerte (ya hay acceso total).
-- No tocamos el flag de RLS, así no rompemos lecturas públicas existentes.

do $kiku$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop policy if exists "admin full access" on public.%I', r.tablename);
    execute format($p$
      create policy "admin full access" on public.%1$I
        for all to authenticated
        using (public.is_admin()) with check (public.is_admin())
    $p$, r.tablename);
  end loop;
end;
$kiku$;

-- ─── 5. Recargar schema cache ───────────────────────────────────────────────
notify pgrst, 'reload schema';

-- ─── 6. Diagnóstico ─────────────────────────────────────────────────────────
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'especiales'
  and column_name like 'cta_%'
order by column_name;
