import {
  ConciergeBell, ChefHat, Wallet, Users, BarChart2, Settings,
} from 'lucide-react'

// Los DOMINIOS de la navegación. El agrupamiento real vive en la base
// (recursos.grupo): acá solo se define el orden de presentación, el ícono y
// una descripción corta. Si un grupo no está en esta lista igual se muestra
// (con ícono genérico), así un catálogo extendido no rompe el menú.
export const DOMINIOS = [
  { grupo: 'Servicio', icon: ConciergeBell, hint: 'El salón, ahora' },
  { grupo: 'Producto', icon: ChefHat,       hint: 'Carta, stock y producción' },
  { grupo: 'Dinero',   icon: Wallet,        hint: 'Caja, pagos y finanzas' },
  { grupo: 'Análisis', icon: BarChart2,     hint: 'Ventas y clientes' },
  { grupo: 'Equipo',   icon: Users,         hint: 'Personal y fichaje' },
  { grupo: 'Ajustes',  icon: Settings,      hint: 'Configuración' },
]

// Recursos con pantalla que NO aparecen en la navegación (se llega desde
// adentro de otra sección). El acceso no cambia: solo la visibilidad.
export const FUERA_DEL_MENU = new Set(['cocina_kds'])

/**
 * Agrupa los recursos visibles del usuario en dominios navegables.
 * Devuelve [{ grupo, icon, hint, items: [recurso...], ruta }], donde `ruta`
 * es la primera pantalla del dominio (adonde navega el click en la barra).
 */
export function dominiosVisibles(visibles) {
  const conPantalla = (visibles || []).filter(r => r.ruta && !FUERA_DEL_MENU.has(r.id))
  const porGrupo = new Map()
  for (const r of conPantalla) {
    if (!porGrupo.has(r.grupo)) porGrupo.set(r.grupo, [])
    porGrupo.get(r.grupo).push(r)
  }

  const conocidos = DOMINIOS
    .filter(d => porGrupo.has(d.grupo))
    .map(d => ({ ...d, items: porGrupo.get(d.grupo) }))

  // Grupos que no están en DOMINIOS (catálogo extendido): al final, sin ícono
  // especial. Nunca se pierden secciones por un nombre de grupo nuevo.
  const extras = [...porGrupo.keys()]
    .filter(g => !DOMINIOS.some(d => d.grupo === g))
    .map(g => ({ grupo: g, icon: Settings, hint: '', items: porGrupo.get(g) }))

  return [...conocidos, ...extras].map(d => ({ ...d, ruta: d.items[0]?.ruta }))
}

/** El dominio al que pertenece la ruta actual, o null. */
export function dominioDeRuta(dominios, pathname) {
  return dominios.find(d => d.items.some(r => r.ruta === pathname)) ?? null
}
