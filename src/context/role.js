import { createContext } from 'react'

export const VALID_ROLES = new Set(['admin', 'cocina'])
export const DEFAULT_ROLE = 'cocina'
export const COCINA_DEFAULT_ROUTE = '/operaciones'
export const COCINA_BLOCKED_ROUTES = new Set([
  '/', '/dashboard', '/analiticas', '/caja', '/clientes',
  '/mesas', '/reservas', '/configuracion/salon',
])

export const RoleContext = createContext(DEFAULT_ROLE)

export function getRoleFromUser(user) {
  if (user?.email?.toLowerCase() === 'cocina@kikusushi.com') return 'cocina'

  const role = user?.app_metadata?.role || user?.user_metadata?.role
  return VALID_ROLES.has(role) ? role : DEFAULT_ROLE
}

export function getDefaultRoute(role) {
  return role === 'cocina' ? COCINA_DEFAULT_ROUTE : '/'
}

export function canAccessRoute(role, pathname) {
  if (role !== 'cocina') return true

  const normalizedPath = pathname === '' ? '/' : pathname
  return !COCINA_BLOCKED_ROUTES.has(normalizedPath)
}
