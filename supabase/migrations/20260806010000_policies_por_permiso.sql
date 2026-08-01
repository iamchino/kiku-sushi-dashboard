-- ============================================================================
-- Fase 4 (parte 2) — Las policies pasan a obedecer la matriz de permisos
--
--   Este es el paso que hace que el permiso mande sobre los DATOS y no solo
--   sobre el menú. Hasta acá, darle "Caja" a cocina mostraba la pantalla y la
--   base rechazaba las consultas.
--
--   Qué hace, en orden:
--     1. Borra la policy global "admin full access", que le daba a admin
--        acceso a todas las tablas que existían al 15/06/2026 por fuera de
--        cualquier permiso. Mientras exista, el rol admin no es configurable.
--     2. Reemplaza las policies por rol (is_admin / is_operational_user /
--        is_mozo) por policies que consultan puede_tabla().
--     3. NO toca las policies de acceso propio (user_id = auth.uid()) ni las
--        de anon: el fichaje de cada uno y la carta web siguen igual.
--
--   Las policies se generan recorriendo el mapa recurso_tablas, no a mano:
--   una tabla nueva en el mapa queda cubierta sola, y no hay forma de que se
--   escriba mal el nombre de una.
--
-- ⚠️ ANTES DE APLICAR ESTO: corré supabase/SQL_EDITOR_SIMULACRO_FASE4.sql.
--    Simula cada rol contra cada tabla, aplica estos cambios, vuelve a
--    simular, te muestra el diff y hace ROLLBACK. Ves el impacto exacto sin
--    tocar nada.
-- ============================================================================

-- ─── 1. Fuera el bypass global de admin ─────────────────────────────────────
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select tablename from pg_policies
    where schemaname = 'public' and policyname = 'admin full access'
  loop
    execute format('drop policy %I on public.%I', 'admin full access', r.tablename);
    n := n + 1;
  end loop;
  raise notice 'Policies "admin full access" eliminadas: %', n;
end $$;

-- ─── 2. Policies derivadas del mapa ─────────────────────────────────────────
-- Dos por tabla: una de lectura y una de escritura. Nombres fijos para que
-- re-correr la migración las reemplace en vez de acumular.
do $$
declare
  tablas text[];
  t      text;
  n      int := 0;
begin
  -- Materializamos la lista ANTES de tocar nada: si iteráramos con un cursor
  -- sobre recurso_tablas, el ALTER TABLE de adentro fallaría con
  -- "cannot ALTER TABLE because it is being used by active queries".
  select array_agg(distinct tabla order by tabla) into tablas from public.recurso_tablas;

  foreach t in array coalesce(tablas, '{}')
  loop
    -- El mapa ya validó que la tabla existe, pero por las dudas.
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice 'Se omite %: no existe en esta base', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'permisos lectura', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using ((select public.puede_tabla(%L, 'ver')))
    $f$, 'permisos lectura', t, t);

    execute format('drop policy if exists %I on public.%I', 'permisos escritura', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using ((select public.puede_tabla(%L, 'editar')))
        with check ((select public.puede_tabla(%L, 'editar')))
    $f$, 'permisos escritura', t, t, t);

    n := n + 1;
  end loop;
  raise notice 'Tablas con policies por permiso: %', n;
end $$;
-- Nota sobre el `(select ...)` que envuelve la llamada: hace que Postgres la
-- evalúe UNA vez por consulta (InitPlan) en vez de una vez por fila. Sin eso,
-- un listado de 5.000 pedidos hacía 5.000 llamadas a la función.

-- ─── 3. Fuera las policies viejas por rol ───────────────────────────────────
-- Solo las que quedaron reemplazadas. Se listan por nombre exacto para no
-- borrar por accidente una de acceso propio o de anon.
do $$
declare
  p record;
  n int := 0;
  viejas text[] := array[
    'arca_request_log admin manage',
    'caja_turnos admin manage', 'caja_turnos finanzas read', 'mozo lee turnos de caja',
    'caja_movimientos admin manage',
    'auditoria admin read', 'auditoria admin insert',
    'admin manage facturacion_config',
    'admin manage comprobantes_fiscales', 'mozo lee comprobantes',
    'admin manage impresiones_documentos',
    'envio_config admin escribe', 'envio_zonas admin escribe',
    'web_config admin escribe', 'aperturas admin escribe',
    'reservas_config admin escribe', 'reservas_dias admin escribe',
    'admins manage clientes',
    'pagos lectura operativa', 'pagos admin manage', 'mozo cobra pagos', 'pagos finanzas read',
    'proveedores admin manage', 'proveedores finanzas manage',
    'mozo gestiona mesas', 'mozo lee salones', 'mozos operational manage',
    'empleados finanzas manage', 'egresos finanzas manage',
    'puntos finanzas manage', 'fichajes finanzas manage',
    'turnos finanzas manage', 'liquidaciones finanzas manage',
    'impresion_config_modify',
    'kitchen read active pedidos', 'kitchen read active pedido items',
    'reservas_select_authenticated', 'reservas_insert_authenticated',
    'reservas_update_authenticated', 'reservas_delete_authenticated',
    'notif_insert', 'notif_update', 'notif_delete',
    'lista_espera_select', 'lista_espera_insert',
    'lista_espera_update', 'lista_espera_delete',
    'tipos_comprobante lectura publica',
    'webhook_config_select'
  ];
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and (policyname = any(viejas) or policyname like 'operational users manage %')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    n := n + 1;
  end loop;
  raise notice 'Policies viejas por rol eliminadas: %', n;
end $$;

-- ─── 3.b Lecturas que son de TODO el dashboard, no de una sección ───────────
-- El banner de estado de impresora y la campanita de notificaciones se
-- renderizan en toda la app, para cualquier rol. Si su lectura dependiera de
-- una sección, un empleado que solo ficha vería errores en pantalla.
-- Las policies `impresion_config_select` y `notif_select` (using true) se
-- preservan a propósito. La ESCRITURA sí queda gobernada por la matriz.
do $$
begin
  if to_regclass('public.impresion_config') is not null then
    drop policy if exists "impresion_config_select" on public.impresion_config;
    create policy "impresion_config_select" on public.impresion_config
      for select to authenticated using (true);
  end if;
  if to_regclass('public.notificaciones') is not null then
    drop policy if exists "notif_select" on public.notificaciones;
    create policy "notif_select" on public.notificaciones
      for select to authenticated using (true);
  end if;
end $$;

-- ─── 4. Lo que NO se toca, a propósito ──────────────────────────────────────
--   · Acceso propio: "empleados self read", "fichajes self read",
--     "turnos self read", "liquidaciones self read", "device_tokens own rows".
--     Son user_id = auth.uid() y no dependen del rol: cualquiera ve lo suyo.
--   · Anon: la carta web (menu_items, especiales, web_config, envio_config,
--     reservas_config, aperturas_especiales) y el alta de pedidos desde la web.
--   · service_role: arca_tokens, webhook_config_write.
--
-- Quedan pendientes y anotados en docs/PERMISOS_CONFIGURABLES.md:
--   · `anon crear/leer pedidos` con using(true) sigue abierto. Acotarlo es un
--     cambio de la carta web, no de permisos, y merece su propio PR.

-- ─── 5. Verificación ────────────────────────────────────────────────────────
do $$
declare
  sin_policy text;
  bypass     int;
begin
  -- Toda tabla del mapa tiene que haber quedado con sus dos policies.
  select string_agg(t.tabla, ', ')
    into sin_policy
  from (select distinct tabla from public.recurso_tablas) t
  where to_regclass('public.' || quote_ident(t.tabla)) is not null
    and (select count(*) from pg_policies
          where schemaname = 'public' and tablename = t.tabla
            and policyname in ('permisos lectura', 'permisos escritura')) <> 2;

  if sin_policy is not null then
    raise exception 'Estas tablas del mapa quedaron sin las policies por permiso: %', sin_policy;
  end if;

  select count(*) into bypass
  from pg_policies where schemaname = 'public' and policyname = 'admin full access';

  if bypass > 0 then
    raise exception 'Todavía quedan % policies "admin full access".', bypass;
  end if;

  raise notice 'Fase 4 aplicada. Las policies ahora obedecen la matriz de permisos.';
end $$;

notify pgrst, 'reload schema';
