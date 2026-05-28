import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  FileMinus2,
  FileText,
  Loader2,
  Plus,
  Printer,
  Receipt,
  ReceiptText,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Usb,
  X,
} from 'lucide-react'
import { useFacturacion } from '../hooks/useFacturacion'
import { supabase } from '../lib/supabase'
import { formatReceiptNumber, getAuthorizedComprobante, nombreComprobante } from '../lib/fiscal'
import { formatMoney } from '../lib/printing'
import { calculateDiscountAmount, calculateOrderSubtotal, calculateOrderTotal, clampDiscount, parseCurrencyValue } from '../lib/orders'
import FacturarModal from '../components/caja/FacturarModal'
import NotaCreditoModal from '../components/caja/NotaCreditoModal'

const FILTERS = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'facturados', label: 'Facturados' },
  { id: 'todos', label: 'Todos' },
]

const CANAL_LABEL = {
  salon: 'Salon',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
}

const CANALES = [
  { id: 'salon', label: 'Salon' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'pedidosya', label: 'PedidosYa' },
  { id: 'rappi', label: 'Rappi' },
]

function createKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
}

function newEditableItem() {
  return {
    _key: createKey(),
    productKey: '',
    nombre: '',
    cantidad: 1,
    precio_unitario: 0,
    notas: '',
    menu_item_id: null,
    variante_id: null,
  }
}

function buildProductOptions(menuItems) {
  return menuItems.flatMap(item => {
    const variantes = item.menu_item_variantes || []
    if (variantes.length === 0) {
      return [{
        key: item.id,
        label: item.nombre,
        sublabel: item.categoria || '',
        menu_item_id: item.id,
        variante_id: null,
        nombre: item.nombre,
        precio_unitario: parseCurrencyValue(item.precio),
      }]
    }

    return variantes.map(variante => ({
      key: `${item.id}_${variante.id}`,
      label: `${item.nombre} (${variante.nombre})`,
      sublabel: item.categoria || '',
      menu_item_id: item.id,
      variante_id: variante.id,
      nombre: `${item.nombre} (${variante.nombre})`,
      precio_unitario: parseCurrencyValue(variante.precio),
    }))
  })
}

function StatusPill({ ok, label, detail, icon: Icon }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{
          background: ok ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
          color: ok ? '#34d399' : '#fbbf24',
        }}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</p>
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'var(--accent-lift)' }) {
  return (
    <div className="rounded-lg px-3 py-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  )
}

function EditPedidoModal({ pedido, open, saving, onClose, onSave }) {
  const [canal, setCanal] = useState('salon')
  const [mesa, setMesa] = useState('')
  const [notas, setNotas] = useState('')
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState('')
  const [items, setItems] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return

    setLoadingMenu(true)
    supabase
      .from('menu_items')
      .select('id, nombre, precio, categoria, tipo, menu_item_variantes(*)')
      .eq('activo', true)
      .order('categoria')
      .order('orden')
      .then(({ data }) => {
        const sorted = (data || []).map(item => ({
          ...item,
          menu_item_variantes: (item.menu_item_variantes || [])
            .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
        }))
        setMenuItems(sorted)
        setLoadingMenu(false)
      })
  }, [open])

  const productOptions = useMemo(() => buildProductOptions(menuItems), [menuItems])

  useEffect(() => {
    if (!open || !pedido) return

    setCanal(pedido.canal || 'salon')
    setMesa(pedido.mesa || '')
    setNotas(pedido.notas || '')
    setDescuentoPorcentaje(pedido.descuento_porcentaje || '')
    setItems((pedido.pedido_items || []).map(item => ({
      _key: item.id || createKey(),
      id: item.id,
      productKey: item.variante_id
        ? `${item.menu_item_id}_${item.variante_id}`
        : (item.menu_item_id || `custom_${item.id || item.nombre}`),
      nombre: item.nombre || '',
      cantidad: Number(item.cantidad || 1),
      precio_unitario: Number(item.precio_unitario || 0),
      notas: item.notas || '',
      menu_item_id: item.menu_item_id || null,
      variante_id: item.variante_id || null,
    })))
    setError(null)
  }, [open, pedido])

  const descuento = clampDiscount(descuentoPorcentaje)
  const subtotal = calculateOrderSubtotal(items)
  const descuentoMonto = calculateDiscountAmount(subtotal, descuento)
  const total = calculateOrderTotal(items, descuento)

  const updateItem = (key, patch) => {
    setItems(prev => prev.map(item => item._key === key ? { ...item, ...patch } : item))
  }

  const removeItem = (key) => {
    setItems(prev => prev.filter(item => item._key !== key))
  }

  const addItem = () => {
    setItems(prev => [...prev, newEditableItem()])
  }

  const selectProduct = (key, productKey) => {
    const option = productOptions.find(product => product.key === productKey)
    if (!option) {
      updateItem(key, { productKey })
      return
    }

    updateItem(key, {
      productKey,
      nombre: option.nombre,
      precio_unitario: option.precio_unitario,
      menu_item_id: option.menu_item_id,
      variante_id: option.variante_id,
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    const cleaned = items
      .map(item => ({
        ...item,
        nombre: item.nombre.trim(),
        cantidad: Math.max(1, Number(item.cantidad || 1)),
        precio_unitario: parseCurrencyValue(item.precio_unitario),
      }))
      .filter(item => item.nombre)

    if (cleaned.length === 0) {
      setError('El pedido debe tener al menos un item.')
      return
    }

    setError(null)
    await onSave(pedido.id, {
      canal,
      mesa: mesa ? Number(mesa) : null,
      notas,
      descuento_porcentaje: descuento,
      items: cleaned,
    })
  }

  if (!open || !pedido) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <form
        onSubmit={submit}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Editar pedido</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estos cambios impactan en tickets internos y factura fiscal futura.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <section className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Canal</label>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CANALES.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCanal(option.id)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold"
                    style={canal === option.id
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Mesa</label>
              <input
                type="number"
                min="1"
                value={mesa}
                onChange={e => setMesa(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Descuento %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={descuentoPorcentaje}
                onChange={e => setDescuentoPorcentaje(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Items</p>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ color: 'var(--accent-lift)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}
              >
                <Plus size={13} />
                Agregar item
              </button>
            </div>

            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item._key}
                  className="grid gap-2 rounded-lg p-3 md:grid-cols-[1fr_82px_120px_32px]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
                >
                  <div className="min-w-0">
                    <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Producto</label>
                    <select
                      value={item.productKey || ''}
                      onChange={e => selectProduct(item._key, e.target.value)}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      <option value="">{loadingMenu ? 'Cargando menu...' : 'Elegir producto'}</option>
                      {productOptions.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label} - ${formatMoney(option.precio_unitario)}
                        </option>
                      ))}
                      {item.nombre && !productOptions.some(option => option.key === item.productKey) && (
                        <option value={item.productKey || `custom_${item.nombre}`}>{item.nombre}</option>
                      )}
                    </select>
                    <input
                      value={item.notas}
                      onChange={e => updateItem(item._key, { notas: e.target.value })}
                      placeholder="Notas del item"
                      className="mt-2 w-full rounded-lg px-3 py-2 text-xs outline-none"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Cant.</label>
                    <input
                      type="number"
                      min="1"
                      value={item.cantidad}
                      onChange={e => updateItem(item._key, { cantidad: e.target.value })}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Precio</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={e => updateItem(item._key, { precio_unitario: e.target.value })}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <p className="mt-1 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      ${formatMoney(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item._key)}
                    className="mt-5 flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Notas del pedido</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </section>
        </div>

        <footer className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Subtotal: ${formatMoney(subtotal)}</p>
            {descuento > 0 && (
              <p className="text-xs" style={{ color: '#34d399' }}>
                Descuento {descuento.toLocaleString('es-AR')}%: -${formatMoney(descuentoMonto)}
              </p>
            )}
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total: ${formatMoney(total)}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

function PedidoCajaCard({ pedido, arcaReady, busy, onComanda, onNoFiscalTicket, onTicket, onEdit, onNotaCredito }) {
  const comprobante = getAuthorizedComprobante(pedido)
  const shortId = pedido.id.slice(-4).toUpperCase()
  const items = pedido.pedido_items || []
  const canal = CANAL_LABEL[pedido.canal] || pedido.canal
  const date = new Date(pedido.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const descuento = clampDiscount(pedido.descuento_porcentaje)
  const comprobanteLabel = comprobante ? nombreComprobante(comprobante.tipo_cbte) : null

  return (
    <article
      className="rounded-lg p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>#{shortId}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
              {canal}
            </span>
            {pedido.mesa && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                Mesa {pedido.mesa}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <Clock size={11} /> {date}
            </span>
          </div>
          <div className="mt-3 space-y-1">
            {items.slice(0, 4).map(item => (
              <p key={item.id} className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--accent-lift)' }}>{item.cantidad}x</span> {item.nombre}
              </p>
            ))}
            {items.length > 4 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>+{items.length - 4} items</p>
            )}
          </div>
        </div>

        <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Total</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>${formatMoney(pedido.total)}</p>
            {descuento > 0 && (
              <p className="text-[10px] font-semibold" style={{ color: '#34d399' }}>-{descuento.toLocaleString('es-AR')}%</p>
            )}
          </div>
          {comprobante ? (
            <span
              title={comprobanteLabel}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}
            >
              <CheckCircle2 size={12} />
              {comprobante.letra} {formatReceiptNumber(comprobante.punto_venta, comprobante.numero)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              <AlertTriangle size={12} />
              Sin CAE
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={() => onEdit(pedido)}
          disabled={Boolean(comprobante)}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Edit3 size={14} />
          Editar
        </button>
        <button
          onClick={() => onComanda(pedido)}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Printer size={14} />
          Comanda
        </button>
        <button
          onClick={() => onNoFiscalTicket(pedido)}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <ReceiptText size={14} />
          Ticket no fiscal
        </button>
        {comprobante && (
          <button
            onClick={() => onNotaCredito(pedido, comprobante)}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <FileMinus2 size={14} />
            Nota Crédito
          </button>
        )}
        <button
          onClick={() => onTicket(pedido)}
          disabled={busy || (!comprobante && !arcaReady)}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: comprobante ? '#2563eb' : 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
          {comprobante ? 'Reimprimir ticket' : 'Facturar + ticket'}
        </button>
      </div>
    </article>
  )
}

export default function CajaPage() {
  const {
    pedidos,
    config,
    loading,
    error,
    setupWarning,
    stats,
    arcaReady,
    arcaComprobantesUrl,
    refetch,
    imprimirComanda,
    imprimirTicketNoFiscal,
    actualizarPedido,
    facturarEImprimir,
    emitirNotaCredito,
  } = useFacturacion()

  const [filter, setFilter] = useState('pendientes')
  const [busyId, setBusyId] = useState(null)
  const [editingPedido, setEditingPedido] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [notice, setNotice] = useState(null)
  const [facturarTarget, setFacturarTarget] = useState(null)        // { pedido }
  const [ncTarget, setNcTarget] = useState(null)                     // { pedido, comprobante }

  const filteredPedidos = useMemo(() => {
    if (filter === 'todos') return pedidos
    if (filter === 'facturados') return pedidos.filter(getAuthorizedComprobante)
    return pedidos.filter(pedido => !getAuthorizedComprobante(pedido))
  }, [filter, pedidos])

  const handleTicket = async (pedido) => {
    // Si ya está facturado, reimprime directo. Si no, abre modal para elegir tipo.
    const existing = getAuthorizedComprobante(pedido)
    if (existing) {
      setBusyId(pedido.id)
      setNotice(null)
      try {
        await facturarEImprimir(pedido)
        setNotice({ type: 'ok', text: 'Ticket reimpreso.' })
      } catch (err) {
        setNotice({ type: 'error', text: err.message || 'No se pudo imprimir.' })
      } finally {
        setBusyId(null)
      }
      return
    }
    setFacturarTarget({ pedido })
  }

  const handleConfirmarFactura = async ({ tipo_cbte, receptor }) => {
    if (!facturarTarget?.pedido) return
    const pedido = facturarTarget.pedido
    setBusyId(pedido.id)
    setNotice(null)
    try {
      await facturarEImprimir(pedido, { tipo_cbte, receptor })
      setNotice({ type: 'ok', text: 'Comprobante emitido y enviado a impresión.' })
      setFacturarTarget(null)
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'No se pudo facturar.' })
    } finally {
      setBusyId(null)
    }
  }

  const handleNotaCredito = (pedido, comprobante) => {
    setNcTarget({ pedido, comprobante })
  }

  const handleConfirmarNc = async ({ total, motivo }) => {
    if (!ncTarget?.pedido || !ncTarget?.comprobante) return
    const { pedido, comprobante } = ncTarget
    setBusyId(pedido.id)
    setNotice(null)
    try {
      await emitirNotaCredito(pedido, comprobante, { total, motivo })
      setNotice({ type: 'ok', text: 'Nota de crédito emitida y enviada a impresión.' })
      setNcTarget(null)
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'No se pudo emitir la NC.' })
    } finally {
      setBusyId(null)
    }
  }

  const handleNoFiscalTicket = async (pedido) => {
    setBusyId(pedido.id)
    setNotice(null)
    try {
      await imprimirTicketNoFiscal(pedido)
      setNotice({ type: 'ok', text: 'Ticket no fiscal enviado a impresion.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'No se pudo imprimir el ticket no fiscal.' })
    } finally {
      setBusyId(null)
    }
  }

  const handleSaveEdit = async (pedidoId, values) => {
    setSavingEdit(true)
    setNotice(null)
    try {
      await actualizarPedido(pedidoId, values)
      setEditingPedido(null)
      setNotice({ type: 'ok', text: 'Pedido actualizado. Ya podes imprimir el ticket.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'No se pudo actualizar el pedido.' })
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="min-h-full px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Kiku Sushi
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--text-primary)' }}>
              Caja y ARCA
            </h1>
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </header>

        <section className="grid gap-3 lg:grid-cols-3">
          <StatusPill
            ok
            icon={Usb}
            label="Comandera USB"
            detail="Impresion desde Windows"
          />
          <StatusPill
            ok={arcaReady}
            icon={ShieldCheck}
            label="ARCA WSFE"
            detail={arcaReady ? `PV ${config?.punto_venta}` : 'Conector pendiente'}
          />
          <StatusPill
            ok={Boolean(config?.cuit)}
            icon={FileText}
            label={config?.nombre_fantasia || 'Kiku Sushi'}
            detail={config?.cuit ? `CUIT ${config.cuit}` : 'Datos fiscales pendientes'}
          />
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat label="Pedidos" value={stats.pedidos} />
          <Stat label="Pendientes" value={stats.pendientes} color="#fbbf24" />
          <Stat label="Facturados" value={stats.facturados} color="#34d399" />
          <Stat label="Total dia" value={`$${formatMoney(stats.total)}`} color="#4f8ef7" />
        </section>

        {(error || setupWarning || notice || !arcaReady) && (
          <section className="mt-4 space-y-2">
            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            {setupWarning && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                {setupWarning}
              </div>
            )}
            {!arcaReady && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                ARCA queda bloqueado hasta configurar CUIT, punto de venta y backend WSFE{arcaComprobantesUrl ? '.' : ' en VITE_ARCA_API_URL.'}
              </div>
            )}
            {notice && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{
                background: notice.type === 'ok' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                color: notice.type === 'ok' ? '#34d399' : '#f87171',
                border: `1px solid ${notice.type === 'ok' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                {notice.text}
              </div>
            )}
          </section>
        )}

        <section className="mt-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map(item => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={filter === item.id
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
            </div>
          ) : filteredPedidos.length === 0 ? (
            <div className="rounded-lg py-16 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <Receipt size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No hay pedidos en esta vista</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredPedidos.map(pedido => (
                <PedidoCajaCard
                  key={pedido.id}
                  pedido={pedido}
                  arcaReady={arcaReady}
                  busy={busyId === pedido.id}
                  onComanda={imprimirComanda}
                  onNoFiscalTicket={handleNoFiscalTicket}
                  onTicket={handleTicket}
                  onEdit={setEditingPedido}
                  onNotaCredito={handleNotaCredito}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <EditPedidoModal
        open={Boolean(editingPedido)}
        pedido={editingPedido}
        saving={savingEdit}
        onClose={() => setEditingPedido(null)}
        onSave={handleSaveEdit}
      />

      <FacturarModal
        open={Boolean(facturarTarget)}
        pedido={facturarTarget?.pedido}
        busy={Boolean(facturarTarget && busyId === facturarTarget.pedido?.id)}
        permiteFacturaA={Boolean(config?.permite_factura_a)}
        onClose={() => setFacturarTarget(null)}
        onConfirm={handleConfirmarFactura}
      />

      <NotaCreditoModal
        open={Boolean(ncTarget)}
        pedido={ncTarget?.pedido}
        comprobante={ncTarget?.comprobante}
        busy={Boolean(ncTarget && busyId === ncTarget.pedido?.id)}
        onClose={() => setNcTarget(null)}
        onConfirm={handleConfirmarNc}
      />
    </div>
  )
}
