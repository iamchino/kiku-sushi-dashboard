--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: envio_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.envio_config (id, base, updated_at) VALUES (1, 3500.00, '2026-06-20 16:24:53.416439+00');


--
-- Data for Name: impresion_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.impresion_config (id, server_host, printer_comanda_name, printer_comanda_type, printer_ticket_name, printer_ticket_type, printer_fiscal_name, printer_fiscal_type, font_size, paper_width, chars_per_line, created_at, updated_at) VALUES ('187611c6-da09-4387-8981-4987b2e8be3a', '192.168.100.155:8443', 'POS58 Printer', 'USB', 'POS58 Printer', 'USB', 'POS58 Printer', 'USB', 2, 58, 26, '2026-05-26 16:29:33.137212+00', '2026-08-16 02:20:19.685047+00');


--
-- Data for Name: recursos; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('inicio', 'Inicio', 'Pantalla de bienvenida.', '/', 'Servicio', false, 5);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('operaciones', 'Operaciones', 'Tablero operativo de cocina.', '/operaciones', 'Servicio', false, 10);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('pedidos', 'Órdenes', 'Pedidos de salón, delivery y take away.', '/pedidos', 'Servicio', false, 20);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('mesas', 'Mesas', 'Abrir, cobrar y cerrar mesas del salón.', '/mesas', 'Servicio', false, 30);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('reservas', 'Reservas', 'Reservas y lista de espera.', '/reservas', 'Servicio', false, 40);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('platos', 'Platos', 'Estado de los platos en preparación.', '/platos', 'Servicio', false, 50);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('cocina_kds', 'Cocina (KDS)', 'Pantalla de cocina. Hoy oculta del menú.', '/cocina', 'Servicio', false, 60);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('menu', 'Menú & Carta', 'Carta, precios, especiales y novedades de la web.', '/menu', 'Producto', false, 110);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('produccion', 'Producción', 'Listas y tareas de producción.', '/produccion', 'Producto', false, 120);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('stock', 'Inventario', 'Stock e ingresos de mercadería.', '/stock', 'Producto', false, 130);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('recetas', 'Recetas', 'Recetas, ingredientes y combos.', '/recetas', 'Producto', false, 140);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('analiticas', 'Analíticas', 'Ventas, tendencias y el vivo del día.', '/analiticas', 'Análisis', false, 310);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('clientes', 'Clientes', 'Base de clientes.', '/clientes', 'Análisis', false, 320);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('notificaciones', 'Notificaciones', 'Bandeja de notificaciones del sistema.', '/notificaciones', 'Análisis', false, 330);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('proveedores', 'Proveedores', 'Alta y edición de proveedores.', '/proveedores', 'Producto', false, 150);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('configuracion', 'Configuración', 'Impresoras, envíos, horarios y reservas.', '/configuracion', 'Ajustes', false, 510);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('config_salon', 'Salón', 'Mapa de mesas, salones y mozos.', '/configuracion/salon', 'Ajustes', false, 520);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('finanzas', 'Finanzas', 'Egresos, sueldos e ingresos. Información sensible.', '/finanzas', 'Dinero', true, 220);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('personal', 'Personal', 'Legajo, fichajes, liquidación y logins del sistema.', '/personal', 'Equipo', true, 410);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('permisos', 'Permisos', 'Editar qué puede hacer cada rol. Vive dentro de Personal.', NULL, 'Equipo', true, 415);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('fichar', 'Fichar', 'Marcar entrada y salida con el QR del local.', '/fichar', 'Equipo', false, 420);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('mis_horas', 'Mis horas', 'Ver las horas propias y su liquidación.', '/mis-horas', 'Equipo', false, 430);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('config_avanzada', 'Configuración avanzada', 'Costos de envío, zonas de delivery, horarios y aperturas especiales. Vive dentro de Configuración.', NULL, 'Ajustes', false, 515);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('pagos', 'Pagos', 'Registrar egresos (sueldos, proveedores, servicios) desde Caja, con caja abierta o cerrada. Incluye los montos de sueldos.', NULL, 'Dinero', true, 215);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('caja', 'Caja y facturación', 'Arqueo, turnos de caja y facturación fiscal. El botón Pagos registra todos los egresos.', '/caja', 'Dinero', true, 210);
INSERT INTO public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) VALUES ('caja_fuerte', 'Caja fuerte', 'El efectivo del negocio fuera de la caja registradora: depósitos al cierre de turno, pagos y saldo. Vive dentro de Caja y facturación.', NULL, 'Dinero', true, 216);


--
-- Data for Name: recurso_tablas; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pedidos', 'pedidos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pedidos', 'pedido_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pedidos', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pedidos', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pedidos', 'clientes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('cocina_kds', 'pedidos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('cocina_kds', 'pedido_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('cocina_kds', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('cocina_kds', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('platos', 'pedidos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('platos', 'pedido_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('platos', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('platos', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('operaciones', 'pedidos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('operaciones', 'pedido_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('operaciones', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('operaciones', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'mesas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'salones', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'mozos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'pedidos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'pedido_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'clientes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'tipos_comprobante', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'pagos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'caja_turnos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'comprobantes_fiscales', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'facturacion_config', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('mesas', 'impresiones_documentos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_salon', 'mesas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_salon', 'salones', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_salon', 'mozos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('reservas', 'reservas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('reservas', 'lista_espera', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('menu', 'menu_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('menu', 'menu_item_variantes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('menu', 'especiales', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('menu', 'especial_pasos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('menu', 'web_config', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('produccion', 'produccion_listas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('produccion', 'produccion_tareas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('produccion', 'recetas', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('produccion', 'stock', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('stock', 'stock', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('stock', 'stock_movimientos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('stock', 'recetas', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'recetas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'receta_ingredientes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'combos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'combo_items', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('recetas', 'stock', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('analiticas', 'pedidos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('analiticas', 'pedido_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('analiticas', 'stock', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'caja_turnos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'caja_movimientos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'caja_turnos_auditoria', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'pagos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'comprobantes_fiscales', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'facturacion_config', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'impresiones_documentos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'tipos_comprobante', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'arca_request_log', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'pedidos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'pedido_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'menu_items', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('caja', 'menu_item_variantes', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('clientes', 'clientes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('notificaciones', 'notificaciones', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('proveedores', 'proveedores', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('configuracion', 'impresion_config', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'envio_config', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'envio_zonas', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'aperturas_especiales', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'reservas_config', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'reservas_dias', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('config_avanzada', 'webhook_config', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('finanzas', 'egresos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('finanzas', 'empleados', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('finanzas', 'proveedores', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('finanzas', 'caja_turnos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('finanzas', 'pagos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'empleados', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'fichajes', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'turnos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'liquidaciones', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'puntos_fichaje', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('personal', 'egresos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('fichar', 'puntos_fichaje', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pagos', 'egresos', true);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pagos', 'proveedores', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pagos', 'caja_turnos', false);
INSERT INTO public.recurso_tablas (recurso_id, tabla, escribe) VALUES ('pagos', 'caja_movimientos', true);


--
-- Data for Name: reservas_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reservas_config (id, mediodia_slots, noche_slots, orden_llegada_slots, updated_at) VALUES (1, '{12:30,13:00,13:30,14:00,14:30,15:00}', '{20:00,20:30,21:00,21:30,22:00}', '{22:30,23:00}', '2026-07-21 21:37:07.883654+00');


--
-- Data for Name: reservas_dias; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (0, false, false);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (1, false, false);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (2, false, true);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (3, true, true);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (4, false, true);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (5, false, true);
INSERT INTO public.reservas_dias (dow, mediodia, noche) VALUES (6, true, true);


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.roles (id, nombre, descripcion, sistema, orden, created_at, updated_at) VALUES ('admin', 'Admin', 'Dashboard completo: operación, producto, caja y configuración.', true, 10, '2026-08-01 16:02:15.21002+00', '2026-08-01 16:23:52.506268+00');
INSERT INTO public.roles (id, nombre, descripcion, sistema, orden, created_at, updated_at) VALUES ('finanzas', 'Finanzas', 'Sueldos, legajo, egresos y liquidación. Administra los logins del sistema.', true, 20, '2026-08-01 16:02:15.21002+00', '2026-08-01 16:23:52.506268+00');
INSERT INTO public.roles (id, nombre, descripcion, sistema, orden, created_at, updated_at) VALUES ('cocina', 'Cocina', 'Operación de cocina: comandas, producción, stock y recetas.', true, 30, '2026-08-01 16:02:15.21002+00', '2026-08-01 16:23:52.506268+00');
INSERT INTO public.roles (id, nombre, descripcion, sistema, orden, created_at, updated_at) VALUES ('mozo', 'Mozo', 'Salón: abrir, cobrar y cerrar mesas.', true, 40, '2026-08-01 16:02:15.21002+00', '2026-08-01 16:23:52.506268+00');
INSERT INTO public.roles (id, nombre, descripcion, sistema, orden, created_at, updated_at) VALUES ('empleado', 'Empleado', 'Solo fichaje y sus propias horas.', true, 50, '2026-08-01 16:02:15.21002+00', '2026-08-01 16:23:52.506268+00');


--
-- Data for Name: rol_permisos; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'inicio', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'operaciones', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'pedidos', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'mesas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'reservas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'platos', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'cocina_kds', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'menu', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'produccion', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'stock', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'recetas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'analiticas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'caja', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'clientes', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'notificaciones', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'proveedores', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'configuracion', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'config_salon', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'fichar', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'mis_horas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'operaciones', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'pedidos', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'cocina_kds', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'menu', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'produccion', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'stock', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'recetas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'fichar', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('cocina', 'mis_horas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'mesas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'platos', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'stock', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'configuracion', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'fichar', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('mozo', 'mis_horas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('empleado', 'fichar', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('empleado', 'mis_horas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'finanzas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'personal', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'permisos', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'fichar', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'mis_horas', true, true, '2026-08-01 16:02:15.21002+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'config_avanzada', true, true, '2026-08-01 17:49:46.288647+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'pagos', true, true, '2026-08-07 01:19:16.057791+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'pagos', true, true, '2026-08-07 01:19:16.057791+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('admin', 'caja_fuerte', true, true, '2026-08-07 01:49:18.009229+00');
INSERT INTO public.rol_permisos (rol_id, recurso_id, ver, editar, updated_at) VALUES ('finanzas', 'caja_fuerte', true, true, '2026-08-07 01:49:18.009229+00');


--
-- Data for Name: tipos_comprobante; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (1, 'A', 'Factura A', false, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (2, 'A', 'Nota de Débito A', true, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (3, 'A', 'Nota de Crédito A', true, -1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (6, 'B', 'Factura B', false, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (7, 'B', 'Nota de Débito B', true, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (8, 'B', 'Nota de Crédito B', true, -1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (11, 'C', 'Factura C', false, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (12, 'C', 'Nota de Débito C', true, 1);
INSERT INTO public.tipos_comprobante (codigo, letra, descripcion, es_nota, signo) VALUES (13, 'C', 'Nota de Crédito C', true, -1);


--
-- Data for Name: web_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.web_config (id, anuncio_texto, anuncio_activo, updated_at, omakase_precio, novedad_activo, novedad_overline, novedad_titulo, novedad_titulo_accent, novedad_descripcion, novedad_precio, novedad_imagenes, libre_precio, libre_sena, libre_multa_pieza, libre_pago_nota, cubierto_precio, agua_texto, negocio_nombre, negocio_subtitulo, negocio_color) VALUES (1, 'Disfrutando de nuestro salón antes de las 21:00 hs, accedés a un 15% OFF en todos los platos de nuestra carta. (No incluye especiales)', false, '2026-08-10 23:57:28.92+00', 70000, true, '', 'Lo nuevo:', 'KIKU MEDIODÍA', 'Desde el martes 11 de agosto
Martes a Viernes | 11:00 a 16:00 hs
 | 2 Menús para elegir 
 | Disponible salón, delivery y take away', 0, '[{"alt": "", "url": "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/novedad/1786405934557-nsfx87.jpeg"}, {"alt": "", "url": "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/novedad/1784429148716-43wneg.JPG"}, {"alt": "", "url": "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/novedad/1786406184860-czzmjr.jpg"}, {"alt": "", "url": "https://sepyieuxsmxhzobtmzxb.supabase.co/storage/v1/object/public/menu-images/novedad/1786406231273-sauq14.jpg"}]', 53500, 20000, 1000, 'Efectivo o transferencia · Otro medio de pago consultar', 3500, 'Este establecimiento garantiza a cada comensal un vaso de agua potable de 375 ml sin cargo.', 'KIKU SUSHI', 'Sistema de gestión', '#2a1d3d');


--
-- PostgreSQL database dump complete
--


