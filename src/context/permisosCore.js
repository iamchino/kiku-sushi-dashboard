// ────────────────────────────────────────────────────────────────────────────
// Lógica pura de permisos. Sin React ni Supabase a propósito: así se puede
// testear con `node` y la usa tanto el provider como el script de verificación.
//
// Un "estado de permisos" es lo que devuelve construirPermisos(): la matriz ya
// resuelta para UN usuario concreto, más el catálogo de recursos.
// ────────────────────────────────────────────────────────────────────────────

// Recursos que el email de la lista blanca ve siempre, tenga el rol que tenga.
// Es el mismo bypass que is_finanzas_user() en la base: sin esto, la cuenta
// histórica de Finanzas (que tiene rol `admin`) perdería Finanzas y Personal en
// cuanto el menú pase a salir de la matriz.
export const RECURSOS_FINANZAS = ['finanzas', 'personal', 'permisos']

/**
 * @param {Array}  recursos  filas de public.recursos
 * @param {Array}  filas     filas de public.rol_permisos del rol del usuario
 * @param {string} rol
 * @param {boolean} accesoFinanzasPorEmail  canAccessFinanzas() por lista blanca
 * @param {'base'|'fallback'} origen
 */
export function construirPermisos({ recursos, filas, rol, accesoFinanzasPorEmail = false, origen = 'base' }) {
  const porId = new Map(recursos.map(r => [r.id, r]))

  const ver = new Set()
  const editar = new Set()
  for (const f of filas) {
    if (f.ver) ver.add(f.recurso_id)
    if (f.editar) editar.add(f.recurso_id)
  }
  if (accesoFinanzasPorEmail) {
    for (const id of RECURSOS_FINANZAS) {
      if (porId.has(id)) { ver.add(id); editar.add(id) }
    }
  }

  // ruta -> recurso, para resolver el guard de navegación.
  const porRuta = new Map()
  for (const r of recursos) if (r.ruta) porRuta.set(r.ruta, r.id)

  const visibles = recursos
    .filter(r => ver.has(r.id))
    .sort((a, b) => a.orden - b.orden)

  return { rol, origen, recursos, porId, porRuta, ver, editar, visibles }
}

export function puedeVer(p, recursoId) {
  return p ? p.ver.has(recursoId) : false
}

export function puedeEditar(p, recursoId) {
  return p ? p.editar.has(recursoId) : false
}

/** El recurso al que corresponde una ruta, o null si la ruta no es de ninguno. */
export function recursoDeRuta(p, pathname) {
  const ruta = pathname === '' ? '/' : pathname
  return p?.porRuta.get(ruta) ?? null
}

/**
 * Rutas sin recurso propio (`/dashboard`, que solo redirige, o cualquier ruta
 * futura que nadie declaró) se dejan pasar: el router ya sabe qué hacer con
 * ellas, y el catch-all termina mandando a la ruta por defecto igual.
 */
export function rutaPermitida(p, pathname) {
  const recurso = recursoDeRuta(p, pathname)
  if (recurso === null) return true
  return puedeVer(p, recurso)
}

/**
 * Primera sección visible con pantalla propia, por orden del catálogo.
 * Los `orden` del seed están puestos para que esto reproduzca exactamente los
 * defaults de hoy (admin `/`, cocina `/operaciones`, mozo `/mesas`,
 * empleado `/fichar`, finanzas `/finanzas`), y para que un rol nuevo creado
 * desde la UI tenga un destino razonable sin que nadie lo configure.
 */
export function rutaPorDefecto(p) {
  return p?.visibles.find(r => r.ruta)?.ruta ?? '/fichar'
}

/**
 * True si al usuario solo le queda su propio fichaje. Esos entran a la pantalla
 * limpia de celular, sin sidebar ni módulos del negocio — hoy es el rol
 * `empleado`, pero cualquier rol nuevo acotado igual recibe el mismo trato.
 */
export function soloFichaje(p) {
  const conPantalla = p?.visibles.filter(r => r.ruta) ?? []
  if (conPantalla.length === 0) return false
  return conPantalla.every(r => r.id === 'fichar' || r.id === 'mis_horas')
}
