-- ############################################################################
--
--  KIKU SUSHI — Por qué Finanzas no ve los fichajes de los demás
--
--  Solo lee. No modifica nada. Pegalo en Supabase → SQL Editor y dale Run.
--  Devuelve varios bloques; mandámelos todos.
--
-- ############################################################################

-- ─── 1. Quién es quién ──────────────────────────────────────────────────────
select
  '1. USUARIOS' as bloque,
  u.email,
  coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), '(sin rol → cocina)') as rol,
  (e.id is not null) as vinculado_a_empleado,
  e.nombre as empleado
from auth.users u
left join public.empleados e on e.user_id = u.id
where u.deleted_at is null
order by u.email;

-- ─── 2. ¿Se aplicó la fase 4? ───────────────────────────────────────────────
select
  '2. ESTADO' as bloque,
  (select count(*) from pg_policies
    where schemaname='public' and policyname='admin full access')            as bypass_admin_restante,
  (to_regclass('public.recurso_tablas') is not null)                          as existe_mapa_fase4,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='fichajes')                       as policies_en_fichajes;

-- ─── 3. Las policies que hoy gobiernan fichajes ─────────────────────────────
select '3. POLICIES' as bloque, policyname, cmd, roles::text, qual
from pg_policies
where schemaname = 'public' and tablename in ('fichajes','empleados','liquidaciones')
order by tablename, policyname;

-- ─── 4. Qué contesta la base haciéndose pasar por cada rol ──────────────────
-- Evalúa las funciones de permiso con el JWT simulado de cada rol. Esto es lo
-- que decide si ve los fichajes de todos o solo los suyos.
-- Sin `on commit drop`: el editor corre cada sentencia en su propia
-- transacción, así que la tabla se borraba antes de poder consultarla.
drop table if exists _diag;
create temporary table _diag (
  rol text, email text, es_finanzas boolean,
  ve_personal boolean, lee_fichajes boolean, escribe_fichajes boolean
);

do $$
declare
  r record;
  v_personal boolean;
  v_lee      boolean;
  v_escribe  boolean;
begin
  for r in
    select 'finanzas'::text as rol, 'otro@kikusushi.com'::text as email
    union all select 'admin',    'otro@kikusushi.com'
    union all select 'admin',    'finanzas@kikusushi.com.ar'   -- la cuenta histórica
    union all select 'empleado', 'otro@kikusushi.com'
  loop
    perform set_config('request.jwt.claims',
      json_build_object(
        'sub','00000000-0000-0000-0000-000000000000',
        'role','authenticated',
        'email', r.email,
        'app_metadata', json_build_object('role', r.rol)
      )::text, true);

    -- Las llamadas van por EXECUTE, no directas: si la función no existe
    -- todavía (fase 4 sin aplicar) una llamada directa no parsearía y se
    -- caería el bloque entero, aunque estuviera dentro de un CASE.
    v_personal := null; v_lee := null; v_escribe := null;

    if to_regprocedure('public.tiene_permiso(text,text)') is not null then
      execute $q$select public.tiene_permiso('personal','ver')$q$ into v_personal;
    end if;
    if to_regprocedure('public.puede_tabla(text,text)') is not null then
      execute $q$select public.puede_tabla('fichajes','ver')$q$    into v_lee;
      execute $q$select public.puede_tabla('fichajes','editar')$q$ into v_escribe;
    end if;

    insert into _diag values (
      r.rol, r.email, public.is_finanzas_user(), v_personal, v_lee, v_escribe
    );
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;

select '4. SIMULACIÓN' as bloque, * from _diag;
drop table if exists _diag;

-- ─── 5. Los permisos del rol finanzas, tal como están guardados ─────────────
select '5. PERMISOS DE FINANZAS' as bloque,
       string_agg(recurso_id, ', ' order by recurso_id) as secciones
from public.rol_permisos where rol_id = 'finanzas' and ver;

-- ─── 6. El mapa, solo si la fase 4 está aplicada ────────────────────────────
-- Va en un DO porque si la tabla no existe, un select suelto abortaría el
-- script entero y perderías los bloques anteriores.
do $$
declare txt text;
begin
  if to_regclass('public.recurso_tablas') is null then
    txt := '(la fase 4 no está aplicada: no existe recurso_tablas)';
  else
    execute $q$select coalesce(string_agg(tabla, ', ' order by tabla), '(vacío)')
               from public.recurso_tablas where recurso_id = 'personal'$q$ into txt;
  end if;
  raise notice '6. MAPA DE PERSONAL: %', txt;
end $$;
