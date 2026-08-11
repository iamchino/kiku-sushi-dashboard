import { NavLink, useLocation } from 'react-router-dom'
import { usePermisos } from '../../context/usePermisos'
import { dominiosVisibles, dominioDeRuta } from './dominios'

/**
 * La segunda mitad de la navegación por dominios: la barra lateral lleva al
 * dominio, y esta franja —arriba del contenido— muestra sus secciones como
 * pestañas. Así "Dinero" es un lugar con Caja, Finanzas, etc. adentro, en vez
 * de items sueltos desparramados por la barra.
 *
 * Se oculta cuando el dominio tiene una sola pantalla (no hay nada que
 * tabular) o cuando la ruta no pertenece a ningún dominio.
 */
export default function DomainTabs() {
  const { visibles } = usePermisos()
  const location = useLocation()

  const dominios = dominiosVisibles(visibles)
  const actual = dominioDeRuta(dominios, location.pathname)
  if (!actual || actual.items.length < 2) return null

  return (
    <nav
      className="sticky top-0 z-20 flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 lg:px-6"
      style={{
        background: 'var(--bg-app)',
        borderBottom: '1px solid var(--border)',
      }}
      aria-label={`Secciones de ${actual.grupo}`}
    >
      <span className="hidden sm:flex items-center gap-1.5 mr-2 text-[11px] font-semibold uppercase tracking-widest flex-shrink-0"
        style={{ color: 'var(--text-xmuted)' }}>
        <actual.icon size={13} />
        {actual.grupo}
      </span>
      {actual.items.map(r => (
        <NavLink
          key={r.id}
          to={r.ruta}
          end
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
          style={({ isActive }) => isActive
            ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
            : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
        >
          {r.nombre}
        </NavLink>
      ))}
    </nav>
  )
}
