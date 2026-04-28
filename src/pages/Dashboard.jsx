import { useDashboard } from '../hooks/useDashboard'
import { KpiCard } from '../components/dashboard/KpiCard'
import { PlatosChart } from '../components/dashboard/PlatosChart'
import { CanalDonut } from '../components/dashboard/CanalDonut'
import { HeatmapHoras } from '../components/dashboard/HeatmapHoras'
import { AlertasStock } from '../components/dashboard/AlertasStock'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { RefreshCw } from 'lucide-react'

export default function Dashboard() {
  const { kpis, platosTop, pedidosPorHora, alertasStock, loading, error, refetch, delta } = useDashboard()

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <p className="font-medium" style={{ color: '#f87171' }}>Error cargando datos</p>
          <p className="text-sm" style={{ color: 'var(--text-xmuted)' }}>{error}</p>
          <button
            onClick={refetch}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const hoy = format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-sm mt-0.5 capitalize" style={{ color: 'var(--text-xmuted)' }}>{hoy}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            En vivo
          </span>
          <button
            onClick={refetch}
            disabled={loading}
            className="p-2 rounded-lg transition-all duration-150 disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-xmuted)' }} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ventas del día" valor={loading ? null : `$${Number(kpis?.ventas_total || 0).toLocaleString('es-AR')}`} delta={delta('ventas_total', 'ventas_total')} loading={loading} />
        <KpiCard label="Ticket promedio" valor={loading ? null : `$${Math.round(kpis?.ticket_promedio || 0).toLocaleString('es-AR')}`} delta={delta('ticket_promedio', 'ticket_promedio')} loading={loading} />
        <KpiCard label="Pedidos salón" valor={loading ? null : kpis?.pedidos_salon ?? 0} delta={delta('pedidos_salon', 'pedidos_salon')} loading={loading} />
        <KpiCard label="Pedidos delivery" valor={loading ? null : kpis?.pedidos_delivery ?? 0} delta={delta('pedidos_delivery', 'pedidos_delivery')} loading={loading} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PlatosChart data={platosTop} loading={loading} />
        </div>
        <div>
          <CanalDonut kpis={kpis} loading={loading} />
        </div>
      </div>

      <HeatmapHoras data={pedidosPorHora} loading={loading} />

      {alertasStock.length > 0 && (
        <AlertasStock alertas={alertasStock} />
      )}
    </div>
  )
}