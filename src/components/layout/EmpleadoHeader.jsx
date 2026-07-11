import { NavLink } from 'react-router-dom'
import { LogOut, QrCode, Clock } from 'lucide-react'
import { auth } from '../../lib/supabase'
import { useRole } from '../../context/useRole'

// Barra superior del modo empleado (rol `empleado`): logo, Fichar / Mis horas
// y cerrar sesión. Para otros roles (mozo/cocina/admin que también fichan)
// no se muestra: ya tienen el sidebar del dashboard.
export default function EmpleadoHeader() {
  const role = useRole()
  if (role !== 'empleado') return null

  const tabs = [
    { to: '/fichar',    icon: QrCode, label: 'Fichar' },
    { to: '/mis-horas', icon: Clock,  label: 'Mis horas' },
  ]

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
      style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          K
        </div>
        <p className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
          KIKU <span style={{ color: 'var(--accent-lift)' }}>SUSHI</span>
        </p>
      </div>

      <nav className="flex items-center gap-1.5">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={({ isActive }) => isActive
              ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
              : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => auth.logout()}
          title="Cerrar sesión"
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <LogOut size={15} />
        </button>
      </nav>
    </header>
  )
}
