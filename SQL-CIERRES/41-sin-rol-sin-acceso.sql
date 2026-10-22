-- ════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD — Un login sin rol no tiene ningún acceso
-- ════════════════════════════════════════════════════════════════════════════
--
-- El 10/09 un escáner automático creó un usuario por el registro público de
-- Supabase (bee@…oastify.com, sin rol, nunca confirmado). No llegó a nada,
-- pero mostró el riesgo: hasta hoy, current_app_role() trataba a un login
-- SIN rol en app_metadata como 'cocina' (acceso operativo mínimo).
--
-- Desde ahora: sin rol → null, igual que sin sesión. Todos los usuarios
-- reales se crean desde el dashboard con rol asignado (Personal → Usuarios),
-- así que no afecta a nadie. Complemento: en Supabase → Authentication →
-- Providers → Email, apagar "Allow new users to sign up".
--
-- Idempotente. Mantiene la firma y el comportamiento sin sesión de la capa 1.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path to ''
as $$
  -- SOLO app_metadata (user_metadata la escribe el usuario).
  -- Sin sesión → null. Con sesión pero sin rol asignado → null también:
  -- un login que nadie creó desde el dashboard no ve nada.
  select case
    when auth.uid() is null then null
    else nullif(auth.jwt() -> 'app_metadata' ->> 'role', '')
  end
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado, leído de app_metadata. NULL sin sesión y NULL sin rol asignado: solo los logins creados desde el dashboard (con rol) tienen acceso.';

-- Verificación: logins sin rol (tendría que dar 0 filas).
--   select email, created_at from auth.users where coalesce(raw_app_meta_data ->> 'role', '') = '';
