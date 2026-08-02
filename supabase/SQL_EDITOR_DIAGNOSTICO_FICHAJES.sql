-- ############################################################################
--
--  KIKU SUSHI — Por qué Finanzas no ve los fichajes de los demás
--
--  Solo lee. No modifica nada. Pegalo en Supabase → SQL Editor y dale Run.
--
--  Devuelve UNA sola tabla con todo. (El editor de Supabase solo muestra el
--  resultado de la última consulta, así que si el diagnóstico usara varios
--  SELECT sueltos verías nada más que el último.)
--
-- ############################################################################

-- Tabla de trabajo. Sin `on commit drop`: el editor corre cada sentencia en su
-- propia transacción y se borraría antes de poder consultarla.
drop table if exists _diag;
create temporary table _diag (orden int, bloque text, detalle text);

do $$
declare
  r        record;
  v_fin    boolean;
  v_pers   boolean;
  v_lee    boolean;
  v_esc    boolean;
  v_txt    text;
  hay_f4   boolean := to_regclass('public.recurso_tablas') is not null;
begin
  -- ── 1. Quién es quién ─────────────────────────────────────────────────────
  insert into _diag
  select 1, '1. USUARIOS',
         u.email || '  →  rol: ' ||
         coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), '(SIN ROL → cuenta como cocina)') ||
         case when e.id is not null then '  ·  vinculado a: ' || e.nombre
              else '  ·  SIN empleado vinculado (no puede fichar)' end
  from auth.users u
  left join public.empleados e on e.user_id = u.id
  where u.deleted_at is null;

  -- ── 2. Estado del sistema ─────────────────────────────────────────────────
  insert into _diag values (2, '2. ESTADO',
    'fase 4 aplicada: ' || case when hay_f4 then 'SÍ' else 'NO' end ||
    '  ·  policies "admin full access" restantes: ' ||
    (select count(*) from pg_policies where schemaname='public' and policyname='admin full access')::text);

  -- ── 3. Policies que gobiernan fichajes y empleados ────────────────────────
  insert into _diag
  select 3, '3. POLICIES', tablename || ' · ' || policyname || ' (' || cmd || ') → ' || coalesce(qual, '(sin condición)')
  from pg_policies
  where schemaname = 'public' and tablename in ('fichajes', 'empleados');

  -- ── 4. Qué contesta la base simulando cada rol ────────────────────────────
  -- Acá está la respuesta: si `es_finanzas` da NO para el rol que usa la
  -- persona, esa es la causa de que vea solo sus propios fichajes.
  for r in
    select 'finanzas'::text as rol, 'cualquiera@kikusushi.com'::text as email
    union all select 'admin',    'cualquiera@kikusushi.com'
    union all select 'admin',    'finanzas@kikusushi.com.ar'
    union all select 'empleado', 'cualquiera@kikusushi.com'
    union all select 'cocina',   'cualquiera@kikusushi.com'
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub','00000000-0000-0000-0000-000000000000',
                        'role','authenticated', 'email', r.email,
                        'app_metadata', json_build_object('role', r.rol))::text, true);

    v_fin := public.is_finanzas_user();
    v_pers := null; v_lee := null; v_esc := null;

    -- Por EXECUTE: si la función no existe (fase 4 sin aplicar), una llamada
    -- directa no parsearía y se caería el bloque entero.
    if to_regprocedure('public.tiene_permiso(text,text)') is not null then
      execute $q$select public.tiene_permiso('personal','ver')$q$ into v_pers;
    end if;
    if to_regprocedure('public.puede_tabla(text,text)') is not null then
      execute $q$select public.puede_tabla('fichajes','ver')$q$    into v_lee;
      execute $q$select public.puede_tabla('fichajes','editar')$q$ into v_esc;
    end if;

    insert into _diag values (4, '4. SIMULACIÓN',
      'rol=' || rpad(r.rol, 9) || ' email=' || rpad(r.email, 26) ||
      ' → es_finanzas=' || case when v_fin then 'SÍ' else 'no' end ||
      ' · ve_personal=' || coalesce(case when v_pers then 'SÍ' else 'no' end, '-') ||
      ' · lee_fichajes=' || coalesce(case when v_lee then 'SÍ' else 'no' end, '(sin fase 4)'));
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- ── 5. Permisos guardados del rol finanzas ────────────────────────────────
  insert into _diag values (5, '5. PERMISOS DE FINANZAS',
    coalesce((select string_agg(recurso_id, ', ' order by recurso_id)
              from public.rol_permisos where rol_id='finanzas' and ver),
             '(el rol finanzas no tiene ninguna sección)'));

  -- ── 6. El mapa de la fase 4 ───────────────────────────────────────────────
  -- También por EXECUTE: sin la fase 4 aplicada, la referencia a
  -- recurso_tablas no parsea aunque esté dentro de un CASE que no se ejecuta.
  if hay_f4 then
    execute $q$select coalesce(string_agg(tabla, ', ' order by tabla), '(vacío)')
               from public.recurso_tablas where recurso_id = 'personal'$q$ into v_txt;
  else
    v_txt := '(la fase 4 no está aplicada)';
  end if;
  insert into _diag values (6, '6. MAPA DE PERSONAL', v_txt);
end $$;

select bloque, detalle from _diag order by orden, detalle;
