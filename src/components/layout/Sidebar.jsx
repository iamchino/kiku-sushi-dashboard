import { useState, useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, ClipboardList, Package, Receipt, ListChecks,
  Users, ChefHat, LogOut, UtensilsCrossed, X, Menu,
  Sun, Moon, BookOpen, LayoutGrid, CalendarDays, Inbox, BarChart2,
  ConciergeBell, Truck, Wallet, Settings, Clock
} from 'lucide-react'
import clsx from 'clsx'
import { auth } from '../../lib/supabase'
import { NotificationBell } from './NotificationBell'
import { useTheme } from '../../context/useTheme'
import { useRole } from '../../context/useRole'
import { useFinanzasAccess } from '../../context/useFinanzasAccess'
import { canAccessRoute } from '../../context/role'

const NAV_ITEMS = [
  { to: '/',           icon: Home,            label: 'Inicio'       },
  { to: '/operaciones', icon: ChefHat,        label: 'Operaciones'  },
  // Dashboard fue unificado dentro de Analíticas (sección "Hoy en vivo").
  { to: '/analiticas', icon: BarChart2,       label: 'Analíticas'   },
  { to: '/menu',       icon: UtensilsCrossed, label: 'Menú & Carta' },
  { to: '/mesas',      icon: LayoutGrid,      label: 'Mesas'        },
  { to: '/reservas',   icon: CalendarDays,    label: 'Reservas'     },
  { to: '/pedidos',    icon: ClipboardList,   label: 'Ordenes'      },
  { to: '/platos',     icon: ConciergeBell,   label: 'Platos'       },
  // KDS oculto del menú; la ruta y la lógica se mantienen disponibles si se quiere reactivar.
  // { to: '/cocina',     icon: ChefHat,         label: 'Cocina (KDS)' },
  { to: '/produccion', icon: ListChecks,      label: 'Producción'   },
  { to: '/stock',      icon: Package,         label: 'Inventario'   },
  { to: '/recetas',    icon: BookOpen,        label: 'Recetas'      },
  { to: '/caja',       icon: Receipt,         label: 'Caja y ARCA'  },
  { to: '/finanzas',   icon: Wallet,          label: 'Finanzas',     finanzasOnly: true },
  { to: '/personal',   icon: Clock,           label: 'Personal',     finanzasOnly: true },
  { to: '/clientes',   icon: Users,           label: 'Clientes'     },
  { to: '/notificaciones', icon: Inbox,       label: 'Notificaciones' },
  { to: '/proveedores',   icon: Truck,        label: 'Proveedores',  adminOnly: true },
  { to: '/configuracion', icon: Settings,     label: 'Configuración', adminOnly: true },
]

function useAutoClose(setOpen) {
  const location = useLocation()
  useEffect(() => { setOpen(false) }, [location.pathname, setOpen])
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-150"
      style={{
        background: 'var(--bg-active)',
        border: '1px solid var(--accent-border)',
        color: 'var(--accent-lift)',
      }}
    >
      <span
        className="flex items-center justify-center w-6 h-6 rounded-md transition-transform duration-300"
        style={{
          background: 'var(--accent-soft)',
          transform: isDark ? 'rotate(0deg)' : 'rotate(180deg)',
        }}
      >
        {isDark ? <Sun size={13} /> : <Moon size={13} />}
      </span>
      <span className="font-medium text-xs tracking-wide">
        {isDark ? 'Tema claro' : 'Tema oscuro'}
      </span>
      <span
        className="ml-auto flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={{
          background: 'var(--accent-soft)',
          color: 'var(--text-muted)',
        }}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  )
}

function SidebarContent({ onClose, showBell = false }) {
  useAutoClose(onClose ?? (() => {}))
  const role = useRole()
  const finanzasOk = useFinanzasAccess()
  const navItems = NAV_ITEMS.filter(({ to, adminOnly, finanzasOnly }) => {
    if (adminOnly && role !== 'admin') return false
    if (finanzasOnly && !finanzasOk) return false
    return canAccessRoute(role, to)
  })

  return (
    <div
      className="flex flex-col h-full transition-colors duration-250"
      style={{ background: 'var(--bg-sidebar)' }}
    >
      <div
        className="flex items-center justify-between px-5 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            K
          </div>
          <div>
            <p className="font-semibold text-sm tracking-tight leading-tight" style={{ color: 'var(--text-primary)' }}>
              KIKU <span style={{ color: 'var(--accent-lift)' }}>SUSHI</span>
            </p>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: 'var(--text-xmuted)' }}>
              Sistema de gestión
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showBell && <NotificationBell />}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
              !isActive && 'hover:bg-[var(--bg-hover)]'
            )}
            style={({ isActive }) => isActive
              ? { background: 'var(--bg-active)', color: 'var(--accent-lift)' }
              : { color: 'var(--text-secondary)' }
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* pb extra en mobile para que "Cerrar sesión" no quede tapado por la
          barra inferior (BottomNav ~58px + safe-area). En desktop (lg) no hay
          barra inferior, así que va el padding normal. */}
      <div
        className="px-3 space-y-2 pb-[calc(58px+env(safe-area-inset-bottom,0px)+12px)] lg:pb-4"
        style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}
      >
        <ThemeToggle />

        <button
          onClick={() => auth.logout()}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#f87171'
            e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const close = useCallback(() => setMobileOpen(false), [])

  return (
    <>
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <SidebarContent showBell={true} />
      </aside>

      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all hover:scale-105"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
      )}

      <aside
        className="lg:hidden fixed top-0 left-0 z-[60] h-full w-64 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out"
        style={{
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <SidebarContent onClose={close} />
      </aside>
    </>
  )
}
