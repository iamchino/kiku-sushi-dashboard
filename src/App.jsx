import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase, auth } from './lib/supabase'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { TIENEN_BARRA_INFERIOR } from './components/layout/bottomNavTabs'
import Inicio from './pages/Inicio'
import OperacionesPage from './pages/Operaciones'
import MenuPage from './pages/Menu'
import PedidosPage from './pages/Pedidos'
import MesasPage from './pages/Mesas'
import ReservasPage from './pages/Reservas'
import ConfigSalonPage from './pages/ConfigSalon'
import ConfiguracionPage from './pages/Configuracion'
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
import FinanzasPage from './pages/Finanzas'
import PersonalPage from './pages/Personal'
import FicharPage from './pages/Fichar'
import MisHorasPage from './pages/MisHoras'
import Login from './pages/Login'
import { ThemeProvider } from './context/ThemeContext'
import { RoleContext, DEFAULT_ROLE, getRoleFromUser } from './context/role'
import { useRole } from './context/useRole'
import { PermisosProvider } from './context/PermisosProvider'
import { usePermisos } from './context/usePermisos'
import { usePrinterStore } from './lib/printerStore'
import PrinterStatusBanner from './components/PrinterStatusBanner'
import { initNative } from './lib/native'

function AdminLayout({ children }) {
  const role = useRole()
  const conBottomNav = TIENEN_BARRA_INFERIOR.has(role)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />
      <main className={`flex-1 overflow-y-auto pt-14 lg:pt-0 ${conBottomNav ? 'pb-20 lg:pb-0' : ''}`}>
        <PrinterStatusBanner />
        {children}
      </main>
    </div>
  )
}

function RoleGuard({ children }) {
  const { rutaPermitida, rutaPorDefecto } = usePermisos()
  const location = useLocation()

  if (rutaPermitida(location.pathname)) return children

  // Redirigir a la ruta por defecto salvo que ya estemos en ella: si el guard
  // rechaza justo el default, el Navigate se dispararía en loop. En ese caso
  // mandamos a /fichar, que es lo mínimo que ve cualquier usuario logueado.
  const destino = rutaPorDefecto()
  return <Navigate to={destino === location.pathname ? '/fichar' : destino} replace />
}

// Aviso de que estamos con las reglas del código porque la matriz no cargó.
// Casi nunca se ve, pero si aparece hay que saberlo: alguien puede estar
// viendo de más o de menos respecto de lo que quedó configurado.
function AvisoPermisosEnFallback() {
  const { enFallback } = usePermisos()
  if (!enFallback) return null
  return (
    <div className="px-4 py-2 text-xs text-center"
      style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
      No se pudieron leer los permisos configurados. Estás viendo los permisos por defecto del sistema.
    </div>
  )
}

// Layout mínimo para quien solo tiene su fichaje: sin sidebar ni módulos del
// negocio, pensado para el celular. Hoy es el rol `empleado`, pero ahora sale
// de los permisos, así que un rol nuevo igual de acotado recibe el mismo trato.
function EmpleadoLayout() {
  const { puede, rutaPorDefecto } = usePermisos()
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <Routes>
        {puede('fichar')    && <Route path="/fichar"    element={<FicharPage />} />}
        {puede('mis_horas') && <Route path="/mis-horas" element={<MisHorasPage />} />}
        <Route path="*" element={<Navigate to={rutaPorDefecto()} replace />} />
      </Routes>
    </div>
  )
}

// El rol existe pero no tiene ninguna sección habilitada. Antes esto dejaba una
// pantalla en blanco con el menú vacío; ahora al menos se entiende qué pasó y
// se puede salir.
function SinPermisos() {
  const rol = useRole()
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-app)' }}>
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Tu usuario no tiene ninguna sección habilitada
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Pedile a quien administra el sistema que te configure los permisos de tu rol
          {rol ? ` (${rol})` : ''} desde Personal → Permisos.
        </p>
        <button onClick={() => auth.logout()}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { cargando, rutaPorDefecto, soloFichaje, visibles } = usePermisos()

  // Hasta que la matriz esté cargada no se decide nada: si no, el guard
  // rebotaría a la ruta por defecto equivocada y el menú parpadearía vacío.
  if (cargando) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-app)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--accent-lift)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // Rol sin nada configurado: mejor decirlo que dejar un dashboard vacío.
  if (visibles.length === 0) return <SinPermisos />

  const defaultRoute = rutaPorDefecto()

  // Quien solo tiene fichaje no ve el dashboard: pantalla limpia de celular.
  if (soloFichaje()) return <EmpleadoLayout />

  return (
    <AdminLayout>
      <AvisoPermisosEnFallback />
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
          <Route path="/configuracion" element={<ConfiguracionPage />} />
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
          <Route path="/finanzas" element={<FinanzasPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          {/* Fichaje también disponible para otros roles vinculados a un empleado
              (p. ej. un mozo o cocina que ficha con su mismo login). */}
          <Route path="/fichar" element={<FicharPage />} />
          <Route path="/mis-horas" element={<MisHorasPage />} />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </RoleGuard>
      <BottomNav />
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
          <PermisosProvider rol={role} user={session?.user}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </PermisosProvider>
        </RoleContext.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
