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
  { id: 'inicio', nombre: 'Inicio',         ruta: '/',                    grupo: 'Servicio',     orden: 5 },
  { id: 'operaciones', nombre: 'Operaciones',    ruta: '/operaciones',         grupo: 'Servicio',     orden: 10 },
  { id: 'pedidos', nombre: 'Órdenes',        ruta: '/pedidos',             grupo: 'Servicio',     orden: 20 },
  { id: 'mesas', nombre: 'Mesas',          ruta: '/mesas',               grupo: 'Servicio',     orden: 30 },
  { id: 'reservas', nombre: 'Reservas',       ruta: '/reservas',            grupo: 'Servicio',     orden: 40 },
  { id: 'platos', nombre: 'Platos',         ruta: '/platos',              grupo: 'Servicio',     orden: 50 },
  { id: 'cocina_kds', nombre: 'Cocina (KDS)',     ruta: '/cocina',              grupo: 'Servicio',     orden: 60 },
  { id: 'menu', nombre: 'Menú & Carta',           ruta: '/menu',                grupo: 'Producto',      orden: 110 },
  { id: 'produccion', nombre: 'Producción',     ruta: '/produccion',          grupo: 'Producto',      orden: 120 },
  { id: 'stock', nombre: 'Inventario',          ruta: '/stock',               grupo: 'Producto',      orden: 130 },
  { id: 'recetas', nombre: 'Recetas',        ruta: '/recetas',             grupo: 'Producto',      orden: 140 },
  { id: 'analiticas', nombre: 'Analíticas',     ruta: '/analiticas',          grupo: 'Análisis',       orden: 310 },
  { id: 'caja', nombre: 'Caja y facturación',           ruta: '/caja',                grupo: 'Dinero',       orden: 210 },
  { id: 'clientes', nombre: 'Clientes',       ruta: '/clientes',            grupo: 'Análisis',       orden: 320 },
  { id: 'notificaciones', nombre: 'Notificaciones', ruta: '/notificaciones',      grupo: 'Análisis',       orden: 330 },
  { id: 'proveedores', nombre: 'Proveedores',    ruta: '/proveedores',         grupo: 'Producto',       orden: 150 },
  { id: 'configuracion', nombre: 'Configuración',  ruta: '/configuracion',       grupo: 'Ajustes', orden: 510 },
  { id: 'config_salon', nombre: 'Salón',   ruta: '/configuracion/salon', grupo: 'Ajustes', orden: 520 },
  { id: 'finanzas', nombre: 'Finanzas',       ruta: '/finanzas',            grupo: 'Dinero',      orden: 220 },
  { id: 'personal', nombre: 'Personal',       ruta: '/personal',            grupo: 'Equipo',      orden: 410 },
  { id: 'permisos', nombre: 'Permisos',       ruta: null,                   grupo: 'Equipo',      orden: 415 },
  { id: 'fichar', nombre: 'Fichar',         ruta: '/fichar',              grupo: 'Equipo',    orden: 420 },
  { id: 'mis_horas', nombre: 'Mis horas',      ruta: '/mis-horas',           grupo: 'Equipo',    orden: 430 },
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
