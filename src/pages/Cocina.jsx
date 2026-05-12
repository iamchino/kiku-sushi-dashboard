import { useState, useEffect } from 'react'
import { ChefHat, CheckCircle2, Flame, ArrowLeft, Clock, WifiOff } from 'lucide-react'
import { usePedidos } from '../hooks/usePedidos'
import { useNavigate } from 'react-router-dom'

// ── Timer hook: fuerza re-render cada 10s para actualizar tiempos ─────────────
function useTick() {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const id = setInterval(update, 10000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── Clock en el header ────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
      {time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

// ── Elapsed time con urgencia ─────────────────────────────────────────────────
function Elapsed({ createdAt, now }) {
  const mins = now > 0
    ? Math.floor((now - new Date(createdAt).getTime()) / 60000)
    : 0
  const urgencia = mins >= 20 ? 'critica' : mins >= 10 ? 'alta' : 'normal'

  const colors = {
    normal:  { color: 'var(--text-xmuted)',  bg: 'transparent' },
    alta:    { color: '#fbbf24',  bg: 'rgba(251,191,36,0.1)' },
    critica: { color: '#f87171',  bg: 'rgba(239,68,68,0.12)' },
  }[urgencia]

  return (
    <span
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${urgencia === 'critica' ? 'animate-pulse' : ''}`}
      style={{ color: colors.color, background: colors.bg }}
    >
      <Clock size={11} />
      {mins === 0 ? 'Ahora' : `${mins} min`}
    </span>
  )
}

// ── Tarjeta grande de cocina ──────────────────────────────────────────────────
function KdsCard({ pedido, estado, onAction }) {
  const now = useTick()
  const shortId = pedido.id.slice(-4).toUpperCase()
  const items   = pedido.pedido_items || []

  const config = {
    pendiente:  {
      border: 'rgba(124,58,237,0.35)',
      bg:     'rgba(124,58,237,0.06)',
      btnBg:  'linear-gradient(135deg, #7c3aed, #5b21b6)',
      btnLabel: 'TOMAR PEDIDO',
      btnIcon: ChefHat,
    },
    preparando: {
      border: 'rgba(79,142,247,0.35)',
      bg:     'rgba(79,142,247,0.06)',
      btnBg:  'linear-gradient(135deg, #34d399, #059669)',
      btnLabel: 'MARCAR LISTO',
      btnIcon: CheckCircle2,
    },
  }[estado]

  const BtnIcon = config.btnIcon

  return (
    <div
      className="rounded-2xl flex flex-col gap-4 transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: config.bg,
        border: `2px solid ${config.border}`,
        padding: '20px',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold" style={{ color: 'var(--text-xmuted)' }}>#{shortId}</span>
          {pedido.mesa
            ? <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Mesa {pedido.mesa}</span>
            : <span className="text-sm font-semibold capitalize" style={{ color: '#4f8ef7' }}>{pedido.canal}</span>
          }
        </div>
        <Elapsed createdAt={pedido.created_at} now={now} />
      </div>

      {/* Items — grandes y legibles */}
      <div className="space-y-2 flex-1">
        {items.length === 0 ? (
          <p className="text-base italic" style={{ color: 'var(--text-xmuted)' }}>Sin ítems</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-baseline gap-3">
              <span
                className="text-xl font-black leading-none flex-shrink-0 w-7 text-right"
                style={{ color: estado === 'pendiente' ? '#7c3aed' : '#4f8ef7' }}
              >
                {item.cantidad}×
              </span>
              <span className="text-base font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                {item.nombre}
              </span>
            </div>
          ))
        )}
        {pedido.notas && (
          <p className="text-sm italic mt-2 pt-2" style={{ color: '#fbbf24', borderTop: `1px dashed rgba(255,255,255,0.1)` }}>
            📝 {pedido.notas}
          </p>
        )}
      </div>

      {/* Action button — grande, fácil de tocar */}
      <button
        onClick={() => onAction(pedido.id, estado)}
        className="w-full flex items-center justify-center gap-3 rounded-xl font-bold text-white transition-all active:scale-95 hover:opacity-90"
        style={{
          background: config.btnBg,
          padding: '14px 20px',
          fontSize: '15px',
          letterSpacing: '0.05em',
          boxShadow: estado === 'pendiente'
            ? '0 4px 20px rgba(124,58,237,0.3)'
            : '0 4px 20px rgba(52,211,153,0.3)',
        }}
      >
        <BtnIcon size={20} />
        {config.btnLabel}
      </button>
    </div>
  )
}

// ── Columna del Kanban ────────────────────────────────────────────────────────
function Column({ estado, cards, onAction }) {
  const config = {
    pendiente:  { label: 'NUEVOS',          icon: Flame,       color: '#7c3aed' },
    preparando: { label: 'EN PREPARACIÓN',  icon: ChefHat,     color: '#4f8ef7' },
  }[estado]

  const Icon = config.icon

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-3 px-1">
        <Icon size={18} style={{ color: config.color }} />
        <span className="text-sm font-bold tracking-widest uppercase" style={{ color: config.color }}>
          {config.label}
        </span>
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: `${config.color}22`, color: config.color }}
        >
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-4 overflow-y-auto flex-1 pr-1">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-20">
            <Icon size={40} style={{ color: config.color }} />
            <p className="text-sm font-medium uppercase tracking-wide" style={{ color: config.color }}>
              Sin pedidos
            </p>
          </div>
        ) : (
          cards.map(p => (
            <KdsCard key={p.id} pedido={p} estado={estado} onAction={onAction} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Página KDS principal ──────────────────────────────────────────────────────
export default function CocinaKDS() {
  const navigate = useNavigate()
  const { grouped, loading, error, avanzarEstado } = usePedidos()
  const [connected, setConnected] = useState(true)

  // Escucha de conectividad
  useEffect(() => {
    const onOnline  = () => setConnected(true)
    const onOffline = () => setConnected(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const pendientes  = grouped.pendiente  || []
  const preparando  = grouped.preparando || []
  const totalActivo = pendientes.length + preparando.length

  return (
    <div
      className="flex flex-col h-screen select-none"
      style={{ background: 'var(--bg-app)' }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
          >
            K
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
              KIKU <span style={{ color: '#7c3aed' }}>SUSHI</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
              Cocina
            </p>
          </div>
        </div>

        {/* Center — total activo */}
        <div className="flex items-center gap-3">
          {!connected && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              <WifiOff size={12} /> Sin conexión
            </span>
          )}
          {totalActivo > 0 && (
            <span className="text-xs font-bold px-3 py-1 rounded-full animate-pulse"
              style={{ background: 'rgba(124,58,237,0.15)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)' }}>
              {totalActivo} {totalActivo === 1 ? 'pedido activo' : 'pedidos activos'}
            </span>
          )}
        </div>

        {/* Right — clock + back */}
        <div className="flex items-center gap-4">
          <LiveClock />
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="px-5 py-2 text-sm flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Kanban board ── */}
      <div className="flex-1 overflow-hidden p-5 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-5 md:gap-6 h-full">
            <Column estado="pendiente"  cards={pendientes} onAction={avanzarEstado} />

            {/* Divider */}
            <div className="flex-shrink-0 w-px self-stretch" style={{ background: 'var(--border)' }} />

            <Column estado="preparando" cards={preparando} onAction={avanzarEstado} />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="flex items-center justify-center py-2 flex-shrink-0 text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--text-xmuted)', borderTop: '1px solid var(--border)' }}
      >
        Kiku Sushi · Sistema de Cocina
      </div>
    </div>
  )
}
