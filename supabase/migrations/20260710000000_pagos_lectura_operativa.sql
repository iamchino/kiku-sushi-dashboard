-- ============================================================================
-- KIKU SUSHI — Lectura de pagos para usuarios operativos (ver "cómo pagó")
-- ----------------------------------------------------------------------------
-- CONTEXTO:
--   En Órdenes ahora se muestra el detalle de cómo pagó el cliente (medio de
--   pago, monto, split). Esos datos viven en la tabla `pagos`, cuya única
--   policy es "pagos admin manage" (solo `is_admin()` puede leer/escribir).
--   Si la sesión NO es admin (rol por defecto = 'cocina'), el embed de `pagos`
--   vuelve vacío por RLS y el detalle de pago aparece en blanco.
--
-- QUÉ HACE:
--   Agrega una policy de SOLO LECTURA (SELECT) para usuarios operativos
--   (admin / cocina / mozo) sobre `pagos`. La escritura (INSERT/UPDATE/DELETE)
--   sigue siendo exclusiva de admin (policy "pagos admin manage" intacta).
--
--   El chequeo de rol va INLINE (no depende de is_operational_user(), que en
--   algunas bases no está creada). Las policies se combinan con OR, así que
--   sumar esta no rompe la de admin.
--
-- Idempotente y seguro de re-correr. Supabase → SQL Editor → Run.
-- ============================================================================

alter table public.pagos enable row level security;

drop policy if exists "pagos lectura operativa" on public.pagos;
create policy "pagos lectura operativa"
  on public.pagos
  for select
  to authenticated
  using (
    coalesce(
      nullif(auth.jwt() -> 'app_metadata'  ->> 'role', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
      'cocina'
    ) in ('admin', 'cocina', 'mozo')
  );

notify pgrst, 'reload schema';
