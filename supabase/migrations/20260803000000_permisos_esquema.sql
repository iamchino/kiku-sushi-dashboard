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
