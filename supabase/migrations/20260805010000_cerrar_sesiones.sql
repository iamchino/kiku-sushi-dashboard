-- ============================================================================
-- Fase 3 (fix) — Cerrar sesiones de verdad
--
--   La Edge Function usaba admin.auth.admin.signOut(user_id, 'global'), pero
--   esa API recibe el JWT del usuario, no su id: mandaba `Bearer <uuid>`,
--   GoTrue devolvía 401 y no se cerraba ninguna sesión. El cambio de rol
--   decía "se cerraron las sesiones" y no cerraba nada.
--
--   supabase-js v2 no tiene forma de revocar por user_id, así que se hace
--   borrando de auth.sessions con la service key. Estas funciones exponen eso
--   de forma acotada y con control de permisos.
--
-- ⚠️ QUÉ SIGNIFICA "CERRAR LA SESIÓN", CON PRECISIÓN:
--   Borrar la sesión invalida el refresh token, o sea que la persona no puede
--   renovar. Pero el access token que ya tiene en el navegador es un JWT
--   firmado y sigue siendo válido hasta que expire (1 h por defecto, se
--   configura en Auth → Settings → JWT expiry).
--
--   Para los PERMISOS eso no importa: la matriz se lee de la base en cada
--   carga, así que un cambio de permisos aplica apenas el front la relee.
--   Lo que sí vive dentro del JWT es el ROL, y por eso un cambio de rol sí
--   necesita esto y tiene esa ventana de hasta una hora.
--
--   Si querés achicar la ventana, bajá el JWT expiry a 15 min.
-- ============================================================================

create or replace function public.cerrar_sesiones_de_usuario(p_user_id uuid)
returns integer
language plpgsql
security definer            -- necesita tocar el schema auth
set search_path = ''
as $$
declare
  n integer;
begin
  if not (public.is_finanzas_user() or public.puede_administrar_permisos()) then
    raise exception 'No tenés permiso para cerrar sesiones de otros usuarios.';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cerrar_sesiones_de_usuario(uuid) from public;
grant  execute on function public.cerrar_sesiones_de_usuario(uuid) to authenticated, service_role;

comment on function public.cerrar_sesiones_de_usuario(uuid) is
  'Borra las sesiones de un usuario: no puede renovar el token. El access token '
  'vigente sigue valiendo hasta expirar (JWT expiry, 1 h por defecto).';

-- ─── Por rol ────────────────────────────────────────────────────────────────
create or replace function public.cerrar_sesiones_de_rol(p_rol text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- A propósito NO alcanza con is_finanzas_user(): esa función da true para
  -- cualquiera con rol 'finanzas', y esto puede dejar a todo el local afuera.
  -- Va con el mismo permiso que editar la matriz.
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para cerrar las sesiones de un rol.';
  end if;

  delete from auth.sessions s
  where s.user_id in (
    select u.id from auth.users u
    where u.deleted_at is null
      and coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') = p_rol
      -- Al que está haciendo el cambio no lo echamos: se cerraría su propia
      -- pantalla justo después de guardar.
      and u.id <> auth.uid()
  );
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cerrar_sesiones_de_rol(text) from public;
grant  execute on function public.cerrar_sesiones_de_rol(text) to authenticated, service_role;

-- ─── Gate faltante en usuarios_por_rol ──────────────────────────────────────
-- Era la única de las RPC de la fase 3 sin control: cualquier usuario
-- autenticado podía enumerar la plantilla por rol.
create or replace function public.usuarios_por_rol()
returns table (rol_id text, usuarios bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para ver la cantidad de usuarios por rol.';
  end if;

  return query
  select
    coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') as rol_id,
    count(*)
  from auth.users u
  where u.deleted_at is null
  group by 1;
end $$;

revoke execute on function public.usuarios_por_rol() from public;
grant  execute on function public.usuarios_por_rol() to authenticated;

-- ─── Guarda anti-lockout, ahora contando PERSONAS ───────────────────────────
-- La guarda de la fase 1 contaba filas de rol_permisos, no humanos: darle el
-- permiso a un rol vacío y sacárselo a finanzas pasaba el chequeo y dejaba a
-- todos afuera. Ahora exige que quede al menos un rol con el permiso Y con
-- gente asignada.
create or replace function public.guardar_admin_de_permisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  roles_con_permiso int;
  con_gente         int;
begin
  select count(*) into roles_con_permiso
  from public.rol_permisos
  where recurso_id = 'permisos' and editar;

  if roles_con_permiso = 0 then
    raise exception
      'No podés dejar el sistema sin ningún rol que administre permisos. '
      'Dale el permiso a otro rol primero y después sacáselo a este.';
  end if;

  select count(*) into con_gente
  from public.rol_permisos rp
  where rp.recurso_id = 'permisos' and rp.editar
    and exists (
      select 1 from auth.users u
      where u.deleted_at is null
        and coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') = rp.rol_id
    );

  if con_gente = 0 then
    raise exception
      'Los roles que administran permisos no los tiene ninguna persona, así que '
      'nadie podría volver a entrar a esta pantalla. Asignale ese rol a alguien '
      'antes de guardar.';
  end if;

  return null;
end $$;

notify pgrst, 'reload schema';
