import { createContext } from 'react'

export const VALID_ROLES = new Set(['admin', 'cocina', 'mozo', 'empleado', 'finanzas'])
export const DEFAULT_ROLE = 'cocina'

// La sección Finanzas es exclusiva. Se habilita por DOS vías equivalentes:
//   1) email en esta lista blanca (histórico, se mantiene),
//   2) rol 'finanzas' en app_metadata (preferido para usuarios nuevos).
// El resto de los admin (p. ej. el dueño) NO ve Finanzas.
// Si tocás esto, actualizá también is_finanzas_user() en la BD
// (supabase/migrations/20260801000000_rol_finanzas.sql), que aplica la MISMA
// regla sobre las RLS de empleados/egresos. Si el front y la BD se
// desincronizan, la persona ve la pantalla pero sin datos.
export const FINANZAS_EMAILS = new Set(['finanzas@kikusushi.com.ar'])

export function canAccessFinanzas(user) {
  const email = (user?.email || '').toLowerCase()
  if (FINANZAS_EMAILS.has(email)) return true
  // OJO: a propósito NO usamos getRoleFromUser() acá. Esa función acepta
  // user_metadata.role como fallback, y user_metadata lo puede editar el propio
  // usuario desde el cliente (auth.updateUser). Para Finanzas exigimos
  // app_metadata.role, que solo se escribe con la service key (Edge Function).
  // Es la misma regla que aplica is_finanzas_user() en la BD.
  return user?.app_metadata?.role === 'finanzas'
}

// Cocina: bloqueo por lista negra (todo lo operativo de cocina permitido).
export const COCINA_DEFAULT_ROUTE = '/operaciones'
export const COCINA_BLOCKED_ROUTES = new Set([
  '/', '/dashboard', '/analiticas', '/caja', '/clientes',
  '/mesas', '/reservas', '/configuracion/salon', '/configuracion', '/notificaciones',
  '/platos', '/proveedores', '/finanzas', '/personal',
])

// Mozo: lista blanca. Mesas (abrir/cerrar/cobrar), platos de cocina, stock y
// la configuración (para corregir la IP de la impresora desde su celular;
// solo ve el tab de Impresoras, ver Configuracion.jsx).
export const MOZO_DEFAULT_ROUTE = '/mesas'
export const MOZO_ALLOWED_ROUTES = new Set([
  '/mesas',
  '/platos',
  '/stock',
  '/configuracion',
  // Fichaje: un mozo también puede estar vinculado a un empleado y fichar.
  '/fichar',
  '/mis-horas',
])

// Finanzas: lista blanca. Solo su módulo (egresos/legajo/liquidación) y el
// fichaje propio — la encargada de finanzas también marca sus horas.
// No ve la operación del restaurante (mesas, pedidos, cocina, stock).
export const FINANZAS_DEFAULT_ROUTE = '/finanzas'
export const FINANZAS_ALLOWED_ROUTES = new Set([
  '/finanzas',
  '/personal',
  '/fichar',
  '/mis-horas',
])

// Empleado (control de horas): lista blanca mínima. Solo ficha y ve sus horas.
export const EMPLEADO_DEFAULT_ROUTE = '/fichar'
export const EMPLEADO_ALLOWED_ROUTES = new Set([
  '/fichar',
  '/mis-horas',
])

export const RoleContext = createContext(DEFAULT_ROLE)
export const FinanzasAccessContext = createContext(false)

export function getRoleFromUser(user) {
  if (user?.email?.toLowerCase() === 'cocina@kikusushi.com') return 'cocina'

  // 'finanzas' SOLO puede venir de app_metadata: user_metadata lo escribe el
  // propio usuario con auth.updateUser(), así que aceptarlo acá dejaría que
  // cualquiera se auto-asigne el rol. La BD igual lo frenaría (is_finanzas_user
  // mira app_metadata), pero el front quedaría mostrando pantallas sin datos.
  if (user?.app_metadata?.role === 'finanzas') return 'finanzas'

  const role = user?.app_metadata?.role || user?.user_metadata?.role
  if (role === 'finanzas') return DEFAULT_ROLE
  return VALID_ROLES.has(role) ? role : DEFAULT_ROLE
}

export function getDefaultRoute(role) {
  if (role === 'cocina') return COCINA_DEFAULT_ROUTE
  if (role === 'mozo') return MOZO_DEFAULT_ROUTE
  if (role === 'empleado') return EMPLEADO_DEFAULT_ROUTE
  if (role === 'finanzas') return FINANZAS_DEFAULT_ROUTE
  return '/'
}

export function canAccessRoute(role, pathname) {
  const normalizedPath = pathname === '' ? '/' : pathname

  if (role === 'mozo') return MOZO_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'empleado') return EMPLEADO_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'finanzas') return FINANZAS_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'cocina') return !COCINA_BLOCKED_ROUTES.has(normalizedPath)
  return true
}
