import { useState } from 'react'
import { Plus, RefreshCw, ClipboardList, Flame, ChefHat, CheckCircle2, Truck } from 'lucide-react'
import { usePedidos, ESTADOS } from '../hooks/usePedidos'
import PedidoCard from '../components/pedidos/PedidoCard'
import NuevoPedidoModal from '../components/pedidos/NuevoPedidoModal'

const COLUMNAS = [
  {
    id:      'pendiente',
    label:   'Pendiente',
    icon:    Flame,
    color:   '#E8673A',
    bg:      'rgba(232,103,58,0.08)',
    border:  'rgba(232,103,58,0.2)',
  },
  {
    id:      'preparando',
    label:   'En cocina',
    icon:    ChefHat,
    color:   '#4f8ef7',
    bg:      'rgba(79,142,247,0.08)',
    border:  'rgba(79,142,247,0.2)',
  },
  {
    id:      'listo',
    label:   'Listo',
    icon:    CheckCircle2,
    color:   '#34d399',
    bg:      'rgba(52,211,153,0.08)',
    border:  'rgba(52,211,153,0.2)',
  },
  {
    id:      'entregado',
    label:   'Entregado',
    icon:    Truck,
    color:   '#71717a',
    bg:      'rgba(113,113,122,0.08)',
    border:  'rgba(113,113,122,0.2)',
  },
]

export default function PedidosPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const {
    grouped, stats,
    loading, error,
    createPedido, avanzarEstado, cancelarPedido,
    refetch,
  } = usePedidos()

  return (
    <div className="flex flex-col h-full">

      <div
        className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #2a2a2e' }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-white tracking-tight">Pedidos del día</h1>
          <p className="text-xs md:text-sm mt-0.5 flex items-center gap-2" style={{ color: '#52525b' }}>
            Kanban en tiempo real
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(232,103,58,0.1)', color: '#E8673A', border: '1px solid rgba(232,103,58,0.2)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8673A] animate-pulse" />
              Live
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {/* Stats — ocultas en mobile, visibles en md+ */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            {[
              { label: 'Total',      value: stats.total,      color: '#a1a1aa' },
              { label: 'Pendientes', value: stats.pendientes, color: '#E8673A' },
              { label: 'En cocina',  value: stats.enCocina,   color: '#4f8ef7' },
              { label: 'Listos',     value: stats.listos,     color: '#34d399' },
            ].map(s => (
              <span
                key={s.label}
                className="px-2.5 py-1 rounded-full font-medium"
                style={{ background: '#111113', border: '1px solid #2a2a2e', color: s.color }}
              >
                {s.value} {s.label}
              </span>
            ))}
          </div>

          <button
            onClick={refetch} disabled={loading}
            className="p-2 rounded-lg transition-all hover:bg-white/5 disabled:opacity-50"
            style={{ border: '1px solid #2a2a2e' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: '#52525b' }} />
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)', boxShadow: '0 4px 16px rgba(232,103,58,0.25)' }}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nuevo pedido</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>


      {/* ── Error ── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* ── Kanban board ── */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-6 h-full min-w-[900px]">
          {COLUMNAS.map(col => {
            const cards = grouped[col.id] || []
            const Icon = col.icon
            return (
              <div
                key={col.id}
                className="flex flex-col flex-1 min-w-[220px] rounded-2xl overflow-hidden"
                style={{ background: col.bg, border: `1px solid ${col.border}` }}
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                  style={{ borderBottom: `1px solid ${col.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} style={{ color: col.color }} />
                    <span className="text-sm font-semibold" style={{ color: col.color }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: col.border, color: col.color }}
                  >
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {loading ? (
                    [1, 2].map(i => (
                      <div key={i} className="rounded-xl p-4 space-y-2" style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}>
                        <div className="skeleton h-3 w-24 rounded" />
                        <div className="skeleton h-3 w-full rounded" />
                        <div className="skeleton h-3 w-3/4 rounded" />
                      </div>
                    ))
                  ) : cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                      <ClipboardList size={28} style={{ color: col.color }} />
                      <p className="text-xs" style={{ color: col.color }}>Sin pedidos</p>
                    </div>
                  ) : (
                    cards.map(pedido => (
                      <PedidoCard
                        key={pedido.id}
                        pedido={pedido}
                        onAvanzar={avanzarEstado}
                        onCancelar={cancelarPedido}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal ── */}
      <NuevoPedidoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={createPedido}
      />
    </div>
  )
}
