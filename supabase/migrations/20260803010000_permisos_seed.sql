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
  ('inicio',         'Inicio',          'Pantalla de bienvenida.',                          '/',                     'Servicio',     false, 5),
  ('operaciones',    'Operaciones',     'Tablero operativo de cocina.',                     '/operaciones',          'Servicio',     false, 10),
  ('pedidos',        'Órdenes',         'Pedidos de salón, delivery y take away.',          '/pedidos',              'Servicio',     false, 20),
  ('mesas',          'Mesas',           'Abrir, cobrar y cerrar mesas del salón.',          '/mesas',                'Servicio',     false, 30),
  ('reservas',       'Reservas',        'Reservas y lista de espera.',                      '/reservas',             'Servicio',     false, 40),
  ('platos',         'Platos',          'Estado de los platos en preparación.',             '/platos',               'Servicio',     false, 50),
  ('cocina_kds',     'Cocina (KDS)',    'Pantalla de cocina. Hoy oculta del menú.',         '/cocina',               'Servicio',     false, 60),

  -- Producto
  ('menu',           'Menú & Carta',    'Carta, precios, especiales y novedades de la web.', '/menu',                'Producto',      false, 110),
  ('produccion',     'Producción',      'Listas y tareas de producción.',                   '/produccion',           'Producto',      false, 120),
  ('stock',          'Inventario',      'Stock e ingresos de mercadería.',                  '/stock',                'Producto',      false, 130),
  ('recetas',        'Recetas',         'Recetas, ingredientes y combos.',                  '/recetas',              'Producto',      false, 140),

  -- Negocio
  ('analiticas',     'Analíticas',      'Ventas, tendencias y el vivo del día.',            '/analiticas',           'Análisis',       false, 310),
  ('caja',           'Caja y facturación', 'Arqueo, turnos de caja y facturación fiscal. El botón Pagos registra todos los egresos.', '/caja',                 'Dinero',       true,  210),
  ('clientes',       'Clientes',        'Base de clientes.',                                '/clientes',             'Análisis',       false, 320),
  ('notificaciones', 'Notificaciones',  'Bandeja de notificaciones del sistema.',           '/notificaciones',       'Análisis',       false, 330),
  ('proveedores',    'Proveedores',     'Alta y edición de proveedores.',                   '/proveedores',          'Producto',       false, 150),

  -- Configuración
  ('configuracion',  'Configuración',   'Impresoras, envíos, horarios y reservas.',         '/configuracion',        'Ajustes', false, 510),
  ('config_salon',   'Salón',           'Mapa de mesas, salones y mozos.',                  '/configuracion/salon',  'Ajustes', false, 520),

  -- Plata y personas
  ('finanzas',       'Finanzas',        'Egresos, sueldos e ingresos. Información sensible.', '/finanzas',           'Dinero',      true,  220),
  ('personal',       'Personal',        'Legajo, fichajes, liquidación y logins del sistema.', '/personal',          'Equipo',      true,  410),
  ('permisos',       'Permisos',        'Editar qué puede hacer cada rol. Vive dentro de Personal.', null,           'Equipo',      true,  415),

  -- Propio
  ('fichar',         'Fichar',          'Marcar entrada y salida con el QR del local.',     '/fichar',               'Equipo',    false, 420),
  ('mis_horas',      'Mis horas',       'Ver las horas propias y su liquidación.',          '/mis-horas',            'Equipo',    false, 430)
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
