import { NavLink } from 'react-router-dom'
import { ChefHat, ClipboardList } from 'lucide-react'

const TABS = [
  { to: '/cocina',     icon: ChefHat,       label: 'Cocina' },
  { to: '/produccion', icon: ClipboardList,  label: 'Producción' },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        background: '#111113',
        borderTop: '1px solid #1e1e22',
        height: '56px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
          style={({ isActive }) => ({
            color: isActive ? '#7c3aed' : '#52525b',
            background: isActive ? 'rgba(124,58,237,0.08)' : 'transparent',
          })}
        >
          <Icon size={20} />
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
