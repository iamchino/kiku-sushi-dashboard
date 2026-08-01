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
