import { createContext } from 'react'

export const VALID_ROLES = new Set(['admin', 'cocina', 'mozo'])
export const DEFAULT_ROLE = 'cocina'

// La sección Finanzas es exclusiva de estos emails (acceso absoluto).
// El resto de los admin (p. ej. el dueño) NO ve Finanzas.
// Para sumar/cambiar quién accede, editá este set y la función is_finanzas_user() en la BD.
export const FINANZAS_EMAILS = new Set(['finanzas@kikusushi.com.ar'])

export function canAccessFinanzas(user) {
  const email = (user?.email || '').toLowerCase()
  return FINANZAS_EMAILS.has(email)
}

// Cocina: bloqueo por lista negra (todo lo operativo de cocina permitido).
export const COCINA_DEFAULT_ROUTE = '/operaciones'
export const COCINA_BLOCKED_ROUTES = new Set([
  '/', '/dashboard', '/analiticas', '/caja', '/clientes',
  '/mesas', '/reservas', '/configuracion/salon', '/notificaciones',
  '/platos', '/proveedores', '/finanzas',
])

// Mozo: lista blanca. Mesas (abrir/cerrar/cobrar), platos de cocina y stock.
export const MOZO_DEFAULT_ROUTE = '/mesas'
export const MOZO_ALLOWED_ROUTES = new Set([
  '/mesas',
  '/platos',
  '/stock',
])

export const RoleContext = createContext(DEFAULT_ROLE)
export const FinanzasAccessContext = createContext(false)

export function getRoleFromUser(user) {
  if (user?.email?.toLowerCase() === 'cocina@kikusushi.com') return 'cocina'

  const role = user?.app_metadata?.role || user?.user_metadata?.role
  return VALID_ROLES.has(role) ? role : DEFAULT_ROLE
}

export function getDefaultRoute(role) {
  if (role === 'cocina') return COCINA_DEFAULT_ROUTE
  if (role === 'mozo') return MOZO_DEFAULT_ROUTE
  return '/'
}

export function canAccessRoute(role, pathname) {
  const normalizedPath = pathname === '' ? '/' : pathname

  if (role === 'mozo') return MOZO_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'cocina') return !COCINA_BLOCKED_ROUTES.has(normalizedPath)
  return true
}
