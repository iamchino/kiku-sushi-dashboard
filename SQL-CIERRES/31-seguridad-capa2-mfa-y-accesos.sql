-- ════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD · CAPA 2 — Segundo factor obligatorio y registro de accesos
--
-- · Los roles listados en private.config.mfa_roles (admin, finanzas) solo
--   cuentan como tales si la sesión pasó el segundo factor (JWT con
--   aal = 'aal2'). Con contraseña sola, la base los trata como "sin rol":
--   ninguna policy ni RPC les responde. El dashboard detecta eso y muestra
--   la pantalla de activar/ingresar el código (MfaGate.jsx).
-- · log_accesos(): últimos ingresos, salidas y verificaciones de 2FA, para
--   la pantalla Personal › Usuarios. Solo admin y finanzas.
--
-- Requisito en Supabase: Authentication → Multi-Factor → TOTP habilitado.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Qué roles exigen 2FA (editable sin tocar código) ─────────────────────
insert into private.config (clave, valor) values ('mfa_roles', 'admin,finanzas')
on conflict (clave) do nothing;

-- Lista de roles con 2FA obligatorio. La lee el dashboard para saber si tiene
-- que pedir el código; no revela nada sensible.
create or replace function public.mfa_roles()
returns text[]
language sql
stable
security definer
set search_path to 'private', 'pg_temp'
as $$
  select coalesce(
    (select string_to_array(regexp_replace(valor, '\s', '', 'g'), ',')
       from private.config where clave = 'mfa_roles'),
    array['admin', 'finanzas']
  )
$$;
revoke execute on function public.mfa_roles() from public, anon;
grant  execute on function public.mfa_roles() to authenticated, service_role;

-- ── 2) El rol solo vale con el segundo factor hecho ─────────────────────────
create or replace function public.current_app_role()
returns text
language sql
stable
set search_path to ''
as $$
  -- SOLO app_metadata (user_metadata la escribe el usuario). Sin sesión → null.
  -- Un rol que exige 2FA y todavía está en aal1 → null: la base no le
  -- responde hasta que ingrese el código. Usuario logueado sin rol → cocina.
  select case
    when auth.uid() is null then null
    when coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina') = any (public.mfa_roles())
         and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
      then null
    else coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
  end
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado (app_metadata). NULL sin sesión, y NULL para roles con 2FA obligatorio (mfa_roles) mientras la sesión no sea aal2.';

-- Rol "crudo" del JWT, sin la exigencia de 2FA. Lo usa el dashboard para
-- decidir si mostrar la pantalla de 2FA (necesita saber que sos admin aunque
-- todavía no hayas puesto el código).
create or replace function public.rol_declarado()
returns text
language sql
stable
set search_path to ''
as $$
  select case when auth.uid() is null then null
              else coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina') end
$$;
revoke execute on function public.rol_declarado() from public, anon;
grant  execute on function public.rol_declarado() to authenticated, service_role;

-- ── 3) Registro de accesos ──────────────────────────────────────────────────
create or replace function public.log_accesos(p_limit int default 200)
returns table (
  cuando      timestamptz,
  accion      text,
  email       text,
  ip          text,
  detalle     text
)
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select
    e.created_at,
    case e.payload ->> 'action'
      when 'login'                   then 'Ingreso'
      when 'logout'                  then 'Salida'
      when 'mfa_challenge_verified'  then '2FA verificado'
      when 'factor_in_progress'      then '2FA: inicio de alta'
      when 'factor_verified'         then '2FA activado'
      when 'factor_deleted'          then '2FA desactivado'
      when 'user_recovery_requested' then 'Pidió recuperar contraseña'
      when 'user_updated_password'   then 'Cambió la contraseña'
      when 'user_signedup'           then 'Usuario creado'
      when 'user_deleted'            then 'Usuario borrado'
      when 'user_modified'           then 'Usuario modificado'
      else e.payload ->> 'action'
    end,
    coalesce(e.payload ->> 'actor_username', e.payload -> 'traits' ->> 'user_email', ''),
    nullif(e.ip_address, ''),
    coalesce(e.payload -> 'traits' ->> 'provider', '')
  from auth.audit_log_entries e
  where (public.current_app_role() in ('admin', 'finanzas') or public.es_admin_permisos_de_emergencia())
    and (e.payload ->> 'action') not in ('token_refreshed', 'token_revoked')
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

comment on function public.log_accesos(int) is
  'Últimos accesos (auth.audit_log_entries) para Personal › Usuarios. Solo admin/finanzas con 2FA.';
revoke execute on function public.log_accesos(int) from public, anon;
grant  execute on function public.log_accesos(int) to authenticated, service_role;

notify pgrst, 'reload schema';
