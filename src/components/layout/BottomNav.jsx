import { NavLink } from 'react-router-dom'
import { ClipboardList, LayoutGrid, Package, ConciergeBell } from 'lucide-react'
import { useRole } from '../../context/useRole'

const TABS_BY_ROLE = {
  cocina: [
    { to: '/operaciones', icon: LayoutGrid, label: 'Inicio' },
    // KDS oculto temporalmente.
    // { to: '/cocina', icon: ChefHat, label: 'Cocina' },
    { to: '/produccion', icon: ClipboardList, label: 'Produccion' },
  ],
  mozo: [
    { to: '/mesas',  icon: LayoutGrid,    label: 'Mesas'  },
    { to: '/platos', icon: ConciergeBell, label: 'Platos' },
    { to: '/stock',  icon: Package,       label: 'Stock'  },
  ],
}

export function BottomNav() {
  const role = useRole()
  const tabs = TABS_BY_ROLE[role]
  if (!tabs) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        background: '#111113',
        borderTop: '1px solid #1e1e22',
        height: 'calc(58px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
          style={({ isActive }) => ({
            color: isActive ? 'var(--accent-lift)' : '#71717a',
            background: isActive ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
          })}
        >
          <Icon size={20} />
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
