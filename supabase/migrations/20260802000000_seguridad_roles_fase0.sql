-- ============================================================================
-- Fase 0 — Cimientos de seguridad, previo al sistema de permisos configurable
--
-- Tres agujeros que existen HOY y que hay que tapar antes de que los permisos
-- pasen a vivir en la base:
--
--   1. current_app_role() acepta user_metadata.role como fallback, y
--      user_metadata lo escribe el propio usuario desde el navegador con
--      supabase.auth.updateUser({ data: { role: 'admin' } }). O sea que
--      cualquier empleado logueado puede auto-asignarse admin y quedarse con
--      todo el sistema (caja, stock, facturación, configuración).
--      A partir de acá el rol se lee SOLO de app_metadata, que únicamente
--      escribe la service key vía la Edge Function admin-usuarios.
--
--   2. public.mozos no tiene RLS habilitado. Cualquiera con la anon key
--      (que va en el bundle del front, es pública por diseño) puede leerla
--      y escribirla.
--
--   3. impresion_config se escribe con `auth.role() = 'authenticated'`,
--      es decir cualquier login, incluido un empleado que solo debería fichar.
--
-- Esta migración NO cambia qué ve cada rol. Es solo cerrar puertas.
--
-- ⚠️ ABORTA A PROPÓSITO si hay usuarios cuyo rol vive solo en user_metadata:
--    sacarles el fallback los dejaría como 'cocina' de un momento a otro.
--    Ver el bloque de verificación más abajo.
-- ============================================================================

-- ─── 0. Verificación previa: nadie puede quedar afuera ──────────────────────
-- Buscamos usuarios con un rol en user_metadata que NO esté también en
-- app_metadata. Para esos, quitar el fallback significa perder su rol.
do $$
declare
  afectados text;
  cuantos   int;
begin
  select count(*), string_agg(ident || ' (user_metadata.role=' || um_role || ')', E'\n  · ')
    into cuantos, afectados
  from (
    select
      coalesce(u.email, u.phone, u.id::text)        as ident,
      nullif(u.raw_user_meta_data ->> 'role', '')   as um_role,
      nullif(u.raw_app_meta_data  ->> 'role', '')   as am_role
    from auth.users u
    where u.deleted_at is null   -- los borrados lógicos no deben frenar nada
  ) t
  where um_role is not null
    -- 'cocina' es el default de current_app_role(), así que quien lo tenga solo
    -- en user_metadata no pierde nada: queda exactamente igual.
    and um_role in ('admin', 'mozo', 'empleado', 'finanzas')
    and am_role is distinct from um_role;

  if cuantos > 0 then
    raise exception E'Hay % usuario(s) cuyo rol vive en user_metadata y se perderían:\n  · %\n\nAntes de correr esta migración, copiá el rol a app_metadata para los que correspondan.\nRevisalos con:\n\n  select email, raw_app_meta_data->>''role'' as app_role, raw_user_meta_data->>''role'' as user_role\n  from auth.users order by email;\n\nY para cada uno que confirmes (OJO: verificá que el rol sea legítimo y no\nauto-asignado por la propia persona), corré:\n\n  update auth.users\n     set raw_app_meta_data = coalesce(raw_app_meta_data, ''{}''::jsonb) || jsonb_build_object(''role'', ''EL_ROL'')\n   where email = ''alguien@kikusushi.com.ar'';\n\nDespués volvé a correr esta migración.',
      cuantos, afectados;
  end if;
end $$;

-- ─── 1. Funciones de rol: solo app_metadata ─────────────────────────────────
-- `set search_path = ''` evita que un objeto creado en otro schema del
-- search_path secuestre las llamadas internas. Por eso todo va calificado.

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  -- SOLO app_metadata. user_metadata es escribible por el usuario.
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado, leído exclusivamente de app_metadata (escribible '
  'solo con la service key). Default: cocina. Espeja getRoleFromUser() en src/context/role.js.';

create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.is_mozo()
returns boolean language sql stable set search_path = '' as $$
  select public.current_app_role() = 'mozo'
$$;

create or replace function public.is_operational_user()
returns boolean language sql stable set search_path = '' as $$
  select
    public.current_app_role() in ('admin', 'cocina', 'mozo')
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cocina@kikusushi.com'
$$;

create or replace function public.puede_cobrar()
returns boolean language sql stable set search_path = '' as $$
  select public.current_app_role() in ('admin', 'mozo')
$$;

grant execute on function public.current_app_role()    to authenticated;
grant execute on function public.is_admin()            to authenticated;
grant execute on function public.is_mozo()             to authenticated;
grant execute on function public.is_operational_user() to authenticated;
grant execute on function public.puede_cobrar()        to authenticated;

-- ─── 2. Policies que leían el JWT inline (esquivaban las funciones) ─────────
-- Mismo criterio de acceso que antes; lo que cambia es que ahora pasan por el
-- helper y por lo tanto ya no aceptan user_metadata.

-- pagos: lectura operativa (admin, cocina, mozo).
drop policy if exists "pagos lectura operativa" on public.pagos;
create policy "pagos lectura operativa"
  on public.pagos
  for select
  to authenticated
  using (public.current_app_role() in ('admin', 'cocina', 'mozo'));

-- proveedores: eran 4 policies con un doble cast raro
-- ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role') que además aceptaba
-- user_metadata. Se unifican en una sola con is_admin().
drop policy if exists "proveedores_select_admin" on public.proveedores;
drop policy if exists "proveedores_insert_admin" on public.proveedores;
drop policy if exists "proveedores_update_admin" on public.proveedores;
drop policy if exists "proveedores_delete_admin" on public.proveedores;
drop policy if exists "proveedores admin manage"  on public.proveedores;
create policy "proveedores admin manage"
  on public.proveedores
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 3. public.mozos: sin RLS (tabla expuesta) ──────────────────────────────
-- La consulta useMozos.js desde Mesas y Configuración del salón. La usan
-- admin, cocina y mozo, así que va con is_operational_user().
--
-- `mozos` se creó a mano y no vive en ninguna migración (igual que mesas y
-- salones), así que en una base levantada solo desde migraciones —un
-- `supabase db reset`, CI, un staging nuevo— la tabla no existe. Sin esta
-- guarda el archivo abortaría entero y se perdería lo importante, que es el
-- fix de current_app_role(). Mismo patrón que 20260611000000_rol_mozo.sql:105.
do $$
begin
  if to_regclass('public.mozos') is not null then
    execute 'alter table public.mozos enable row level security';
    execute 'drop policy if exists "mozos operational manage" on public.mozos';
    execute $pol$
      create policy "mozos operational manage"
        on public.mozos
        for all
        to authenticated
        using (public.is_operational_user())
        with check (public.is_operational_user())
    $pol$;
  else
    raise notice 'public.mozos no existe en esta base; se omite el RLS de mozos.';
  end if;
end $$;

-- ─── 4. impresion_config: escritura para cualquier autenticado ──────────────
-- La lectura queda abierta a cualquier login (el banner de estado de impresora
-- se muestra en todo el dashboard y no expone nada sensible: IP y modelo).
-- La escritura pasa a los roles operativos: un mozo tiene que poder corregir
-- la IP de la impresora desde el celular (es el flujo documentado en
-- GUIA_MOZO_Y_APP_ANDROID.md), pero un empleado que solo ficha, no.
drop policy if exists "impresion_config_select" on public.impresion_config;
create policy "impresion_config_select"
  on public.impresion_config
  for select
  to authenticated
  using (true);

drop policy if exists "impresion_config_modify" on public.impresion_config;
create policy "impresion_config_modify"
  on public.impresion_config
  for all
  to authenticated
  using (public.is_operational_user())
  with check (public.is_operational_user());

notify pgrst, 'reload schema';
