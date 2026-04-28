import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import MenuPage from './pages/Menu'
import PedidosPage from './pages/Pedidos'
import CocinaKDS from './pages/Cocina'
import ClientesPage from './pages/Clientes'
import StockPage from './pages/Stock'
import AnaliticasPage from './pages/Analiticas'
import Login from './pages/Login'
import { Clock } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'

// ══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE ROLES
// ─────────────────────────────────────────────────────────────────────────────
// Roles disponibles:
//   'admin'  → acceso completo al dashboard
//   'cocina' → solo ve el KDS (/cocina), redirigido automáticamente
//
// Para asignar un rol a un usuario, ejecutar en Supabase SQL Editor:
//   UPDATE auth.users
//   SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"cocina"')
//   WHERE email = 'chef@kikusushi.com';
// ══════════════════════════════════════════════════════════════════════════════

const RoleContext = createContext('admin')
export const useRole = () => useContext(RoleContext)

// ── Placeholder para módulos aún no implementados ────────────────────────────
const Pendiente = ({ nombre }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center space-y-3">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <Clock size={22} style={{ color: 'rgba(124,58,237,0.7)' }} />
      </div>
      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{nombre}</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Próximamente — en construcción</p>
    </div>
  </div>
)

// ── Layout con sidebar (para admin) ──────────────────────────────────────────
function AdminLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />
      {/* padding-top en mobile para que el hamburger no tape el contenido */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}

// ── Guard: redirige a /cocina si el rol es 'cocina' ───────────────────────────
function RoleGuard({ children }) {
  const role = useRole()
  const location = useLocation()

  if (role === 'cocina' && location.pathname !== '/cocina') {
    return <Navigate to="/cocina" replace />
  }
  return children
}

// ── Rutas según el rol ────────────────────────────────────────────────────────
function AppRoutes() {
  const role = useRole()

  // Rol cocina: solo el KDS, sin sidebar
  if (role === 'cocina') {
    return (
      <Routes>
        <Route path="/cocina" element={<CocinaKDS />} />
        <Route path="*"       element={<Navigate to="/cocina" replace />} />
      </Routes>
    )
  }

  // Rol admin: dashboard completo con sidebar
  return (
    <AdminLayout>
      <RoleGuard>
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/analiticas" element={<AnaliticasPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/menu"    element={<MenuPage />} />
          <Route path="/cocina"  element={<CocinaKDS />} />
          <Route path="/stock"   element={<StockPage />} />
          <Route path="/caja"    element={<Pendiente nombre="Caja y Facturación AFIP" />} />
          <Route path="/clientes"element={<ClientesPage />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </RoleGuard>
    </AdminLayout>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined)
  const [role,    setRole]    = useState('admin')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setRole(data.session?.user?.user_metadata?.role || 'admin')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setRole(s?.user?.user_metadata?.role || 'admin')
    })
    return () => subscription.unsubscribe()
  }, [])

  // Cargando
  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-app)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <RoleContext.Provider value={role}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </RoleContext.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
