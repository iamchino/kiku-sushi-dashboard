import { createContext } from 'react'

// Los 5 roles originales. Desde la fase 1 se pueden crear más desde la UI, así
// que este set ya no es la lista de roles válidos: es la de los que tienen
// reglas hardcodeadas de respaldo acá abajo (ver permisosFallback).
export const VALID_ROLES = new Set(['admin', 'cocina', 'mozo', 'empleado', 'finanzas'])
export const DEFAULT_ROLE = 'cocina'

// Mismo formato que el CHECK de public.roles.id.
export const SLUG_ROL = /^[a-z][a-z0-9_]{1,30}$/

// La sección Finanzas es exclusiva del rol 'finanzas'. El resto de los admin
// (p. ej. el dueño) NO la ve.
//
// Antes también se habilitaba por una lista blanca de emails. Se fue: un email
// hardcodeado en tres archivos no es una regla de negocio, es una excepción que
// se volvió estructura, y dejaba a esa cuenta con el rol trabado en 'admin'
// para siempre (ver 20260906030000_roles_sin_lista_blanca.sql). Ahora el rol es
// la única fuente de verdad.
//
// En la BD, is_finanzas_user() acepta 'finanzas' Y 'admin': gobierna las RLS de
// empleados/egresos y quién administra los logins, donde admin tiene que ser
// superconjunto. Es a propósito más permisiva que esto. La divergencia es
// segura en esa dirección — sobra acceso en la base y falta en la pantalla — y
// no al revés, que sería ver la pantalla sin datos.
export function canAccessFinanzas(user) {
  return user?.app_metadata?.role === 'finanzas'
}

// Cocina: bloqueo por lista negra (todo lo operativo de cocina permitido).
export const COCINA_BLOCKED_ROUTES = new Set([
  '/', '/dashboard', '/analiticas', '/caja', '/clientes',
  '/mesas', '/reservas', '/configuracion/salon', '/configuracion', '/notificaciones',
  '/platos', '/proveedores', '/finanzas', '/personal',
])

// Mozo: lista blanca. Mesas (abrir/cerrar/cobrar), platos de cocina, stock y
// la configuración (para corregir la IP de la impresora desde su celular;
// solo ve el tab de Impresoras, ver Configuracion.jsx).
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
export const FINANZAS_ALLOWED_ROUTES = new Set([
  '/finanzas',
  '/personal',
  '/fichar',
  '/mis-horas',
])

// Empleado (control de horas): lista blanca mínima. Solo ficha y ve sus horas.
export const EMPLEADO_ALLOWED_ROUTES = new Set([
  '/fichar',
  '/mis-horas',
])

export const RoleContext = createContext(DEFAULT_ROLE)

export function getRoleFromUser(user) {
  if (user?.email?.toLowerCase() === 'cocina@kikusushi.com') return 'cocina'

  // SOLO app_metadata. user_metadata lo escribe el propio usuario desde el
  // navegador con supabase.auth.updateUser({ data: { role: 'admin' } }), así
  // que aceptarlo acá permitiría auto-asignarse cualquier rol.
  // Misma regla que current_app_role() en la BD (fase 0 de seguridad).
  const role = user?.app_metadata?.role

  // Aceptamos cualquier slug bien formado, no solo los 5 originales: desde la
  // fase 1 se pueden crear roles nuevos en la base, y current_app_role() en
  // Postgres devuelve el rol real. Si acá lo degradáramos a 'cocina', la
  // persona vería el menú de cocina mientras la base le aplica otros permisos.
  // Mismo formato que el CHECK de public.roles.id.
  return SLUG_ROL.test(role ?? '') ? role : DEFAULT_ROLE
}

export function canAccessRoute(role, pathname) {
  const normalizedPath = pathname === '' ? '/' : pathname

  if (role === 'mozo') return MOZO_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'empleado') return EMPLEADO_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'finanzas') return FINANZAS_ALLOWED_ROUTES.has(normalizedPath)
  if (role === 'cocina') return !COCINA_BLOCKED_ROUTES.has(normalizedPath)
  // Solo admin tiene acceso irrestricto. Un rol creado desde la UI no tiene
  // reglas de respaldo acá, y en modo fallback conviene negarle todo antes que
  // regalarle el sistema entero.
  return role === 'admin'
}
