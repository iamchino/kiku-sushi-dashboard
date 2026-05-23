import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import Dashboard from './pages/Dashboard'
import OperacionesPage from './pages/Operaciones'
import MenuPage from './pages/Menu'
import PedidosPage from './pages/Pedidos'
import CocinaKDS from './pages/Cocina'
import ProduccionPage from './pages/Produccion'
import ClientesPage from './pages/Clientes'
import StockPage from './pages/Stock'
import AnaliticasPage from './pages/Analiticas'
import RecetasPage from './pages/Recetas'
import CajaPage from './pages/Caja'
import Login from './pages/Login'
import { ThemeProvider } from './context/ThemeContext'
import { RoleContext, DEFAULT_ROLE, getRoleFromUser, canAccessRoute, getDefaultRoute } from './context/role'
import { useRole } from './context/useRole'

function AdminLayout({ children }) {
  const role = useRole()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />
      <main className={`flex-1 overflow-y-auto pt-14 lg:pt-0 ${role === 'cocina' ? 'pb-20 lg:pb-0' : ''}`}>
        {children}
      </main>
    </div>
  )
}

function RoleGuard({ children }) {
  const role = useRole()
  const location = useLocation()

  if (!canAccessRoute(role, location.pathname)) {
    return <Navigate to={getDefaultRoute(role)} replace />
  }
  return children
}

function AppRoutes() {
  const role = useRole()
  const defaultRoute = getDefaultRoute(role)

  return (
    <AdminLayout>
      <RoleGuard>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/operaciones" element={<OperacionesPage />} />
          <Route path="/analiticas" element={<AnaliticasPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/cocina" element={<CocinaKDS />} />
          <Route path="/produccion" element={<ProduccionPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/recetas" element={<RecetasPage />} />
          <Route path="/caja" element={<CajaPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </RoleGuard>
      {role === 'cocina' && <BottomNav />}
    </AdminLayout>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(DEFAULT_ROLE)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setRole(getRoleFromUser(data.session?.user))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setRole(getRoleFromUser(s?.user))
    })
    return () => subscription.unsubscribe()
  }, [])

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
