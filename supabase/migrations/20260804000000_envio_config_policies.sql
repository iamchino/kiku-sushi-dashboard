-- ============================================================================
-- Fase 0 (addendum) — envio_config / envio_zonas leían user_metadata
--
--   La verificación posterior a la fase 0 encontró que en la base productiva
--   estas dos tablas tienen policies que leen user_metadata, distintas de lo
--   que dicen las migraciones del repo (20260622000000 las define con
--   is_admin()). Alguien las aplicó a mano en algún momento y el repo quedó
--   desincronizado de la base.
--
--   user_metadata lo escribe el propio usuario desde el navegador con
--   supabase.auth.updateUser(), así que cualquiera con un login podía
--   cambiar los costos y las zonas de delivery.
--
--   Esta migración es auto-reparadora: borra CUALQUIER policy de esas dos
--   tablas que mencione user_metadata, sin importar cómo se llame, y deja las
--   canónicas. Avisa por NOTICE qué borró, para que quede rastro.
--
--   Criterio de acceso (el mismo que ya declaraba 20260622000000):
--     · lectura pública  → la carta web necesita los costos de envío
--     · escritura admin  → solo el rol admin
-- ============================================================================

do $$
declare
  r record;
  borradas int := 0;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('envio_config', 'envio_zonas')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%user_metadata%'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'Policy insegura eliminada: "%" en public.%', r.policyname, r.tablename;
    borradas := borradas + 1;
  end loop;

  if borradas = 0 then
    raise notice 'No había policies con user_metadata en envio_config / envio_zonas.';
  end if;
end $$;

-- ─── Policies canónicas (idempotentes) ──────────────────────────────────────

drop policy if exists "envio_config lectura publica" on public.envio_config;
create policy "envio_config lectura publica"
  on public.envio_config for select
  to anon, authenticated
  using (true);

drop policy if exists "envio_config admin escribe" on public.envio_config;
create policy "envio_config admin escribe"
  on public.envio_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "envio_zonas lectura publica" on public.envio_zonas;
create policy "envio_zonas lectura publica"
  on public.envio_zonas for select
  to anon, authenticated
  using (true);

drop policy if exists "envio_zonas admin escribe" on public.envio_zonas;
create policy "envio_zonas admin escribe"
  on public.envio_zonas for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Red de seguridad: que no quede ninguna otra ────────────────────────────
-- Si después de todo esto sigue habiendo alguna policy con user_metadata en
-- CUALQUIER tabla de public, abortamos: es la clase de agujero que no se puede
-- dejar pasar en silencio, y el mensaje dice exactamente dónde está.
do $$
declare
  restantes text;
begin
  select string_agg(tablename || '.' || policyname, ', ')
    into restantes
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%user_metadata%';

  if restantes is not null then
    raise exception
      'Todavía hay policies que leen user_metadata (escribible por el propio usuario): %. '
      'Revisalas con: select tablename, policyname, qual, with_check from pg_policies '
      'where schemaname = ''public'' and (coalesce(qual,'''')||coalesce(with_check,'''')) like ''%%user_metadata%%'';',
      restantes;
  end if;
end $$;

notify pgrst, 'reload schema';
