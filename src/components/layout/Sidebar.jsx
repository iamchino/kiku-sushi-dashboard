import { useState, useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Package, Receipt,
  Users, ChefHat, LogOut, UtensilsCrossed, X, Menu, BarChart2
} from 'lucide-react'
import clsx from 'clsx'
import { auth } from '../../lib/supabase'
import { NotificationBell } from './NotificationBell'

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/analiticas', icon: BarChart2,       label: 'Analíticas'   },
  { to: '/menu',       icon: UtensilsCrossed, label: 'Menú & Carta' },
  { to: '/pedidos',    icon: ClipboardList,   label: 'Pedidos'      },
  { to: '/cocina',     icon: ChefHat,         label: 'Cocina (KDS)' },
  { to: '/stock',      icon: Package,         label: 'Inventario'   },
  { to: '/caja',       icon: Receipt,         label: 'Caja y AFIP'  },
  { to: '/clientes',   icon: Users,           label: 'Clientes'     },
]

// ── Hook: cierra el sidebar cuando cambia la ruta (en mobile) ────────────────
function useAutoClose(setOpen) {
  const location = useLocation()
  useEffect(() => { setOpen(false) }, [location.pathname, setOpen])
}

// ── Sidebar content (reutilizado en desktop y drawer) ────────────────────────
function SidebarContent({ onClose, showBell = false }) {
  useAutoClose(onClose ?? (() => {}))

  return (
    <div className="flex flex-col h-full" style={{ background: '#161618' }}>
      {/* Logo + close button (solo en mobile) */}
      <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: '1px solid #2a2a2e' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)' }}
          >
            K
          </div>
          <div>
            <p className="font-semibold text-sm tracking-tight text-white leading-tight">
              KIKU <span style={{ color: '#E8673A' }}>SUSHI</span>
            </p>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: '#52525b' }}>
              Sistema de gestión
            </p>
          </div>
        </div>
        {/* Right side: bell + close (mobile) */}
        <div className="flex items-center gap-1">
          {showBell && <NotificationBell />}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
              style={{ color: '#71717a' }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
              isActive ? 'font-medium' : 'hover:bg-white/5'
            )}
            style={({ isActive }) => isActive
              ? { background: 'rgba(232,103,58,0.12)', color: '#E8673A' }
              : { color: '#a1a1aa' }
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid #2a2a2e' }}>
        <button
          onClick={() => auth.logout()}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all duration-150 hover:bg-red-500/10"
          style={{ color: '#71717a' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ── Componente público: Sidebar + Hamburger ───────────────────────────────────
export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const close = useCallback(() => setMobileOpen(false), [])

  return (
    <>
      {/* ── DESKTOP: sidebar fijo (≥ lg = 1024px) ─────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-56 flex-shrink-0 h-screen sticky top-0"
        style={{ borderRight: '1px solid #2a2a2e' }}
      >
        <SidebarContent showBell={true} />
      </aside>

      {/* ── MOBILE/TABLET: botón hamburguesa ──────────────────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all hover:scale-105"
        style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', color: '#a1a1aa' }}
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      {/* ── MOBILE/TABLET: overlay oscuro ─────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* ── MOBILE/TABLET: drawer deslizante ──────────────────────────────── */}
      <aside
        className="lg:hidden fixed top-0 left-0 z-50 h-full w-64 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out"
        style={{
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          borderRight: '1px solid #2a2a2e',
        }}
      >
        <SidebarContent onClose={close} />
      </aside>
    </>
  )
}