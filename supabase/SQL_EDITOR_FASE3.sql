-- ############################################################################
--
--  KIKU SUSHI — Fase 3: pantalla de permisos
--
--  Pegá esto entero en Supabase → SQL Editor y dale Run, UNA sola vez.
--  Es idempotente: si lo corrés de nuevo no rompe nada.
--
--  ⚠️ Esto es solo la mitad. La otra mitad es la Edge Function
--     `admin-usuarios`, que NO se puede actualizar por SQL. Ver
--     docs/DEPLOY_FASE3.md — sin eso, el botón Guardar de la pantalla
--     va a guardar los permisos pero no va a poder cerrar las sesiones.
--
-- ############################################################################

begin;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  BLOQUE 1 de 2 — RPC para administrar permisos: guardar_permisos_rol, crear_rol, eliminar_rol, usuarios_por_rol
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- Fase 3 — RPC para administrar permisos desde la UI
--
--   Todo lo que toca la matriz pasa por acá y NO por updates sueltos, por una
--   razón concreta: el trigger anti-lockout es `deferrable initially deferred`,
--   o sea que evalúa al cerrar la transacción. supabase-js abre una
--   transacción por request, así que si la UI mandara un update por checkbox,
--   el diferido no serviría de nada y la guarda podría rechazar un estado
--   intermedio perfectamente válido (p. ej. mientras se mueve el permiso de un
--   rol a otro).
--
--   Con un RPC, la matriz entera de un rol viaja en una sola llamada y la
--   guarda ve el estado final.
-- ============================================================================

-- ─── guardar_permisos_rol ───────────────────────────────────────────────────
-- Reemplaza los permisos de UN rol. Recibe la lista completa de recursos que
-- ese rol puede ver; lo que no venga en la lista, se borra.
--
--   select public.guardar_permisos_rol('mozo', '["mesas","platos","stock"]'::jsonb);
--
-- `editar` se iguala a `ver`: la UI de la fase 3 maneja una sola casilla por
-- celda. Cuando la fase 4 le dé sentido propio, esta función recibe el detalle.
create or replace function public.guardar_permisos_rol(
  p_rol      text,
  p_recursos jsonb
)
returns void
language plpgsql
security invoker            -- las RLS de rol_permisos siguen aplicando
set search_path = ''
as $$
declare
  n_invalidos int;
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para editar los permisos del sistema.';
  end if;

  if not exists (select 1 from public.roles where id = p_rol) then
    raise exception 'El rol "%" no existe.', p_rol;
  end if;

  if jsonb_typeof(p_recursos) <> 'array' then
    raise exception 'Se esperaba un array de ids de recurso.';
  end if;

  -- Un id mal escrito reventaría después con un error de foreign key poco
  -- legible; mejor decir cuál es.
  select count(*) into n_invalidos
  from jsonb_array_elements_text(p_recursos) e(id)
  where not exists (select 1 from public.recursos r where r.id = e.id);

  if n_invalidos > 0 then
    raise exception 'Hay % recurso(s) que no existen en el catálogo: %',
      n_invalidos,
      (select string_agg(e.id, ', ')
         from jsonb_array_elements_text(p_recursos) e(id)
        where not exists (select 1 from public.recursos r where r.id = e.id));
  end if;

  -- Borrar + insertar en la misma transacción. El trigger anti-lockout es
  -- diferido, así que ve el resultado final y no el hueco del medio.
  --
  -- `distinct` porque un id repetido reventaría con una violación de clave
  -- primaria y un mensaje de Postgres crudo.
  --
  -- `editar` se preserva si la fila ya existía: la UI de la fase 3 maneja una
  -- sola casilla (ver), y no queremos que guardar sin tocar nada eleve a
  -- editar una fila que alguien había dejado en solo-lectura. Para las filas
  -- nuevas arranca en true, igual que el seed.
  create temporary table _editar_previo on commit drop as
    select recurso_id, editar from public.rol_permisos where rol_id = p_rol;

  delete from public.rol_permisos where rol_id = p_rol;

  insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
  select distinct p_rol, e.id, true, coalesce(prev.editar, true)
  from jsonb_array_elements_text(p_recursos) e(id)
  left join _editar_previo prev on prev.recurso_id = e.id;

  -- Que el error del trigger (que es diferido) salga acá adentro, con su
  -- mensaje, en vez de reventar en el COMMIT como un 500 sin explicación.
  set constraints all immediate;
end $$;

revoke execute on function public.guardar_permisos_rol(text, jsonb) from public;
grant  execute on function public.guardar_permisos_rol(text, jsonb) to authenticated;

comment on function public.guardar_permisos_rol(text, jsonb) is
  'Reemplaza los permisos de un rol en una sola transacción. Lo que no venga en '
  'el array se borra. Requiere puede_administrar_permisos().';

-- ─── crear_rol ──────────────────────────────────────────────────────────────
create or replace function public.crear_rol(
  p_id          text,
  p_nombre      text,
  p_descripcion text default ''
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para crear roles.';
  end if;

  if p_id !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception
      'El id "%" no sirve: usá minúsculas, números y guión bajo, empezando por una letra (ej: encargado_turno).', p_id;
  end if;

  if exists (select 1 from public.roles where id = p_id) then
    raise exception 'Ya existe un rol con el id "%".', p_id;
  end if;

  insert into public.roles (id, nombre, descripcion, sistema, orden)
  values (p_id, p_nombre, coalesce(p_descripcion, ''), false,
          -- los roles nuevos van al final
          coalesce((select max(orden) from public.roles), 0) + 10);
end $$;

revoke execute on function public.crear_rol(text, text, text) from public;
grant  execute on function public.crear_rol(text, text, text) to authenticated;

-- ─── eliminar_rol ───────────────────────────────────────────────────────────
-- El trigger proteger_roles_sistema() ya frena los 5 originales. Acá sumamos
-- la comprobación que no se puede hacer desde un trigger de la tabla `roles`:
-- que no queden usuarios con ese rol, porque quedarían sin nada y sin que nadie
-- se entere.
create or replace function public.eliminar_rol(p_id text)
returns void
language plpgsql
security definer            -- necesita leer auth.users
set search_path = ''
as $$
declare
  en_uso int;
  quienes text;
begin
  if not public.puede_administrar_permisos() then
    raise exception 'No tenés permiso para eliminar roles.';
  end if;

  select count(*), string_agg(coalesce(u.email, u.id::text), ', ')
    into en_uso, quienes
  from auth.users u
  where u.deleted_at is null
    and u.raw_app_meta_data ->> 'role' = p_id;

  if en_uso > 0 then
    raise exception
      'No podés eliminar el rol "%": lo tienen % usuario(s) (%). Cambiales el rol primero.',
      p_id, en_uso, quienes;
  end if;

  delete from public.roles where id = p_id;   -- el trigger frena los de sistema
end $$;

revoke execute on function public.eliminar_rol(text) from public;
grant  execute on function public.eliminar_rol(text) to authenticated;

-- ─── usuarios_por_rol ───────────────────────────────────────────────────────
-- Para que la pantalla pueda mostrar "3 personas tienen este rol" y avisar
-- antes de un cambio grande. Devuelve solo el conteo, no los datos.
create or replace function public.usuarios_por_rol()
returns table (rol_id text, usuarios bigint)
language sql
stable
security definer            -- necesita leer auth.users
set search_path = ''
as $$
  select
    coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'cocina') as rol_id,
    count(*)
  from auth.users u
  where u.deleted_at is null
  group by 1
$$;

revoke execute on function public.usuarios_por_rol() from public;
grant  execute on function public.usuarios_por_rol() to authenticated;

comment on function public.usuarios_por_rol() is
  'Cuántos usuarios activos tiene cada rol. Solo el conteo, sin datos personales.';

notify pgrst, 'reload schema';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  BLOQUE 2 de 2 — Fix del cierre de sesiones + guarda anti-lockout que cuenta personas
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


commit;

-- ─── Verificación: pegá esto aparte, después del commit ─────────────────────
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and proname in ('guardar_permisos_rol','crear_rol','eliminar_rol',
--                    'usuarios_por_rol','cerrar_sesiones_de_rol',
--                    'cerrar_sesiones_de_usuario')
--  order by proname;
-- Esperado: las 6 funciones.
