-- ============================================================
-- Migración: acceso exclusivo a Finanzas
--   La sección Finanzas (tablas empleados / egresos) es exclusiva
--   del/los usuario(s) de finanzas. Los demás admin (p. ej. el dueño)
--   NO pueden leerla ni escribirla.
--
--   El control es por EMAIL del usuario autenticado, no por rol, así
--   el usuario de finanzas puede seguir siendo 'admin' (acceso total
--   al resto del sistema) y aun así ser el único con Finanzas.
-- ============================================================

create or replace function public.is_finanzas_user()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'finanzas@kikusushi.com.ar'
    -- agregá acá más emails si en el futuro otra persona necesita Finanzas
  )
$$;

grant execute on function public.is_finanzas_user() to authenticated;

comment on function public.is_finanzas_user() is
  'True si el email del JWT está habilitado para la sección Finanzas (egresos/empleados).';

-- ── EMPLEADOS: reemplazar política admin por política por email ───────────────
drop policy if exists "empleados admin manage" on public.empleados;
drop policy if exists "empleados finanzas manage" on public.empleados;
create policy "empleados finanzas manage"
  on public.empleados
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- ── EGRESOS: ídem ─────────────────────────────────────────────────────────────
drop policy if exists "egresos admin manage" on public.egresos;
drop policy if exists "egresos finanzas manage" on public.egresos;
create policy "egresos finanzas manage"
  on public.egresos
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

notify pgrst, 'reload schema';
