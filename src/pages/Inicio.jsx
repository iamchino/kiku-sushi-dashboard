import { Link } from 'react-router-dom'
import {
  Receipt, ClipboardList, LayoutGrid, ChefHat,
  UtensilsCrossed, CalendarDays, Package, ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Accesos preferidos: tarjetas grandes y destacadas.
const ACCESOS = [
  {
    to: '/caja',
    icon: Receipt,
    label: 'Caja y ARCA',
    desc: 'Facturación, cobros y comprobantes fiscales',
  },
  {
    to: '/pedidos',
    icon: ClipboardList,
    label: 'Ordenes',
    desc: 'Pedidos de salón, delivery y take away',
  },
  {
    to: '/mesas',
    icon: LayoutGrid,
    label: 'Mesas',
    desc: 'Estado del salón y gestión de mesas',
  },
]

// Accesos secundarios.
const SECUNDARIOS = [
  { to: '/operaciones', icon: ChefHat,         label: 'Operaciones' },
  { to: '/menu',        icon: UtensilsCrossed, label: 'Menú & Carta' },
  { to: '/reservas',    icon: CalendarDays,    label: 'Reservas' },
  { to: '/stock',       icon: Package,         label: 'Inventario' },
]

export default function Inicio() {
  const hoy = format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Bienvenida */}
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          K
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Bienvenido al sistema de gestión de Kiku Sushi
          </h1>
          <p className="text-sm mt-1 capitalize" style={{ color: 'var(--text-xmuted)' }}>{hoy}</p>
        </div>
      </div>

      {/* Accesos preferidos */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-xmuted)' }}>
          Accesos rápidos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ACCESOS.map(({ to, icon: Icon, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}
                >
                  <Icon size={20} />
                </span>
                <ArrowRight
                  size={18}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--accent-lift)' }}
                />
              </div>
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-xmuted)' }}>{desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Accesos secundarios */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-xmuted)' }}>
          Más secciones
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SECUNDARIOS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm transition-all duration-150"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
            >
              <Icon size={16} style={{ color: 'var(--accent-lift)' }} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
