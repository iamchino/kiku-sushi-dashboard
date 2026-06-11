import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, RefreshCw, Search, Utensils, ShoppingBag, Truck, LayoutList,
  ClipboardList, Printer, ChevronRight, ChevronDown, Ban, Loader2,
  Lock,
} from 'lucide-react'
import { usePedidos, getTipoPedido, getEstadoSimple, ESTADO_SIGUIENTE } from '../hooks/usePedidos'
import { getAuthorizedComprobante } from '../lib/fiscal'
import { normalizeSearch } from '../utils/normalize'
import NuevoPedidoModal from '../components/pedidos/NuevoPedidoModal'
import CerrarPedidoModal from '../components/pedidos/CerrarPedidoModal'
import ElegirMesaModal from '../components/pedidos/ElegirMesaModal'
import PedidoDetalleModal from '../components/pedidos/PedidoDetalleModal'
import { printComanda, formatMoney } from '../lib/printing'

const TABS = [
  { id: 'salon',    label: 'Para Comer Aquí', icon: Utensils    },
  { id: 'llevar',   label: 'Para Llevar',     icon: ShoppingBag },
  { id: 'delivery', label: 'Delivery',        icon: Truck       },
  { id: 'todas',    label: 'Todas',           icon: LayoutList  },
]

const ESTADO_BADGE = {
  activa:     { label: 'Activa',     bg: 'rgba(79,142,247,0.10)', color: '#4f8ef7' },
  completada: { label: 'Completada', bg: 'rgba(52,211,153,0.10)', color: '#34d399' },
  cancelada:  { label: 'Cancelada',  bg: 'rgba(239,68,68,0.10)',  color: '#f87171' },
}

// Etiquetas crudas para el menú de cambio de estado.
const ESTADO_CRUDO_LABEL = {
  pendiente:  'Pendiente',
  preparando: 'En cocina',
  listo:      'Listo',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
}

const BTN_AVANZAR_LABEL = {
  pendiente:  'Marcar en cocina',
  preparando: 'Marcar listo',
  listo:      'Marcar entregado',
}

const TIPO_META = {
  salon:    { label: 'Para Comer Aquí', icon: Utensils,    color: 'var(--accent-lift)' },
  llevar:   { label: 'Para Llevar',     icon: ShoppingBag, color: '#fbbf24'             },
  delivery: { label: 'Web',             icon: Truck,       color: '#4f8ef7'             },
}

const ESTADO_FILTRO_OPCIONES = [
  { id: 'todos',      label: 'Todos los estados'   },
  { id: 'activa',     label: 'Activa'              },
  { id: 'completada', label: 'Completada'          },
  { id: 'cancelada',  label: 'Cancelada'           },
]

const FACTURACION_OPCIONES = [
  { id: 'todas',         label: 'Todos los medios de facturación' },
  { id: 'facturado',     label: 'Facturado'                       },
  { id: 'no_facturado',  label: 'No facturado'                    },
]

const ORDEN_OPCIONES = [
  { id: 'recent',     label: 'Más reciente' },
  { id: 'oldest',     label: 'Más antiguo'  },
  { id: 'total_desc', label: 'Mayor monto'  },
  { id: 'total_asc',  label: 'Menor monto'  },
]

function formatFechaHora(value) {
  if (!value) return { fecha: '', hora: '' }
  const d = new Date(value)
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return { fecha, hora }
}

function productosResumen(items = []) {
  if (!items.length) return { cuenta: '0 productos', detalle: '' }
  const detalle = items.slice(0, 3).map(i => `${i.cantidad}x ${i.nombre}`).join(', ')
  const extra = items.length > 3 ? `, +${items.length - 3} más` : ''
  return {
    cuenta:  `${items.length} producto${items.length === 1 ? '' : 's'}`,
    detalle: detalle + extra,
  }
}

function codigoPedido(p) {
  if (p?.codigo) return p.codigo
  return `KS${String(p.id).slice(-8).toUpperCase()}`
}

// Devuelve YYYY-MM-DD en hora LOCAL (no UTC).
function localDateISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function PedidosPage() {
  const [defaultDates] = useState(() => {
    const todayDate = new Date()
    const fromDate = new Date(todayDate)
    fromDate.setDate(todayDate.getDate() - 6)
    return {
      today: localDateISO(todayDate),
      last7: localDateISO(fromDate),
    }
  })
  const { today, last7 } = defaultDates

  const [tab, setTab]               = useState('todas')
  const [search, setSearch]         = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [facturacion, setFacturacion]   = useState('todas')
  const [orden, setOrden]               = useState('recent')

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoCanal, setNuevoCanal] = useState('delivery')
  const [elegirMesaOpen, setElegirMesaOpen] = useState(false)
  const [tipoMenuOpen, setTipoMenuOpen] = useState(false)
  const tipoMenuRef = useRef(null)
  const [pedidoSel, setPedidoSel] = useState(null)
  const [cerrarTarget, setCerrarTarget] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  // Cerrar el dropdown al click fuera
  useEffect(() => {
    if (!tipoMenuOpen) return
    const handler = (e) => {
      if (tipoMenuRef.current?.contains(e.target)) return
      setTipoMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tipoMenuOpen])

  const handleTipoClick = (tipoId) => {
    setTipoMenuOpen(false)
    if (tipoId === 'salon') {
      setElegirMesaOpen(true)
    } else {
      setNuevoCanal(tipoId)
      setNuevoOpen(true)
    }
  }

  const {
    pedidos, loading, error,
    createPedido, avanzarEstado, cerrarPedido, cancelarPedido, refetch,
    reabrirPedido, agregarItemsPedido, updateItemCantidadPedido, removeItemPedido,
  } = usePedidos({
    mode: 'range',
    dateFrom: fechaDesde || last7,
    dateTo:   fechaHasta || today,
  })

  // Mantener el pedido abierto en el modal sincronizado con la lista en vivo
  // (realtime): al agregar/quitar items o reabrir, el modal refleja los cambios.
  useEffect(() => {
    if (!pedidoSel) return
    const fresh = pedidos.find(p => p.id === pedidoSel.id)
    if (fresh && fresh !== pedidoSel) setPedidoSel(fresh)
  }, [pedidos, pedidoSel])

  // Si venimos de una notificación con ?focus=<id>, abrimos automáticamente
  // el detalle de ese pedido cuando termina de cargar.
  useEffect(() => {
    if (!focusId || loading) return
    const target = pedidos.find(p => p.id === focusId)
    if (target) {
      setPedidoSel(target)
      // Limpiamos el query param para que F5 no reabra el modal
      searchParams.delete('focus')
      setSearchParams(searchParams, { replace: true })
    }
  }, [focusId, loading, pedidos, searchParams, setSearchParams])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim())
    let list = pedidos.slice()

    if (tab !== 'todas')         list = list.filter(p => getTipoPedido(p) === tab)
    if (estadoFiltro !== 'todos') list = list.filter(p => getEstadoSimple(p) === estadoFiltro)
    if (facturacion !== 'todas') {
      const wantFact = facturacion === 'facturado'
      list = list.filter(p => Boolean(getAuthorizedComprobante(p)) === wantFact)
    }
    if (q) {
      list = list.filter(p => {
        const code    = normalizeSearch(codigoPedido(p))
        const mesa    = p.mesa ? normalizeSearch(`mesa ${p.mesa}`) : ''
        const cliente = normalizeSearch(p.cliente_nombre || '')
        const tel     = normalizeSearch(p.cliente_telefono || '')
        return code.includes(q) || mesa.includes(q) || cliente.includes(q) || tel.includes(q)
      })
    }

    list.sort((a, b) => {
      switch (orden) {
        case 'oldest':     return new Date(a.created_at) - new Date(b.created_at)
        case 'total_desc': return Number(b.total) - Number(a.total)
        case 'total_asc':  return Number(a.total) - Number(b.total)
        default:           return new Date(b.created_at) - new Date(a.created_at)
      }
    })

    return list
  }, [pedidos, tab, search, estadoFiltro, facturacion, orden])

  const tabCounts = useMemo(() => {
    const base = pedidos.filter(p => {
      if (estadoFiltro !== 'todos' && getEstadoSimple(p) !== estadoFiltro) return false
      if (facturacion !== 'todas') {
        const wantFact = facturacion === 'facturado'
        if (Boolean(getAuthorizedComprobante(p)) !== wantFact) return false
      }
      const q = normalizeSearch(search.trim())
      if (q) {
        const code    = normalizeSearch(codigoPedido(p))
        const mesa    = p.mesa ? normalizeSearch(`mesa ${p.mesa}`) : ''
        const cliente = normalizeSearch(p.cliente_nombre || '')
        const tel     = normalizeSearch(p.cliente_telefono || '')
        if (!(code.includes(q) || mesa.includes(q) || cliente.includes(q) || tel.includes(q))) return false
      }
      return true
    })
    const counts = { todas: base.length, salon: 0, llevar: 0, delivery: 0 }
    base.forEach(p => { counts[getTipoPedido(p)]++ })
    return counts
  }, [pedidos, estadoFiltro, facturacion, search])

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-4 flex-shrink-0 gap-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Ordenes
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Historial de pedidos · filtrá por fechas, canal o estado
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="p-2 rounded-lg transition-all disabled:opacity-50"
            style={{ border: '1px solid var(--border)' }}
            title="Actualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>

          <div ref={tipoMenuRef} className="relative">
            <button
              onClick={() => setTipoMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.25)',
              }}
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Nueva Orden</span>
              <span className="sm:hidden">Nueva</span>
              <ChevronDown size={13} className={tipoMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {tipoMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-30"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                }}
              >
                <button
                  onClick={() => handleTipoClick('llevar')}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)', background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ShoppingBag size={15} style={{ color: '#fbbf24' }} />
                  Para Llevar
                </button>
                <button
                  onClick={() => handleTipoClick('salon')}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)', background: 'transparent', borderTop: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Utensils size={15} style={{ color: 'var(--accent-lift)' }} />
                  Para Comer Aquí
                </button>
                <button
                  onClick={() => handleTipoClick('delivery')}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)', background: 'transparent', borderTop: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Truck size={15} style={{ color: '#4f8ef7' }} />
                  Delivery
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="px-4 md:px-6 py-3 flex-shrink-0 flex flex-wrap items-end gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código, mesa o cliente…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <FechaField label="Desde" value={fechaDesde} onChange={setFechaDesde} />
          <FechaField label="Hasta" value={fechaHasta} onChange={setFechaHasta} />
          <SelectField value={estadoFiltro} onChange={setEstadoFiltro} options={ESTADO_FILTRO_OPCIONES} />
          <SelectField value={facturacion}  onChange={setFacturacion}  options={FACTURACION_OPCIONES} />
          <SelectField value={orden}        onChange={setOrden}        options={ORDEN_OPCIONES} />
        </div>
      </div>

      <div
        className="flex-shrink-0 px-2 md:px-4 py-2 flex items-center gap-1 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          const count = tabCounts[t.id] ?? 0
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={
                active
                  ? { background: 'var(--bg-active)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
              }
            >
              <Icon size={14} />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={
                    active
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="mx-4 md:mx-6 mt-3 px-4 py-3 rounded-xl text-sm flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <SkeletonTable />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <table className="hidden md:table w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-app)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <Th>Código</Th>
                  <Th>Tipo</Th>
                  <Th>Mesa</Th>
                  <Th>Productos</Th>
                  <Th>Fecha/Hora</Th>
                  <Th>Estado</Th>
                  <Th>Facturación</Th>
                  <Th right>Total</Th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <PedidoRow
                    key={p.id}
                    pedido={p}
                    onSelect={() => setPedidoSel(p)}
                    onCerrarClick={() => setCerrarTarget(p)}
                    onAvanzar={avanzarEstado}
                    onCancelar={cancelarPedido}
                  />
                ))}
              </tbody>
            </table>

            <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
              {filtered.map(p => (
                <PedidoMobileRow
                  key={p.id}
                  pedido={p}
                  onSelect={() => setPedidoSel(p)}
                  onCerrarClick={() => setCerrarTarget(p)}
                  onAvanzar={avanzarEstado}
                  onCancelar={cancelarPedido}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <NuevoPedidoModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onSave={createPedido}
        canalInicial={nuevoCanal}
      />

      <ElegirMesaModal
        open={elegirMesaOpen}
        onClose={() => setElegirMesaOpen(false)}
        onPedidoCreado={refetch}
      />

      <PedidoDetalleModal
        pedido={pedidoSel}
        onClose={() => setPedidoSel(null)}
        onCerrarClick={() => setCerrarTarget(pedidoSel)}
        onAvanzar={avanzarEstado}
        onCancelar={cancelarPedido}
        onReabrir={reabrirPedido}
        onAgregarItems={agregarItemsPedido}
        onUpdateItemCantidad={updateItemCantidadPedido}
        onRemoveItem={removeItemPedido}
      />

      <CerrarPedidoModal
        open={Boolean(cerrarTarget)}
        pedido={cerrarTarget}
        onCerrarPedido={cerrarPedido}
        onClose={(result) => {
          setCerrarTarget(null)
          if (result?.closed) {
            setPedidoSel(null)
            refetch()
          }
        }}
      />
    </div>
  )
}

/* ────────────────────────── subcomponentes UI ────────────────────────── */

function Th({ children, right = false }) {
  return (
    <th
      className={`font-semibold text-[11px] uppercase tracking-wide px-4 py-3 ${right ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </th>
  )
}

function FechaField({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs outline-none"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: 130 }}
      />
    </div>
  )
}

function SelectField({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      {options.map(opt => (
        <option key={opt.id} value={opt.id}>{opt.label}</option>
      ))}
    </select>
  )
}

/**
 * Badge de estado clickeable. Si el pedido está activo,
 * abre un mini-menú con las opciones de cambio de estado.
 */
function EstadoBadgeMenu({ pedido, onAvanzar, onCancelar }) {
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const ref = useRef(null)

  const simple    = getEstadoSimple(pedido)
  const badge     = ESTADO_BADGE[simple]
  const siguiente = ESTADO_SIGUIENTE[pedido.estado]
  const canMutate = simple === 'activa'

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!badge) return null

  const handleAvanzar = async (e) => {
    e.stopPropagation()
    setBusy(true)
    await onAvanzar?.(pedido.id, pedido.estado)
    setBusy(false)
    setOpen(false)
  }

  const handleCancelar = async (e) => {
    e.stopPropagation()
    if (!confirm('¿Cancelar este pedido?')) return
    setBusy(true)
    await onCancelar?.(pedido.id)
    setBusy(false)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => canMutate && setOpen(o => !o)}
        disabled={!canMutate || busy}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors"
        style={{
          background: badge.bg,
          color: badge.color,
          cursor: canMutate ? 'pointer' : 'default',
          border: canMutate ? '1px solid transparent' : 'none',
        }}
        onMouseEnter={e => { if (canMutate) e.currentTarget.style.borderColor = badge.color + '55' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
        title={canMutate ? 'Cambiar estado' : null}
      >
        {busy ? <Loader2 size={10} className="animate-spin" /> : badge.label}
        {canMutate && !busy && <ChevronDown size={10} />}
      </button>

      {open && canMutate && (
        <div
          className="absolute z-30 mt-1 left-0 min-w-[170px] rounded-lg shadow-xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            Estado actual: {ESTADO_CRUDO_LABEL[pedido.estado]}
          </p>
          {siguiente && (
            <button
              type="button"
              onClick={handleAvanzar}
              className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--accent-lift)' }}
            >
              → {BTN_AVANZAR_LABEL[pedido.estado] || `Marcar ${ESTADO_CRUDO_LABEL[siguiente]}`}
            </button>
          )}
          <button
            type="button"
            onClick={handleCancelar}
            className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] flex items-center gap-2"
            style={{ color: '#f87171', borderTop: '1px solid var(--border)' }}
          >
            <Ban size={11} />
            Cancelar pedido
          </button>
        </div>
      )}
    </div>
  )
}

function PedidoRow({ pedido, onSelect, onCerrarClick, onAvanzar, onCancelar }) {
  const tipo      = getTipoPedido(pedido)
  const tipoMeta  = TIPO_META[tipo]
  const TipoIcon  = tipoMeta?.icon
  const facturado = Boolean(getAuthorizedComprobante(pedido))
  const codigo    = codigoPedido(pedido)
  const { fecha, hora } = formatFechaHora(pedido.created_at)
  const resumen   = productosResumen(pedido.pedido_items)
  const canClose  = getEstadoSimple(pedido) === 'activa'

  return (
    <tr
      onClick={onSelect}
      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        {codigo}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: tipoMeta?.color }}>
          {TipoIcon && <TipoIcon size={12} />}
          {tipoMeta?.label}
        </span>
      </td>
      <td className="px-4 py-3">
        {pedido.mesa ? (
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Mesa {pedido.mesa}</p>
            {pedido.personas ? (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{pedido.personas} personas</p>
            ) : null}
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>—</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[280px]">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{resumen.cuenta}</p>
        {resumen.detalle && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }} title={resumen.detalle}>
            {resumen.detalle}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        <p style={{ color: 'var(--text-primary)' }}>{fecha}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{hora}</p>
      </td>
      <td className="px-4 py-3">
        <EstadoBadgeMenu pedido={pedido} onAvanzar={onAvanzar} onCancelar={onCancelar} />
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={facturado
            ? { background: 'rgba(52,211,153,0.10)', color: '#34d399' }
            : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
          }
        >
          {facturado ? 'Facturado' : 'No facturado'}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        ${formatMoney(pedido.total)}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => printComanda(pedido)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Imprimir comanda"
          >
            <Printer size={13} />
          </button>
          {canClose && (
            <button
              type="button"
              onClick={onCerrarClick}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
              title="Cerrar pedido"
            >
              <Lock size={12} />
              Cerrar
            </button>
          )}
          <button
            type="button"
            onClick={onSelect}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Ver detalle"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function PedidoMobileRow({ pedido, onSelect, onCerrarClick, onAvanzar, onCancelar }) {
  const tipo      = getTipoPedido(pedido)
  const tipoMeta  = TIPO_META[tipo]
  const TipoIcon  = tipoMeta?.icon
  const facturado = Boolean(getAuthorizedComprobante(pedido))
  const codigo    = codigoPedido(pedido)
  const { fecha, hora } = formatFechaHora(pedido.created_at)
  const resumen   = productosResumen(pedido.pedido_items)
  const canClose  = getEstadoSimple(pedido) === 'activa'

  return (
    <div
      className="px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
    >
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={onSelect}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{codigo}</span>
            <EstadoBadgeMenu pedido={pedido} onAvanzar={onAvanzar} onCancelar={onCancelar} />
          </div>
          <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: tipoMeta?.color }}>
            {TipoIcon && <TipoIcon size={11} />}
            {tipoMeta?.label}
            {pedido.mesa ? <span style={{ color: 'var(--text-muted)' }}>· Mesa {pedido.mesa}</span> : null}
          </p>
          <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
            {resumen.cuenta}{resumen.detalle ? ` · ${resumen.detalle}` : ''}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-xmuted)' }}>
            {fecha} {hora} · {facturado ? 'Facturado' : 'No facturado'}
          </p>
          {canClose && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCerrarClick?.() }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
              style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
            >
              <Lock size={11} />
              Cerrar pedido
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ${formatMoney(pedido.total)}
          </p>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} className="ml-auto mt-1" />
        </div>
      </div>
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="px-4 md:px-6 py-4 space-y-2">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
        <ClipboardList size={24} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div>
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Probá cambiar el rango de fechas o el tipo de pedido.
        </p>
      </div>
    </div>
  )
}
