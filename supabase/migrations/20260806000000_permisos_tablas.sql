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
  -- Bypass por email para el DOMINIO de Finanzas, espejando al front
  -- (RECURSOS_FINANZAS en permisosCore.js): la cuenta histórica tiene rol
  -- admin y entra a Finanzas/Personal por lista blanca de email. Sin esto,
  -- el menú le muestra las pantallas y la base le niega los datos — veía
  -- solo sus propios fichajes y no podía liquidar sueldos.
  or (
    public.is_finanzas_user()
    and exists (
      select 1 from public.recurso_tablas rt2
      where rt2.tabla = p_tabla
        and rt2.recurso_id in ('finanzas', 'personal', 'permisos')
        and (p_accion = 'ver' or (p_accion = 'editar' and rt2.escribe))
    )
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
   null, 'Ajustes', false, 515)
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
