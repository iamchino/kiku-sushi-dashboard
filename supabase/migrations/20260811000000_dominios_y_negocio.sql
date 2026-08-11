-- ============================================================================
-- Reorganización en dominios + white-label básico
--
--   1) El catálogo de secciones se reagrupa en 6 DOMINIOS. La barra lateral
--      deja de ser una lista plana de 18 items y pasa a mostrar los dominios;
--      dentro de cada uno, las secciones aparecen como pestañas.
--
--        Servicio   → lo que pasa en el salón ahora mismo
--        Producto   → carta, producción, stock, recetas, proveedores
--        Dinero     → caja, pagos, caja fuerte, finanzas
--        Análisis   → ventas, clientes, notificaciones
--        Equipo     → personal, permisos, fichaje
--        Ajustes    → configuración
--
--      El `orden` se recalcula con cuidado quirúrgico: la ruta por defecto de
--      cada rol es "la primera sección visible por orden", así que el orden
--      nuevo PRESERVA los defaults actuales (admin → /, cocina → /operaciones,
--      mozo → /mesas, empleado → /fichar, finanzas → /finanzas). Hay un test
--      que lo verifica.
--
--   2) White-label: nombre, subtítulo y color de acento del negocio pasan a
--      web_config. "KIKU SUSHI" deja de estar hardcodeado — el mismo sistema
--      se instala para otro gastronómico cambiando tres campos.
-- ============================================================================

-- ─── 1. Dominios ────────────────────────────────────────────────────────────
update public.recursos set grupo = v.grupo, orden = v.orden
from (values
  -- Servicio
  ('inicio',          'Servicio',   5),
  ('operaciones',     'Servicio',  10),
  ('pedidos',         'Servicio',  20),
  ('mesas',           'Servicio',  30),
  ('reservas',        'Servicio',  40),
  ('platos',          'Servicio',  50),
  ('cocina_kds',      'Servicio',  60),
  -- Producto
  ('menu',            'Producto', 110),
  ('produccion',      'Producto', 120),
  ('stock',           'Producto', 130),
  ('recetas',         'Producto', 140),
  ('proveedores',     'Producto', 150),
  -- Dinero
  ('caja',            'Dinero',   210),
  ('pagos',           'Dinero',   215),
  ('caja_fuerte',     'Dinero',   216),
  ('finanzas',        'Dinero',   220),
  -- Análisis
  ('analiticas',      'Análisis', 310),
  ('clientes',        'Análisis', 320),
  ('notificaciones',  'Análisis', 330),
  -- Equipo
  ('personal',        'Equipo',   410),
  ('permisos',        'Equipo',   415),
  ('fichar',          'Equipo',   420),
  ('mis_horas',       'Equipo',   430),
  -- Ajustes
  ('configuracion',   'Ajustes',  510),
  ('config_avanzada', 'Ajustes',  515),
  ('config_salon',    'Ajustes',  520)
) as v(id, grupo, orden)
where recursos.id = v.id;

-- ─── 2. White-label ─────────────────────────────────────────────────────────
alter table public.web_config
  add column if not exists negocio_nombre    text not null default 'KIKU SUSHI',
  add column if not exists negocio_subtitulo text not null default 'Sistema de gestión',
  -- Color base del acento del dashboard (hex). Los tonos derivados (hover,
  -- bordes, fondos suaves) los calcula el front a partir de este.
  add column if not exists negocio_color     text not null default '#2a1d3d'
    check (negocio_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.web_config.negocio_nombre is
  'Nombre del negocio: marca del dashboard (sidebar, login). White-label.';
comment on column public.web_config.negocio_color is
  'Color de acento del dashboard en hex. El front deriva los tonos.';

notify pgrst, 'reload schema';
