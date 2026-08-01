-- ############################################################################
--
--  KIKU SUSHI — Fase 4: las policies obedecen la matriz de permisos
--
--  *** ESTO SÍ APLICA LOS CAMBIOS. ***
--  Corré ANTES supabase/SQL_EDITOR_SIMULACRO_FASE4.sql y revisá el diff.
--
--  Va todo en una transacción: si algo falla, no se aplica nada.
--
-- ############################################################################

begin;

-- ============================================================================
-- Fase 4 (parte 1) — Mapa recurso → tablas
--
--   Hasta ahora los permisos mandaban sobre el MENÚ. Las tablas seguían
--   gobernadas por is_admin() / is_operational_user() / is_mozo(), así que
--   darle "Caja" a cocina mostraba la pantalla y la base rechazaba los datos.
--
--   Para cerrar esa brecha hace falta responder: ¿qué tablas necesita cada
--   sección? Y ahí aparece la dificultad real del problema: la relación NO es
--   uno a uno. `pedidos` la leen Órdenes, Cocina, Platos, Analíticas, Mesas y
--   Caja. `menu_items` la leen Menú, Órdenes, Mesas y Recetas.
--
--   Por eso el mapa es una tabla y no una columna: cada tabla puede pertenecer
--   a varios recursos, y el acceso se concede si el rol tiene AL MENOS UNO de
--   ellos. Además se distingue quién solo lee de quién además escribe:
--   Analíticas lee `pedidos` pero no tiene por qué poder modificarlos.
-- ============================================================================

create table if not exists public.recurso_tablas (
  recurso_id text    not null references public.recursos(id) on update cascade on delete cascade,
  tabla      text    not null,
  -- true  → ese recurso implica poder escribir la tabla
  -- false → solo lectura (p. ej. analiticas sobre pedidos)
  escribe    boolean not null default true,
  primary key (recurso_id, tabla)
);

comment on table public.recurso_tablas is
  'Qué tablas necesita cada sección. Una tabla puede estar en varios recursos: '
  'el acceso se concede si el rol tiene alguno. Lo mantiene el código, no la UI.';

alter table public.recurso_tablas enable row level security;

drop policy if exists "recurso_tablas lectura autenticada" on public.recurso_tablas;
create policy "recurso_tablas lectura autenticada"
  on public.recurso_tablas for select to authenticated using (true);

drop policy if exists "recurso_tablas escritura service" on public.recurso_tablas;
create policy "recurso_tablas escritura service"
  on public.recurso_tablas for all to service_role using (true) with check (true);

-- ─── puede_tabla() ──────────────────────────────────────────────────────────
-- El helper que van a usar las policies. Devuelve true si el rol del usuario
-- tiene algún recurso que habilite esa tabla con esa acción.
--
-- ⚠️ security definer, igual que tiene_permiso(): lee rol_permisos, que tiene
-- RLS, y sin esto una policy que lo llame entraría en recursión.
create or replace function public.puede_tabla(p_tabla text, p_accion text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recurso_tablas rt
    join public.rol_permisos rp on rp.recurso_id = rt.recurso_id
    where rt.tabla = p_tabla
      and rp.rol_id = public.current_app_role()
      and case p_accion
            when 'editar' then rp.editar and rt.escribe
            when 'ver'    then rp.ver
            else false          -- falla cerrado ante una acción desconocida
          end
  )
$$;

revoke execute on function public.puede_tabla(text, text) from public;
grant  execute on function public.puede_tabla(text, text) to authenticated;

comment on function public.puede_tabla(text, text) is
  'True si el rol del usuario tiene alguna sección que habilite esa tabla. '
  'p_accion: ''ver'' o ''editar''. Cualquier otro valor devuelve false.';

-- ─── Un recurso nuevo: configuración avanzada ───────────────────────────────
-- El mozo tiene la sección Configuración para poder corregir la IP de la
-- impresora desde el celular. Pero esa sección también contiene los costos de
-- envío, las zonas de delivery y los horarios de reservas.
--
-- Mientras los permisos gobernaban solo el menú daba igual: la UI ya le muestra
-- únicamente el tab de Impresoras. Ahora que gobiernan los DATOS, dejarlo así
-- le daría acceso de escritura real a los precios del delivery. El simulacro
-- lo detectó.
--
-- Se parte en dos: `configuracion` queda con las impresoras (lo que el mozo
-- necesita) y `config_avanzada` con el resto, solo para admin.
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('config_avanzada', 'Configuración avanzada',
   'Costos de envío, zonas de delivery, horarios y aperturas especiales. Vive dentro de Configuración.',
   null, 'Configuración', false, 315)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion,
      grupo = excluded.grupo, orden = excluded.orden;

-- Se lo damos a quien ya tenía Configuración con acceso total, o sea admin.
insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select 'admin', 'config_avanzada', true, true
where exists (select 1 from public.roles where id = 'admin')
on conflict (rol_id, recurso_id) do nothing;

-- ─── El mapa ────────────────────────────────────────────────────────────────
insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  -- Órdenes
  ('pedidos', 'pedidos', true), ('pedidos', 'pedido_items', true),
  ('pedidos', 'menu_items', false), ('pedidos', 'menu_item_variantes', false),
  ('pedidos', 'clientes', true),

  -- Cocina (KDS) y Platos: ven las comandas, no las crean desde cero
  ('cocina_kds', 'pedidos', true), ('cocina_kds', 'pedido_items', true),
  ('cocina_kds', 'menu_items', false), ('cocina_kds', 'menu_item_variantes', false),
  ('platos',     'pedidos', true), ('platos', 'pedido_items', true),
  ('platos',     'menu_items', false), ('platos', 'menu_item_variantes', false),

  -- Operaciones: el tablero de cocina
  ('operaciones', 'pedidos', true), ('operaciones', 'pedido_items', true),
  ('operaciones', 'menu_items', false), ('operaciones', 'menu_item_variantes', false),

  -- Mesas y salón
  ('mesas', 'mesas', true), ('mesas', 'salones', false), ('mesas', 'mozos', false),
  ('mesas', 'pedidos', true), ('mesas', 'pedido_items', true),
  ('mesas', 'menu_items', false), ('mesas', 'menu_item_variantes', false),
  ('mesas', 'clientes', true), ('mesas', 'tipos_comprobante', false),
  ('mesas', 'pagos', true), ('mesas', 'caja_turnos', false),
  ('mesas', 'comprobantes_fiscales', true), ('mesas', 'facturacion_config', false),
  ('mesas', 'impresiones_documentos', true),
  ('config_salon', 'mesas', true), ('config_salon', 'salones', true),
  ('config_salon', 'mozos', true),

  -- Reservas
  ('reservas', 'reservas', true), ('reservas', 'lista_espera', true),

  -- Menú y carta
  ('menu', 'menu_items', true), ('menu', 'menu_item_variantes', true),
  ('menu', 'especiales', true), ('menu', 'especial_pasos', true),
  ('menu', 'web_config', true),

  -- Producción, stock, recetas
  ('produccion', 'produccion_listas', true), ('produccion', 'produccion_tareas', true),
  ('produccion', 'recetas', false), ('produccion', 'stock', true),
  ('stock', 'stock', true), ('stock', 'stock_movimientos', true),
  ('stock', 'recetas', false),
  ('recetas', 'recetas', true), ('recetas', 'receta_ingredientes', true),
  ('recetas', 'combos', true), ('recetas', 'combo_items', true),
  ('recetas', 'menu_items', false), ('recetas', 'stock', false),

  -- Analíticas: solo lee
  ('analiticas', 'pedidos', false), ('analiticas', 'pedido_items', false),
  ('analiticas', 'stock', false),

  -- Caja y fiscal
  ('caja', 'caja_turnos', true), ('caja', 'caja_movimientos', true),
  ('caja', 'caja_turnos_auditoria', true), ('caja', 'pagos', true),
  ('caja', 'comprobantes_fiscales', true), ('caja', 'facturacion_config', true),
  ('caja', 'impresiones_documentos', true), ('caja', 'tipos_comprobante', false),
  ('caja', 'arca_request_log', true),
  ('caja', 'pedidos', false), ('caja', 'pedido_items', false),
  ('caja', 'menu_items', false), ('caja', 'menu_item_variantes', false),

  -- Clientes, notificaciones, proveedores
  ('clientes', 'clientes', true),
  ('notificaciones', 'notificaciones', true),
  ('proveedores', 'proveedores', true),

  -- Configuración: solo las impresoras, que es lo que el mozo necesita
  ('configuracion', 'impresion_config', true),

  -- Configuración avanzada: lo que NO tiene que poder tocar un mozo
  ('config_avanzada', 'envio_config', true), ('config_avanzada', 'envio_zonas', true),
  ('config_avanzada', 'aperturas_especiales', true),
  ('config_avanzada', 'reservas_config', true), ('config_avanzada', 'reservas_dias', true),
  ('config_avanzada', 'webhook_config', false),

  -- Finanzas
  ('finanzas', 'egresos', true), ('finanzas', 'empleados', true),
  ('finanzas', 'proveedores', true),
  ('finanzas', 'caja_turnos', false), ('finanzas', 'pagos', false),

  -- Personal
  ('personal', 'empleados', true), ('personal', 'fichajes', true),
  ('personal', 'turnos', true), ('personal', 'liquidaciones', true),
  ('personal', 'puntos_fichaje', true), ('personal', 'egresos', true),

  -- OJO: las tablas del propio sistema de permisos (roles, recursos,
  -- rol_permisos, recurso_tablas) NO van en este mapa. Ya tienen sus policies
  -- desde la fase 1, gobernadas por puede_administrar_permisos(), y meterlas
  -- acá crearía un segundo camino de acceso sobre las mismas tablas — además
  -- de un problema circular: el loop que genera las policies recorre
  -- recurso_tablas y no puede alterarla mientras la está leyendo.

  -- Fichaje propio: la lectura del punto de QR. El resto del fichaje va por
  -- las policies de acceso propio (user_id = auth.uid()), que no se tocan.
  ('fichar', 'puntos_fichaje', false)
on conflict (recurso_id, tabla) do update set escribe = excluded.escribe;

-- ─── Chequeo del propio mapa ────────────────────────────────────────────────
do $$
declare
  faltantes text;
begin
  -- Toda tabla del mapa tiene que existir. Un typo acá dejaría una tabla sin
  -- ninguna forma de acceder salvo el bypass de emergencia.
  select string_agg(distinct rt.tabla, ', ')
    into faltantes
  from public.recurso_tablas rt
  where to_regclass('public.' || quote_ident(rt.tabla)) is null;

  if faltantes is not null then
    raise exception 'El mapa recurso_tablas referencia tablas que no existen: %', faltantes;
  end if;
end $$;

notify pgrst, 'reload schema';

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

commit;
