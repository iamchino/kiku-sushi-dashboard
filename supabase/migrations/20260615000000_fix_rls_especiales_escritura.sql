-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — FIX: escritura de especiales bloqueada por RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- SÍNTOMA: al crear/editar un especial desde el dashboard aparece
--          "new row violates row-level security policy".
--
-- CAUSA:   la tabla `especiales` (y `especial_pasos`) tiene RLS activado pero
--          le falta la policy de ESCRITURA para usuarios operativos. Quedó solo
--          el SELECT de `anon`, así que cualquier INSERT/UPDATE/DELETE se rechaza.
--          (En `menu_items` esa policy sí existe — por eso ahí sí podés crear
--          productos. Acá replicamos el mismo patrón.)
--
-- Quién puede escribir: admin, cocina y mozo, vía public.is_operational_user().
-- (current_app_role() cae a 'cocina' por defecto, así que todo usuario logueado
--  del dashboard queda como operativo.)
--
-- Idempotente y seguro de re-correr. Pegar tal cual en
-- Supabase Studio → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0. Guardas: tablas y helper deben existir ──────────────────────────────
do $$
begin
  if to_regclass('public.especiales') is null then
    raise exception 'Falta la tabla public.especiales. Corré antes la migración 20260612010000_especiales_web.sql';
  end if;
  if to_regproc('public.is_operational_user()') is null then
    raise exception 'Falta la función public.is_operational_user(). Corré antes 20260611000000_rol_mozo.sql (o cocina_operational_access).';
  end if;
end;
$$;

-- ─── 1. Asegurar RLS activado ───────────────────────────────────────────────
alter table public.especiales     enable row level security;
alter table public.especial_pasos enable row level security;

-- ─── 2. (Re)crear las policies — esto es lo que faltaba ─────────────────────

-- especiales: anon lee solo activos
drop policy if exists "anon leer especiales" on public.especiales;
create policy "anon leer especiales"
  on public.especiales
  for select
  to anon
  using (activo = true);

-- especiales: operativos hacen CRUD completo  ← LA QUE FALTABA
drop policy if exists "operational users manage especiales" on public.especiales;
create policy "operational users manage especiales"
  on public.especiales
  for all
  to authenticated
  using (public.is_operational_user())
  with check (public.is_operational_user());

-- especial_pasos: anon lee los pasos de especiales activos
drop policy if exists "anon leer especial_pasos" on public.especial_pasos;
create policy "anon leer especial_pasos"
  on public.especial_pasos
  for select
  to anon
  using (exists (
    select 1 from public.especiales e
    where e.id = especial_id and e.activo = true
  ));

-- especial_pasos: operativos hacen CRUD completo
drop policy if exists "operational users manage especial_pasos" on public.especial_pasos;
create policy "operational users manage especial_pasos"
  on public.especial_pasos
  for all
  to authenticated
  using (public.is_operational_user())
  with check (public.is_operational_user());

-- ─── 3. Asegurar permiso de ejecución del helper ────────────────────────────
grant execute on function public.is_operational_user() to authenticated;

-- ─── 4. Recargar el schema cache de PostgREST ───────────────────────────────
notify pgrst, 'reload schema';

-- ─── 5. Diagnóstico: verás las policies resultantes en el output ────────────
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('especiales', 'especial_pasos')
order by tablename, policyname;
