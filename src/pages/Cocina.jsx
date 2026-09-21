import { useState, useEffect, useRef } from 'react'
import { ChefHat, CheckCircle2, Flame, ArrowLeft, Clock, WifiOff, ConciergeBell } from 'lucide-react'
import { usePedidos, getTipoPedido, itemVaACocina } from '../hooks/usePedidos'
import BotonNotifs from '../components/BotonNotifs'
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

// ── Tarjeta por plato ─────────────────────────────────────────────────────────
/**
 * Convierte los pedidos en TARJETAS: una por cada PLATO.
 *
 * Antes era una por tanda, y los mozos terminaron comandando de a un plato
 * para que cocina viera cada cosa por separado. Ahora eso lo hace el sistema:
 * cada renglón de la comanda es su propia tarjeta con su propio estado, y las
 * bebidas (productos con "va a cocina" apagado) no aparecen.
 *
 *   sin tomar             → NUEVOS            (botón TOMAR PEDIDO)
 *   tomado, sin terminar  → EN PREPARACIÓN    (botón MARCAR LISTO)
 *   listo, sin servir     → LISTO PARA SERVIR (botón EN MESA, lo toca el mozo)
 *   servido               → sale del tablero
 */
function construirTarjetas(pedidos) {
  const tarjetas = []

  for (const pedido of pedidos) {
    if (['entregado', 'cancelado'].includes(pedido.estado)) continue
    const esSalon = getTipoPedido(pedido) === 'salon'
    const items = (pedido.pedido_items || []).filter(itemVaACocina)
    // La primera tanda es el pedido original; lo que llegó después es un
    // AGREGADO del mozo sobre una mesa en curso.
    const primeraTanda = items
      .map(i => i.enviado_at)
      .filter(Boolean)
      .sort()[0] || null

    for (const item of items) {
      // En salón, lo que el mozo todavía no mandó a cocina no existe para cocina.
      if (esSalon && !item.enviado_at && item.enviado_cocina === false) continue
      if (item.servido_at) continue

      tarjetas.push({
        key:        item.id,
        pedido,
        item,
        esAgregado: Boolean(primeraTanda && item.enviado_at && item.enviado_at > primeraTanda),
        columna:    !item.tomado_at ? 'pendiente' : !item.listo_at ? 'preparando' : 'listo',
        // El cronómetro cuenta desde que ESTE plato entró a cocina; en LISTO,
        // desde que salió (cuánto lleva esperando que lo lleven).
        desde: item.listo_at || item.enviado_at || pedido.created_at,
      })
    }
  }

  return tarjetas
}

const COLUMNAS = {
  pendiente:  {
    label: 'NUEVOS', icon: Flame, color: 'var(--accent-lift)',
    border: 'rgba(var(--accent-rgb),0.35)', bg: 'rgba(var(--accent-rgb),0.06)',
    btnBg: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
    btnShadow: '0 4px 20px rgba(var(--accent-rgb),0.3)',
    btnLabel: 'TOMAR PEDIDO', btnIcon: ChefHat, qtyColor: 'var(--accent-lift)',
  },
  preparando: {
    label: 'EN PREPARACIÓN', icon: ChefHat, color: '#4f8ef7',
    border: 'rgba(79,142,247,0.35)', bg: 'rgba(79,142,247,0.06)',
    btnBg: 'linear-gradient(135deg, #34d399, #059669)',
    btnShadow: '0 4px 20px rgba(52,211,153,0.3)',
    btnLabel: 'MARCAR LISTO', btnIcon: CheckCircle2, qtyColor: '#4f8ef7',
  },
  listo: {
    label: 'LISTO PARA SERVIR', icon: ConciergeBell, color: '#34d399',
    border: 'rgba(52,211,153,0.4)', bg: 'rgba(52,211,153,0.07)',
    btnBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
    btnShadow: '0 4px 20px rgba(245,158,11,0.3)',
    btnLabel: 'EN MESA', btnIcon: ConciergeBell, qtyColor: '#34d399',
  },
}

function KdsCard({ tarjeta, onAccion }) {
  const now = useTick()
  const { pedido, item, esAgregado, columna, desde } = tarjeta
  const shortId = pedido.id.slice(-4).toUpperCase()
  const config = COLUMNAS[columna]
  const BtnIcon = config.btnIcon
  const esSalon = getTipoPedido(pedido) === 'salon'

  return (
    <div
      className="rounded-2xl flex flex-col gap-3 transition-all duration-200 hover:scale-[1.01]"
      style={{ background: config.bg, border: `2px solid ${config.border}`, padding: '16px 18px' }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-xmuted)' }}>#{shortId}</span>
          {pedido.mesa
            ? <span className="text-base font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>Mesa {pedido.mesa}</span>
            : <span className="text-sm font-semibold capitalize" style={{ color: '#4f8ef7' }}>{pedido.canal}</span>
          }
        </div>
        <div className="flex items-center gap-2">
          {esAgregado && columna !== 'listo' && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
              style={{ background: 'rgba(52,211,153,0.18)', color: '#34d399' }}>
              AGREGADO
            </span>
          )}
          <Elapsed createdAt={desde} now={now} />
        </div>
      </div>

      {/* El plato — grande y legible */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-black leading-none flex-shrink-0" style={{ color: config.qtyColor }}>
          {item.cantidad}×
        </span>
        <span className="text-lg font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
          {item.nombre}
          {item.notas && (
            <span className="block text-sm italic mt-1" style={{ color: '#fbbf24' }}>📝 {item.notas}</span>
          )}
        </span>
      </div>
      {pedido.notas && (
        <p className="text-sm italic pt-2" style={{ color: '#fbbf24', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
          📝 {pedido.notas}
        </p>
      )}

      {/* Action button — grande, fácil de tocar */}
      <button
        onClick={() => onAccion(tarjeta)}
        className="w-full flex items-center justify-center gap-3 rounded-xl font-bold text-white transition-all active:scale-95 hover:opacity-90"
        style={{ background: config.btnBg, padding: '13px 20px', fontSize: '15px', letterSpacing: '0.05em', boxShadow: config.btnShadow }}
      >
        <BtnIcon size={20} />
        {columna === 'listo' && !esSalon ? 'ENTREGADO' : config.btnLabel}
      </button>
    </div>
  )
}

// ── Columna del Kanban ────────────────────────────────────────────────────────
function Column({ estado, cards, onAccion, sinHeader = false }) {
  const config = COLUMNAS[estado]

  const Icon = config.icon

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0 min-h-0">
      {/* Column header */}
      {!sinHeader && <div className="flex items-center gap-3 px-1">
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
      </div>}

      {/* Cards */}
      <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1 pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-20">
            <Icon size={40} style={{ color: config.color }} />
            <p className="text-sm font-medium uppercase tracking-wide" style={{ color: config.color }}>
              {estado === 'listo' ? 'Nada para servir' : 'Sin pedidos'}
            </p>
          </div>
        ) : (
          cards.map(t => (
            <KdsCard key={t.key} tarjeta={t} onAccion={onAccion} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Pestañas para el celular ─────────────────────────────────────────────────
// En una pantalla angosta no entran tres columnas: se muestra UNA a la vez,
// con pestañas arriba (y el contador de cada una) y deslizando el dedo se
// pasa a la siguiente. En tablet/PC siguen las tres columnas lado a lado.
const ORDEN = ['pendiente', 'preparando', 'listo']

function Tabs({ activa, conteos, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 p-2 flex-shrink-0"
      style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}>
      {ORDEN.map(k => {
        const c = COLUMNAS[k]; const Icon = c.icon; const on = k === activa
        return (
          <button key={k} onClick={() => onChange(k)}
            className="flex flex-col items-center gap-1 rounded-xl py-2 px-1 transition-colors"
            style={{
              background: on ? `${c.color}22` : 'transparent',
              border: `1.5px solid ${on ? c.color : 'transparent'}`,
              color: on ? c.color : 'var(--text-muted)',
            }}>
            <span className="flex items-center gap-1.5">
              <Icon size={15} />
              <span className="text-lg font-black leading-none tabular-nums">{conteos[k]}</span>
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase leading-tight text-center">
              {k === 'pendiente' ? 'Nuevos' : k === 'preparando' ? 'En prep.' : 'Para servir'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Página KDS principal ──────────────────────────────────────────────────────
export default function CocinaKDS() {
  const navigate = useNavigate()
  const { grouped, loading, error, tomarItem, marcarItemListo, marcarItemServido, avanzarEstado } = usePedidos()
  const [connected, setConnected] = useState(true)
  const [aviso, setAviso] = useState(null)
  // Columna visible en el celular (en pantallas anchas no se usa).
  const [tab, setTab] = useState('pendiente')
  const touch = useRef(null)
  const onTouchStart = e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = e => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return
    const i = ORDEN.indexOf(tab)
    const next = ORDEN[dx < 0 ? Math.min(i + 1, ORDEN.length - 1) : Math.max(i - 1, 0)]
    setTab(next)
  }

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

  // El botón grande hace lo que corresponda a la columna, siempre sobre ESE
  // plato: tomar, marcar listo, o (el mozo) marcarlo en mesa. Para llevar y
  // delivery, "entregado" del último plato cierra el pedido como siempre.
  const accionTarjeta = async (tarjeta) => {
    const { columna, item, pedido } = tarjeta
    let err
    if (columna === 'pendiente') err = await tomarItem(item.id)
    else if (columna === 'preparando') err = await marcarItemListo(item.id, true)
    else {
      err = await marcarItemServido(item.id, true)
      const esSalon = getTipoPedido(pedido) === 'salon'
      const restantes = (pedido.pedido_items || [])
        .filter(i => itemVaACocina(i) && !i.servido_at && i.id !== item.id)
      if (!err && !esSalon && restantes.length === 0 && pedido.estado === 'listo') {
        err = await avanzarEstado(pedido.id, 'listo')
      }
    }
    if (err) {
      setAviso(err.message || 'No se pudo actualizar el plato')
      setTimeout(() => setAviso(null), 5000)
    }
  }

  const tarjetas    = construirTarjetas([
    ...(grouped.pendiente || []), ...(grouped.preparando || []), ...(grouped.listo || []),
  ])
  const pendientes  = tarjetas.filter(t => t.columna === 'pendiente')
  const preparando  = tarjetas.filter(t => t.columna === 'preparando')
  const listos      = tarjetas.filter(t => t.columna === 'listo')
  const totalActivo = pendientes.length + preparando.length
  const porColumna  = { pendiente: pendientes, preparando, listo: listos }

  return (
    <div
      className="flex flex-col flex-1 min-h-0 select-none"
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
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            K
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
              KIKU <span style={{ color: 'var(--accent-lift)' }}>SUSHI</span>
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
            <span className="hidden sm:inline text-xs font-bold px-3 py-1 rounded-full animate-pulse"
              style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent-lift)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
              {totalActivo} {totalActivo === 1 ? 'plato en cocina' : 'platos en cocina'}
            </span>
          )}
        </div>

        {/* Right — clock + back */}
        <div className="flex items-center gap-4">
          <BotonNotifs />
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
      {(error || aviso) && (
        <div className="px-5 py-2 text-sm flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ {aviso || error}
        </div>
      )}

      {/* ── Celular: pestañas + una columna ── */}
      <div className="md:hidden">
        <Tabs activa={tab} onChange={setTab}
          conteos={{ pendiente: pendientes.length, preparando: preparando.length, listo: listos.length }} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-3 md:hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[var(--accent-lift)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Column key={tab} estado={tab} cards={porColumna[tab]} onAccion={accionTarjeta} sinHeader />
        )}
      </div>

      {/* ── Tablet / PC: las tres columnas ── */}
      <div className="flex-1 overflow-hidden p-4 lg:p-6 hidden md:block">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[var(--accent-lift)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-3 lg:gap-5 h-full">
            <Column estado="pendiente"  cards={pendientes} onAccion={accionTarjeta} />
            <div className="flex-shrink-0 w-px self-stretch" style={{ background: 'var(--border)' }} />
            <Column estado="preparando" cards={preparando} onAccion={accionTarjeta} />
            <div className="flex-shrink-0 w-px self-stretch" style={{ background: 'var(--border)' }} />
            <Column estado="listo"      cards={listos}     onAccion={accionTarjeta} />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="hidden md:flex items-center justify-center py-2 flex-shrink-0 text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--text-xmuted)', borderTop: '1px solid var(--border)' }}
      >
        Kiku Sushi · Sistema de Cocina
      </div>
    </div>
  )
}
