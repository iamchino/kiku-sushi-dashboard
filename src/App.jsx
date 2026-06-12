import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import Inicio from './pages/Inicio'
import OperacionesPage from './pages/Operaciones'
import MenuPage from './pages/Menu'
import PedidosPage from './pages/Pedidos'
import MesasPage from './pages/Mesas'
import ReservasPage from './pages/Reservas'
import ConfigSalonPage from './pages/ConfigSalon'
import CocinaKDS from './pages/Cocina'
import PlatosPage from './pages/Platos'
import ProduccionPage from './pages/Produccion'
import ClientesPage from './pages/Clientes'
import StockPage from './pages/Stock'
import AnaliticasPage from './pages/Analiticas'
import RecetasPage from './pages/Recetas'
import CajaPage from './pages/Caja'
import NotificacionesPage from './pages/Notificaciones'
import ProveedoresPage from './pages/Proveedores'
import Login from './pages/Login'
import { ThemeProvider } from './context/ThemeContext'
import { RoleContext, DEFAULT_ROLE, getRoleFromUser, canAccessRoute, getDefaultRoute } from './context/role'
import { useRole } from './context/useRole'
import { usePrinterStore } from './lib/printerStore'
import { initNative } from './lib/native'

function AdminLayout({ children }) {
  const role = useRole()
  const conBottomNav = role === 'cocina' || role === 'mozo'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />
      <main className={`flex-1 overflow-y-auto pt-14 lg:pt-0 ${conBottomNav ? 'pb-20 lg:pb-0' : ''}`}>
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
          <Route path="/" element={<Inicio />} />
          <Route path="/dashboard" element={<Navigate to="/analiticas" replace />} />
          <Route path="/operaciones" element={<OperacionesPage />} />
          <Route path="/analiticas" element={<AnaliticasPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/mesas" element={<MesasPage />} />
          <Route path="/reservas" element={<ReservasPage />} />
          <Route path="/configuracion/salon" element={<ConfigSalonPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/cocina" element={<CocinaKDS />} />
          <Route path="/platos" element={<PlatosPage />} />
          <Route path="/produccion" element={<ProduccionPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/recetas" element={<RecetasPage />} />
          <Route path="/caja" element={<CajaPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/notificaciones" element={<NotificacionesPage />} />
          <Route path="/proveedores" element={<ProveedoresPage />} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </RoleGuard>
      {(role === 'cocina' || role === 'mozo') && <BottomNav />}
    </AdminLayout>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(DEFAULT_ROLE)
  const loadPrinterConfig = usePrinterStore(s => s.load)

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

  // Cargar config de impresoras cuando hay sesion (RLS autenticada).
  useEffect(() => {
    if (session) loadPrinterConfig()
  }, [session, loadPrinterConfig])

  // Inicializa integraciones nativas (Capacitor): status bar, push, etc.
  // En navegador es un no-op.
  useEffect(() => {
    if (session) initNative(session)
  }, [session])

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-app)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-lift)', borderTopColor: 'transparent' }} />
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
