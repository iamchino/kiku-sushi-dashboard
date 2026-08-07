-- ############################################################################
--
--  KIKU SUSHI — Script único para Supabase → SQL Editor
--
--  Junta, EN ORDEN, las cuatro migraciones pendientes. Pegalo entero y dale
--  Run una sola vez. Es idempotente: si alguna ya la corriste, esa parte no
--  hace nada y no rompe.
--
--  ⚠️ Puede ABORTAR A PROPÓSITO en el bloque 2 si algún usuario tiene su rol
--     guardado solo en user_metadata. Si eso pasa, no se aplicó NADA (todo va
--     en una transacción) y el mensaje de error explica cómo resolverlo.
--     Con la lista de usuarios que ya revisaste, no debería pasar.
--
--  Si en vez de esto usás la CLI, es equivalente a:  supabase db push
--  Ojo: correrlo acá NO marca las migraciones como aplicadas en la CLI. Si
--  después corrés `supabase db push`, las va a re-ejecutar — no hay problema,
--  son idempotentes, pero conviene saberlo.
--
--  Después de esto falta, aparte:  supabase functions deploy admin-usuarios
--
-- ############################################################################

begin;

-- ═══ Rol finanzas · 20260801000000_rol_finanzas.sql ═══

-- ============================================================
-- Migración: rol 'finanzas'
--
--   Hasta ahora el acceso a Finanzas se otorgaba SOLO por email
--   (ver 20260628010000_finanzas_acceso.sql). Eso obligaba a tocar
--   la BD cada vez que cambiaba la persona a cargo.
--
--   A partir de acá is_finanzas_user() acepta DOS vías equivalentes:
--     1) el email está en la lista blanca histórica, o
--     2) el usuario tiene app_metadata.role = 'finanzas'.
--
--   La vía 1 se mantiene intacta: nadie que hoy entre a Finanzas
--   pierde el acceso al aplicar esta migración.
--
--   Las políticas de empleados / egresos / puntos_fichaje / fichajes /
--   turnos / liquidaciones ya delegan en esta función, así que con
--   redefinirla alcanza para esas tablas.
--
--   PERO la página Finanzas también lee tres tablas que NO usan
--   is_finanzas_user() y que hasta hoy resolvían por rol 'admin':
--     · caja_turnos  → tab "Cajas diarias" y el resumen
--     · pagos        → tab "Resumen" (ingresos)
--     · proveedores  → tab "Proveedores" y el selector de Egresos
--   El usuario histórico no lo notaba porque además es admin. Un usuario
--   con rol 'finanzas' (que NO es admin) vería esos tabs vacíos, así que
--   más abajo les sumamos lectura vía is_finanzas_user().
--
-- SEGURIDAD — por qué app_metadata y no user_metadata:
--   user_metadata lo puede escribir el propio usuario con
--   supabase.auth.updateUser(). Si lo aceptáramos acá, cualquier
--   empleado logueado podría auto-asignarse el rol y leer los sueldos.
--   app_metadata solo se escribe con la service key, es decir desde la
--   Edge Function admin-usuarios, que a su vez exige ser de Finanzas.
-- ============================================================

create or replace function public.is_finanzas_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'finanzas@kikusushi.com.ar'
      -- agregá acá más emails si hace falta habilitar a alguien sin rol
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'finanzas'
$$;

grant execute on function public.is_finanzas_user() to authenticated;

comment on function public.is_finanzas_user() is
  'True si el usuario está habilitado para Finanzas: por email en lista blanca '
  'o por app_metadata.role = ''finanzas''. Espeja canAccessFinanzas() en src/context/role.js.';

-- ── Tablas que la página Finanzas lee y que no pasaban por is_finanzas_user() ──
-- En los tres casos SUMAMOS acceso, no lo sacamos: las políticas previas de
-- admin/operativo siguen existiendo intactas y estas conviven en OR (Postgres
-- permite la fila si CUALQUIER policy permisiva la permite).

-- caja_turnos: lectura para el resumen y el tab "Cajas diarias".
-- Solo SELECT: abrir/cerrar caja sigue siendo cosa de admin.
drop policy if exists "caja_turnos finanzas read" on public.caja_turnos;
create policy "caja_turnos finanzas read"
  on public.caja_turnos
  for select
  to authenticated
  using (public.is_finanzas_user());

-- pagos: lectura de ingresos para el resumen.
drop policy if exists "pagos finanzas read" on public.pagos;
create policy "pagos finanzas read"
  on public.pagos
  for select
  to authenticated
  using (public.is_finanzas_user());

-- proveedores: lectura + alta/edición, porque Egresos carga facturas de
-- proveedor y el tab Proveedores es parte de Finanzas.
drop policy if exists "proveedores finanzas manage" on public.proveedores;
create policy "proveedores finanzas manage"
  on public.proveedores
  for all
  to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

notify pgrst, 'reload schema';


-- ═══ Fase 0 seguridad · 20260802000000_seguridad_roles_fase0.sql ═══

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


-- ═══ Fase 1 esquema · 20260803000000_permisos_esquema.sql ═══

-- ============================================================================
-- Fase 1 — Esquema de permisos configurables
--
--   Hasta ahora "qué ve cada rol" vive hardcodeado en src/context/role.js
--   (listas blancas y negras de rutas) y, del lado de la base, repartido en
--   ~40 policies con is_admin() / is_operational_user() / is_mozo().
--   Cambiar un permiso implicaba editar código y redeployar.
--
--   Esta migración crea la estructura para que esos permisos vivan en la base
--   y se editen desde la UI. NO cambia el comportamiento de nada: el seed
--   calca exactamente lo que hace hoy role.js, y por ahora nadie lee estas
--   tablas. El front las empieza a usar en la fase 2, y las policies migran
--   en la fase 4.
--
--   Modelo:
--     roles         → quiénes existen ('admin', 'cocina', … + los que cree ella)
--     recursos      → qué se puede permitir (una sección del sistema)
--     rol_permisos  → la matriz: para cada par rol×recurso, ver y editar
--
--   Requiere la fase 0 (20260802000000): current_app_role() ya lee solo
--   app_metadata. Si esto corriera sobre la versión vieja, cualquier usuario
--   podría auto-asignarse un rol y con él los permisos que ese rol tenga.
-- ============================================================================

-- ─── 1. roles ───────────────────────────────────────────────────────────────
create table if not exists public.roles (
  id          text primary key
              check (id ~ '^[a-z][a-z0-9_]{1,30}$'),  -- slug: va en el JWT
  nombre      text        not null,
  descripcion text        not null default '',
  -- `sistema` marca los 5 roles originales: no se pueden borrar ni renombrar
  -- el id, porque hay código y JWTs vivos que los referencian por nombre.
  sistema     boolean     not null default false,
  orden       integer     not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.roles is
  'Roles del sistema. El id es el valor que va en app_metadata.role del JWT.';
comment on column public.roles.sistema is
  'True para los 5 roles originales (admin, cocina, mozo, empleado, finanzas): no borrables.';

-- ─── 2. recursos ────────────────────────────────────────────────────────────
-- Un recurso es "una cosa que se puede permitir". Casi siempre es una sección
-- con su pantalla; `ruta` la liga con el router del front.
create table if not exists public.recursos (
  id          text primary key
              check (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre      text        not null,
  descripcion text        not null default '',
  -- null cuando el recurso no tiene pantalla propia (p. ej. un permiso que
  -- vive dentro de otra sección).
  ruta        text,
  grupo       text        not null default 'General',
  -- `sensible` = la UI lo muestra con un aviso. Datos de plata o de personas.
  sensible    boolean     not null default false,
  orden       integer     not null default 100
);

comment on table public.recursos is
  'Catálogo de secciones/permisos otorgables. Lo mantiene el equipo de desarrollo, no la UI.';

-- ─── 3. rol_permisos ────────────────────────────────────────────────────────
create table if not exists public.rol_permisos (
  rol_id     text    not null references public.roles(id)    on update cascade on delete cascade,
  recurso_id text    not null references public.recursos(id) on update cascade on delete cascade,
  ver        boolean not null default false,
  editar     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (rol_id, recurso_id),
  -- No tiene sentido poder editar algo que no podés ver.
  constraint rol_permisos_editar_implica_ver check (not editar or ver)
);

comment on table public.rol_permisos is
  'Matriz rol × recurso. La ausencia de fila equivale a sin permiso.';

drop trigger if exists trg_roles_updated on public.roles;
create trigger trg_roles_updated before update on public.roles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_rol_permisos_updated on public.rol_permisos;
create trigger trg_rol_permisos_updated before update on public.rol_permisos
  for each row execute function public.set_updated_at();

create index if not exists idx_rol_permisos_rol on public.rol_permisos (rol_id);

-- ─── 4. tiene_permiso() ─────────────────────────────────────────────────────
-- El helper que van a usar las policies en la fase 4 y la UI vía RPC.
--
-- security definer es necesario: rol_permisos tiene RLS, y una policy que
-- llamara a esta función con los permisos del propio usuario entraría en
-- recursión. Al ser definer, la función lee la matriz con los permisos del
-- owner y devuelve solo un booleano — no filtra datos.
-- ⚠️ NO le saques el `security definer` ni le pongas `force row level security`
-- a rol_permisos: es lo que evita la recursión cuando una policy de esa misma
-- tabla llama a esta función. Postgres además no inlinea funciones con
-- prosecdef ni con proconfig, así que no puede colapsar dentro de la policy.
create or replace function public.tiene_permiso(p_recurso text, p_accion text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rol_permisos rp
    where rp.rol_id     = public.current_app_role()
      and rp.recurso_id = p_recurso
      and case p_accion
            when 'editar' then rp.editar
            when 'ver'    then rp.ver
            -- Falla cerrado: una acción mal escrita ('edit', 'Editar') niega el
            -- permiso en vez de conceder el de lectura. Se rompe visible, no en
            -- silencio y de más.
            else false
          end
  )
$$;

comment on function public.tiene_permiso(text, text) is
  'True si el rol del usuario autenticado tiene el permiso pedido sobre el recurso. '
  'p_accion: ''ver'' (default) o ''editar''. Cualquier otro valor devuelve false.';

-- Postgres otorga EXECUTE a PUBLIC al crear una función, así que sin este
-- revoke `anon` también podría llamarla — y como current_app_role() devuelve
-- 'cocina' sin JWT, un anónimo podría enumerar los permisos del rol default.
revoke execute on function public.tiene_permiso(text, text) from public;
grant  execute on function public.tiene_permiso(text, text) to authenticated;

-- ─── 5. Quién puede administrar los permisos ────────────────────────────────
-- Dos vías, a propósito redundantes:
--   1) tener el recurso 'permisos' con editar (configurable desde la UI), y
--   2) estar en la lista blanca de emails (hardcodeada, NO configurable).
--
-- La (2) es la llave debajo del felpudo: como los permisos ahora viven en la
-- base y no en el código, un error de configuración no se arregla con un
-- deploy. Este email siempre puede entrar a arreglar la matriz.
--
-- OJO: acá NO se usa is_finanzas_user(), aunque sería lo intuitivo. Esa función
-- da true también para cualquiera con rol 'finanzas', y eso convertiría al rol
-- entero en un bypass permanente e irrevocable: destildar "finanzas × permisos"
-- desde la UI no tendría ningún efecto. La salida de emergencia tiene que ser
-- una sola cuenta concreta, no un rol que se reparte.
create or replace function public.es_admin_permisos_de_emergencia()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'finanzas@kikusushi.com.ar'
  )
$$;

comment on function public.es_admin_permisos_de_emergencia() is
  'Lista blanca de emails que SIEMPRE pueden editar la matriz de permisos, pase '
  'lo que pase con la configuración. Solo se cambia con una migración.';

create or replace function public.puede_administrar_permisos()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.es_admin_permisos_de_emergencia()
      or public.tiene_permiso('permisos', 'editar')
$$;

revoke execute on function public.es_admin_permisos_de_emergencia() from public;
revoke execute on function public.puede_administrar_permisos()      from public;
grant  execute on function public.es_admin_permisos_de_emergencia() to authenticated;
grant  execute on function public.puede_administrar_permisos()      to authenticated;

comment on function public.puede_administrar_permisos() is
  'True si el usuario puede editar la matriz de permisos: por permiso configurado '
  'o por estar en la lista blanca de emergencia.';

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
-- Lectura abierta a cualquier usuario autenticado: el front necesita la matriz
-- completa para armar el menú, y saber qué puede hacer otro rol no es
-- información sensible (no hay datos del negocio acá, solo la grilla).
-- Escritura, solo quien administra permisos.

alter table public.roles        enable row level security;
alter table public.recursos     enable row level security;
alter table public.rol_permisos enable row level security;

drop policy if exists "roles lectura autenticada" on public.roles;
create policy "roles lectura autenticada"
  on public.roles for select to authenticated using (true);

drop policy if exists "roles escritura permisos" on public.roles;
create policy "roles escritura permisos"
  on public.roles for all to authenticated
  using (public.puede_administrar_permisos())
  with check (public.puede_administrar_permisos());

drop policy if exists "recursos lectura autenticada" on public.recursos;
create policy "recursos lectura autenticada"
  on public.recursos for select to authenticated using (true);

-- El catálogo de recursos lo define el código (cada recurso necesita que
-- alguien lo respete en el front y en las policies), así que desde la UI no se
-- escribe: solo service_role, o sea migraciones.
drop policy if exists "recursos escritura service" on public.recursos;
create policy "recursos escritura service"
  on public.recursos for all to service_role using (true) with check (true);

drop policy if exists "rol_permisos lectura autenticada" on public.rol_permisos;
create policy "rol_permisos lectura autenticada"
  on public.rol_permisos for select to authenticated using (true);

drop policy if exists "rol_permisos escritura permisos" on public.rol_permisos;
create policy "rol_permisos escritura permisos"
  on public.rol_permisos for all to authenticated
  using (public.puede_administrar_permisos())
  with check (public.puede_administrar_permisos());

-- ─── 7. Guardas anti-lockout ────────────────────────────────────────────────
-- Los permisos ahora son datos, no código: un error acá no se arregla con un
-- deploy. Estas guardas hacen que el error falle en el momento, con un mensaje,
-- en vez de dejar el sistema sin administrador.

-- 7.a — Siempre tiene que quedar al menos un rol que pueda editar permisos.
create or replace function public.guardar_admin_de_permisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quedan integer;
begin
  select count(*) into quedan
  from public.rol_permisos
  where recurso_id = 'permisos' and editar;

  if quedan = 0 then
    raise exception
      'No podés dejar el sistema sin ningún rol que administre permisos. '
      'Dale el permiso a otro rol primero y después sacáselo a este.';
  end if;

  return null;  -- trigger AFTER, el valor de retorno se ignora
end $$;

drop trigger if exists trg_rol_permisos_admin_guard on public.rol_permisos;
create constraint trigger trg_rol_permisos_admin_guard
  after update or delete on public.rol_permisos
  deferrable initially deferred   -- se evalúa al final de la transacción, así
                                  -- un "borrar todo e insertar" no falsea
  for each row
  -- El WHEN se evalúa en el momento (no se difiere) y evita un count(*) por
  -- cada fila tocada: guardar 20 checkboxes hacía 20 consultas.
  when (old.recurso_id = 'permisos')
  execute function public.guardar_admin_de_permisos();

-- 7.b — Los 5 roles originales no se borran ni se pueden disfrazar.
create or replace function public.proteger_roles_sistema()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception
        'El rol "%" es del sistema y no se puede eliminar. Podés vaciarle los permisos, '
        'pero antes reasigná los usuarios que lo tengan.', old.id;
    end if;
    return old;
  end if;

  -- UPDATE. Sin esto, la protección del DELETE se esquiva en dos pasos:
  -- primero `set sistema = false`, después el delete.
  if old.sistema then
    if new.sistema is distinct from true then
      raise exception 'No se puede quitar la marca de sistema al rol "%".', old.id;
    end if;
    if new.id is distinct from old.id then
      raise exception
        'No se puede renombrar el id del rol "%": hay sesiones activas cuyo JWT lo referencia.', old.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_roles_no_borrar_sistema on public.roles;
create trigger trg_roles_no_borrar_sistema
  before delete or update on public.roles
  for each row execute function public.proteger_roles_sistema();

notify pgrst, 'reload schema';


-- ═══ Fase 1 seed · 20260803010000_permisos_seed.sql ═══

-- ============================================================================
-- Fase 1 (seed) — Los 5 roles y la matriz calcada del comportamiento actual
--
--   Cada fila de rol_permisos de acá reproduce EXACTAMENTE lo que hoy decide
--   canAccessRoute() en src/context/role.js, más el guard de App.jsx que
--   restringe /finanzas y /personal. Si esta matriz y role.js discrepan, es un
--   bug del seed: hay un test de paridad en scripts/verificar-paridad-permisos.mjs.
--
--   Es idempotente y NO pisa cambios hechos desde la UI: rol_permisos usa
--   `on conflict do nothing`. Si mañana ella le saca Mesas a mozo y alguien
--   re-corre esta migración, el cambio de ella se respeta.
-- ============================================================================

-- ─── Roles ──────────────────────────────────────────────────────────────────
insert into public.roles (id, nombre, descripcion, sistema, orden) values
  ('admin',    'Admin',    'Dashboard completo: operación, producto, caja y configuración.', true, 10),
  ('finanzas', 'Finanzas', 'Sueldos, legajo, egresos y liquidación. Administra los logins del sistema.', true, 20),
  ('cocina',   'Cocina',   'Operación de cocina: comandas, producción, stock y recetas.', true, 30),
  ('mozo',     'Mozo',     'Salón: abrir, cobrar y cerrar mesas.', true, 40),
  ('empleado', 'Empleado', 'Solo fichaje y sus propias horas.', true, 50)
on conflict (id) do update
  set nombre      = excluded.nombre,
      descripcion = excluded.descripcion,
      orden       = excluded.orden,
      sistema     = excluded.sistema;

-- ─── Recursos ───────────────────────────────────────────────────────────────
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  -- Salón y pedidos
  ('inicio',         'Inicio',          'Pantalla de bienvenida.',                          '/',                     'Operación',     false, 10),
  ('operaciones',    'Operaciones',     'Tablero operativo de cocina.',                     '/operaciones',          'Operación',     false, 20),
  ('pedidos',        'Órdenes',         'Pedidos de salón, delivery y take away.',          '/pedidos',              'Operación',     false, 30),
  ('mesas',          'Mesas',           'Abrir, cobrar y cerrar mesas del salón.',          '/mesas',                'Operación',     false, 40),
  ('reservas',       'Reservas',        'Reservas y lista de espera.',                      '/reservas',             'Operación',     false, 50),
  ('platos',         'Platos',          'Estado de los platos en preparación.',             '/platos',               'Operación',     false, 60),
  ('cocina_kds',     'Cocina (KDS)',    'Pantalla de cocina. Hoy oculta del menú.',         '/cocina',               'Operación',     false, 70),

  -- Producto
  ('menu',           'Menú & Carta',    'Carta, precios, especiales y novedades de la web.', '/menu',                'Producto',      false, 110),
  ('produccion',     'Producción',      'Listas y tareas de producción.',                   '/produccion',           'Producto',      false, 120),
  ('stock',          'Inventario',      'Stock e ingresos de mercadería.',                  '/stock',                'Producto',      false, 130),
  ('recetas',        'Recetas',         'Recetas, ingredientes y combos.',                  '/recetas',              'Producto',      false, 140),

  -- Negocio
  ('analiticas',     'Analíticas',      'Ventas, tendencias y el vivo del día.',            '/analiticas',           'Negocio',       false, 210),
  ('caja',           'Caja y facturación', 'Arqueo, turnos de caja y facturación fiscal. El botón Pagos registra todos los egresos.', '/caja',                 'Negocio',       true,  220),
  ('clientes',       'Clientes',        'Base de clientes.',                                '/clientes',             'Negocio',       false, 230),
  ('notificaciones', 'Notificaciones',  'Bandeja de notificaciones del sistema.',           '/notificaciones',       'Negocio',       false, 240),
  ('proveedores',    'Proveedores',     'Alta y edición de proveedores.',                   '/proveedores',          'Negocio',       false, 250),

  -- Configuración
  ('configuracion',  'Configuración',   'Impresoras, envíos, horarios y reservas.',         '/configuracion',        'Configuración', false, 310),
  ('config_salon',   'Salón',           'Mapa de mesas, salones y mozos.',                  '/configuracion/salon',  'Configuración', false, 320),

  -- Plata y personas
  ('finanzas',       'Finanzas',        'Egresos, sueldos e ingresos. Información sensible.', '/finanzas',           'Finanzas',      true,  410),
  ('personal',       'Personal',        'Legajo, fichajes, liquidación y logins del sistema.', '/personal',          'Finanzas',      true,  420),
  ('permisos',       'Permisos',        'Editar qué puede hacer cada rol. Vive dentro de Personal.', null,           'Finanzas',      true,  430),

  -- Propio
  ('fichar',         'Fichar',          'Marcar entrada y salida con el QR del local.',     '/fichar',               'Mi fichaje',    false, 510),
  ('mis_horas',      'Mis horas',       'Ver las horas propias y su liquidación.',          '/mis-horas',            'Mi fichaje',    false, 520)
on conflict (id) do update
  set nombre      = excluded.nombre,
      descripcion = excluded.descripcion,
      ruta        = excluded.ruta,
      grupo       = excluded.grupo,
      sensible    = excluded.sensible,
      orden       = excluded.orden;

-- ─── Matriz rol × recurso ───────────────────────────────────────────────────
-- `editar = ver` en todos los casos: el sistema actual no distingue lectura de
-- escritura a nivel de sección, así que introducir esa diferencia acá sería
-- inventar comportamiento. La distinción se empieza a usar en la fase 4.

insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol_id, r.recurso_id, true, true
from (values
  -- ── admin: todo, MENOS finanzas / personal / permisos ────────────────────
  -- (hoy RoleGuard le bloquea /finanzas y /personal aunque canAccessRoute
  --  devuelva true: los sueldos no los ve ni el dueño)
  ('admin', 'inicio'), ('admin', 'operaciones'), ('admin', 'pedidos'),
  ('admin', 'mesas'), ('admin', 'reservas'), ('admin', 'platos'),
  ('admin', 'cocina_kds'), ('admin', 'menu'), ('admin', 'produccion'),
  ('admin', 'stock'), ('admin', 'recetas'), ('admin', 'analiticas'),
  ('admin', 'caja'), ('admin', 'clientes'), ('admin', 'notificaciones'),
  ('admin', 'proveedores'), ('admin', 'configuracion'), ('admin', 'config_salon'),
  ('admin', 'fichar'), ('admin', 'mis_horas'),

  -- ── cocina: lista negra actual invertida ─────────────────────────────────
  -- bloqueados hoy: /, /analiticas, /caja, /clientes, /mesas, /reservas,
  -- /configuracion, /configuracion/salon, /notificaciones, /platos,
  -- /proveedores, /finanzas, /personal
  ('cocina', 'operaciones'), ('cocina', 'pedidos'), ('cocina', 'cocina_kds'),
  ('cocina', 'menu'), ('cocina', 'produccion'), ('cocina', 'stock'),
  ('cocina', 'recetas'), ('cocina', 'fichar'), ('cocina', 'mis_horas'),

  -- ── mozo: lista blanca actual ────────────────────────────────────────────
  ('mozo', 'mesas'), ('mozo', 'platos'), ('mozo', 'stock'),
  ('mozo', 'configuracion'), ('mozo', 'fichar'), ('mozo', 'mis_horas'),

  -- ── empleado: solo su fichaje ────────────────────────────────────────────
  ('empleado', 'fichar'), ('empleado', 'mis_horas'),

  -- ── finanzas: lo suyo + su fichaje + la pantalla de permisos ─────────────
  ('finanzas', 'finanzas'), ('finanzas', 'personal'), ('finanzas', 'permisos'),
  ('finanzas', 'fichar'), ('finanzas', 'mis_horas')
) as r(rol_id, recurso_id)
on conflict (rol_id, recurso_id) do nothing;

-- ─── Chequeo de integridad del propio seed ──────────────────────────────────
do $$
declare
  admins_de_permisos integer;
  roles_sembrados    integer;
begin
  select count(*) into admins_de_permisos
  from public.rol_permisos where recurso_id = 'permisos' and editar;

  if admins_de_permisos = 0 then
    raise exception 'El seed dejó cero roles con permiso de administrar permisos.';
  end if;

  select count(*) into roles_sembrados from public.roles where sistema;
  if roles_sembrados <> 5 then
    raise exception 'Se esperaban 5 roles de sistema, hay %.', roles_sembrados;
  end if;

  raise notice 'Permisos sembrados: % roles de sistema, % rol(es) con administración de permisos.',
    roles_sembrados, admins_de_permisos;
end $$;

notify pgrst, 'reload schema';


commit;
