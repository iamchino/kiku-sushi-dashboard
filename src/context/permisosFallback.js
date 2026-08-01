// ────────────────────────────────────────────────────────────────────────────
// Plan B: si la matriz de permisos no se puede leer de la base, el sistema
// vuelve a las reglas hardcodeadas de role.js.
//
// Sin esto, un hipo de red al arrancar dejaría a todo el mundo sin menú y
// rebotando a /fichar. Prefiero que en ese caso el dashboard siga funcionando
// como funcionaba antes de la fase 2, con un aviso arriba.
//
// El catálogo de acá tiene que coincidir en id / ruta / orden con el seed
// (supabase/migrations/20260803010000_permisos_seed.sql).
// `npm run verificar:permisos` lo chequea y falla si se desincronizan.
// ────────────────────────────────────────────────────────────────────────────
import { canAccessRoute, canAccessFinanzas } from './role'
import { construirPermisos } from './permisosCore'

export const CATALOGO_FALLBACK = [
  { id: 'inicio', nombre: 'Inicio',         ruta: '/',                    grupo: 'Operación',     orden: 10 },
  { id: 'operaciones', nombre: 'Operaciones',    ruta: '/operaciones',         grupo: 'Operación',     orden: 20 },
  { id: 'pedidos', nombre: 'Órdenes',        ruta: '/pedidos',             grupo: 'Operación',     orden: 30 },
  { id: 'mesas', nombre: 'Mesas',          ruta: '/mesas',               grupo: 'Operación',     orden: 40 },
  { id: 'reservas', nombre: 'Reservas',       ruta: '/reservas',            grupo: 'Operación',     orden: 50 },
  { id: 'platos', nombre: 'Platos',         ruta: '/platos',              grupo: 'Operación',     orden: 60 },
  { id: 'cocina_kds', nombre: 'Cocina (KDS)',     ruta: '/cocina',              grupo: 'Operación',     orden: 70 },
  { id: 'menu', nombre: 'Menú & Carta',           ruta: '/menu',                grupo: 'Producto',      orden: 110 },
  { id: 'produccion', nombre: 'Producción',     ruta: '/produccion',          grupo: 'Producto',      orden: 120 },
  { id: 'stock', nombre: 'Inventario',          ruta: '/stock',               grupo: 'Producto',      orden: 130 },
  { id: 'recetas', nombre: 'Recetas',        ruta: '/recetas',             grupo: 'Producto',      orden: 140 },
  { id: 'analiticas', nombre: 'Analíticas',     ruta: '/analiticas',          grupo: 'Negocio',       orden: 210 },
  { id: 'caja', nombre: 'Caja y ARCA',           ruta: '/caja',                grupo: 'Negocio',       orden: 220 },
  { id: 'clientes', nombre: 'Clientes',       ruta: '/clientes',            grupo: 'Negocio',       orden: 230 },
  { id: 'notificaciones', nombre: 'Notificaciones', ruta: '/notificaciones',      grupo: 'Negocio',       orden: 240 },
  { id: 'proveedores', nombre: 'Proveedores',    ruta: '/proveedores',         grupo: 'Negocio',       orden: 250 },
  { id: 'configuracion', nombre: 'Configuración',  ruta: '/configuracion',       grupo: 'Configuración', orden: 310 },
  { id: 'config_salon', nombre: 'Salón',   ruta: '/configuracion/salon', grupo: 'Configuración', orden: 320 },
  { id: 'finanzas', nombre: 'Finanzas',       ruta: '/finanzas',            grupo: 'Finanzas',      orden: 410 },
  { id: 'personal', nombre: 'Personal',       ruta: '/personal',            grupo: 'Finanzas',      orden: 420 },
  { id: 'permisos', nombre: 'Permisos',       ruta: null,                   grupo: 'Finanzas',      orden: 430 },
  { id: 'fichar', nombre: 'Fichar',         ruta: '/fichar',              grupo: 'Mi fichaje',    orden: 510 },
  { id: 'mis_horas', nombre: 'Mis horas',      ruta: '/mis-horas',           grupo: 'Mi fichaje',    orden: 520 },
]

/** La regla vigente antes de la fase 2, expresada recurso por recurso. */
export function reglaLegacy(rol, recurso, user) {
  if (recurso.ruta === null) {
    // 'permisos' no tiene pantalla propia: vive dentro de Personal.
    return recurso.id === 'permisos' && (rol === 'finanzas' || canAccessFinanzas(user))
  }
  if (!canAccessRoute(rol, recurso.ruta)) return false
  if (recurso.id === 'finanzas' || recurso.id === 'personal') {
    return rol === 'finanzas' || canAccessFinanzas(user)
  }
  return true
}

export function permisosFallback(rol, user) {
  const filas = CATALOGO_FALLBACK
    .filter(r => reglaLegacy(rol, r, user))
    .map(r => ({ recurso_id: r.id, ver: true, editar: true }))

  return construirPermisos({
    recursos: CATALOGO_FALLBACK,
    filas,
    rol,
    accesoFinanzasPorEmail: canAccessFinanzas(user),
    origen: 'fallback',
  })
}
