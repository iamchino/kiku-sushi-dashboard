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
  WalletCards,
  X, Banknote, Landmark, ChevronDown } from 'lucide-react'
import { useFacturacion } from '../hooks/useFacturacion'
import { supabase } from '../lib/supabase'
import { esNotaCredito, formatReceiptNumber, getAuthorizedComprobante, getNotasCredito, nombreComprobante } from '../lib/fiscal'
import { formatMoney } from '../lib/printing'
import { calculateDiscountAmount, calculateOrderSubtotal, calculateOrderTotal, clampDiscount, parseCurrencyValue } from '../lib/orders'
import { colorMedioPago, etiquetaMedioPago, lineasDePago, resumenMediosPago } from '../lib/pagosPedido'
import ArqueoCajaSection from '../components/caja/ArqueoCajaSection'
import PagosPanel from '../components/caja/PagosPanel'
import CajaFuertePanel from '../components/caja/CajaFuertePanel'
import { usePermisos } from '../context/usePermisos'
import FacturarModal from '../components/caja/FacturarModal'
import NotaCreditoModal from '../components/caja/NotaCreditoModal'

const FILTERS = [
  { id: 'pendientes', label: 'Pendientes de facturación' },
  { id: 'facturados', label: 'Facturados' },
  { id: 'con_nc', label: 'Con NC' },
  { id: 'todos', label: 'Todos' },
]

const SECCIONES_CAJA = [
  { id: 'facturacion', label: 'Facturacion', icon: Receipt },
  { id: 'arqueo', label: 'Arqueo y movimientos', icon: WalletCards },
  // Pagos centralizados: todos los egresos del negocio salen de acá, con la
  // caja abierta o cerrada. Solo lo ve quien tiene el permiso 'pagos'.
  { id: 'pagos', label: 'Pagos', icon: Banknote, recurso: 'pagos' },
  { id: 'caja_fuerte', label: 'Caja fuerte', icon: Landmark, recurso: 'caja_fuerte' },
]

const RANGOS_RAPIDOS = [
  { id: 'hoy',     label: 'Hoy' },
  { id: 'semana',  label: 'Últ. 7 días' },
  { id: 'mes',     label: 'Últ. 30 días' },
  { id: 'custom',  label: 'Custom' },
]

// Devuelve YYYY-MM-DD en hora LOCAL (no UTC, para no perder pedidos de noche).
function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function calcularRango(id, customFrom, customTo) {
  const hoy = new Date()
  if (id === 'hoy')    return { from: localDateISO(hoy),                                        to: localDateISO(hoy) }
  if (id === 'semana') return { from: localDateISO(new Date(hoy.getTime() - 6 * 86400000)),   to: localDateISO(hoy) }
  if (id === 'mes')    return { from: localDateISO(new Date(hoy.getTime() - 29 * 86400000)),  to: localDateISO(hoy) }
  return { from: customFrom || localDateISO(hoy), to: customTo || localDateISO(hoy) }
}

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

function EstadoChip({ ok, label, detail, icon: Icon }) {
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] leading-none"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
      title={`${label} — ${detail}`}
    >
      <Icon size={12} className="shrink-0" style={{ color: ok ? '#34d399' : '#fbbf24' }} />
      <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span aria-hidden="true" style={{ color: 'var(--border-card)' }}>·</span>
      <span className="truncate" style={{ color: 'var(--text-muted)' }}>{detail}</span>
    </span>
  )
}

// Caja de métricas agrupadas: un recuadro por tema, con su color propio.
function GrupoMetricas({ titulo, color, icon: Icon, children }) {
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: 'var(--bg-card)', border: `1px solid ${color}59`, boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${color}1f` }}>
        <Icon size={13} style={{ color }} />
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>{titulo}</p>
      </div>
      <div className="py-0.5">
        {children}
      </div>
    </div>
  )
}

// Fila de una caja de métricas: etiqueta a la izquierda, valor a la derecha.
function FilaMetrica({ label, value, hint, color = 'var(--text-primary)', apagado = false, fuerte = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span className="truncate text-xs" style={{ color: apagado ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        {hint && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
        <span
          className={fuerte ? 'text-base font-bold' : 'text-sm font-bold'}
          style={{ color: apagado ? 'var(--text-muted)' : color }}
        >
          {value}
        </span>
      </span>
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
  const notasCredito = getNotasCredito(pedido)
  const totalNc = notasCredito.reduce((acc, nc) => acc + Number(nc.importe_total || 0), 0)
  const netoFacturado = comprobante ? Math.max(0, Number(comprobante.importe_total || 0) - totalNc) : 0
  const shortId = pedido.id.slice(-4).toUpperCase()
  const items = pedido.pedido_items || []
  const canal = CANAL_LABEL[pedido.canal] || pedido.canal
  const date = new Date(pedido.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const descuento = clampDiscount(pedido.descuento_porcentaje)
  const comprobanteLabel = comprobante ? nombreComprobante(comprobante.tipo_cbte) : null

  // Forma de pago: chip en la cabecera, detalle desplegable al clickearlo.
  const [verPago, setVerPago] = useState(false)
  const pagoLineas = lineasDePago(pedido)
  const pagoDividido = pagoLineas.length > 1
  const totalCobrado = pagoLineas.reduce((acc, l) => acc + l.monto, 0)
  const pagoColor = pagoDividido ? 'var(--accent-lift)' : colorMedioPago(pagoLineas[0]?.medio)
  const pagoLabel = pagoDividido ? 'Pago dividido' : etiquetaMedioPago(pagoLineas[0]?.medio)

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
            {pagoLineas.length > 0 ? (
              <button
                type="button"
                onClick={() => setVerPago(v => !v)}
                aria-expanded={verPago}
                title="Ver detalle del cobro"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
                style={{ background: 'var(--bg-input)', color: pagoColor, border: `1px solid ${'var(--border)'}` }}
              >
                <Banknote size={11} />
                {pagoLabel}
                <ChevronDown size={11} className={verPago ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
            ) : (
              <span
                title="La orden todavía no registra cobro"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}
              >
                <Banknote size={11} />
                Sin cobro
              </span>
            )}
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
            {notasCredito.length > 0 && (
              <p className="mt-1 text-[10px] font-semibold" style={{ color: '#f87171' }}>
                NC: -${formatMoney(totalNc)}
              </p>
            )}
            {notasCredito.length > 0 && (
              <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-lift)' }}>
                Neto: ${formatMoney(netoFacturado)}
              </p>
            )}
          </div>
          {comprobante ? (
            <div className="flex flex-col items-end gap-1">
              <span
                title={comprobanteLabel}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}
              >
                <CheckCircle2 size={12} />
                {comprobante.letra} {formatReceiptNumber(comprobante.punto_venta, comprobante.numero)}
              </span>
              {notasCredito.map(nc => (
                <span
                  key={nc.id}
                  title={`${nombreComprobante(nc.tipo_cbte)} por $${formatMoney(nc.importe_total)}`}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                >
                  <FileMinus2 size={11} />
                  NC {nc.letra} {formatReceiptNumber(nc.punto_venta, nc.numero)} (-${formatMoney(nc.importe_total)})
                </span>
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              <AlertTriangle size={12} />
              Sin CAE
            </span>
          )}
        </div>
      </div>

      {verPago && pagoLineas.length > 0 && (
        <div
          className="mt-3 rounded-lg px-3 py-2"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Detalle del cobro
          </p>
          <div className="mt-1.5 space-y-1">
            {pagoLineas.map((linea, i) => (
              <div key={`${linea.medio}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorMedioPago(linea.medio) }} />
                  {etiquetaMedioPago(linea.medio)}
                  {linea.nroOp && <span style={{ color: 'var(--text-muted)' }}>· op. {linea.nroOp}</span>}
                  {linea.at && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      · {new Date(linea.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${formatMoney(linea.monto)}
                </span>
              </div>
            ))}
          </div>
          {pagoDividido && (
            <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-1.5" style={{ borderColor: 'var(--border-card)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Total cobrado</span>
              <span className="text-xs font-bold" style={{ color: 'var(--accent-lift)' }}>${formatMoney(totalCobrado)}</span>
            </div>
          )}
          {pagoLineas.some(l => l.estimado) && (
            <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Medio informado en el pedido: no hay cobro registrado en caja.
            </p>
          )}
        </div>
      )}

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
  // Arranca en la semana: mirar solo el día dejaba afuera los pedidos de
  // anoche, que es lo primero que se busca al abrir la pantalla.
  const [rango, setRango]           = useState('semana')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const { from: dateFrom, to: dateTo } = useMemo(
    () => calcularRango(rango, customFrom, customTo),
    [rango, customFrom, customTo],
  )

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
  } = useFacturacion({ dateFrom, dateTo })

  const [filter, setFilter] = useState('pendientes')
  const [busyId, setBusyId] = useState(null)
  const [editingPedido, setEditingPedido] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [notice, setNotice] = useState(null)
  const [facturarTarget, setFacturarTarget] = useState(null)        // { pedido }
  const [ncTarget, setNcTarget] = useState(null)                     // { pedido, comprobante }
  const [seccion, setSeccion] = useState('facturacion')
  const { puede } = usePermisos()
  const seccionesVisibles = SECCIONES_CAJA.filter(t => !t.recurso || puede(t.recurso))

  const resumenPagos = useMemo(() => resumenMediosPago(pedidos), [pedidos])

  const filteredPedidos = useMemo(() => {
    if (filter === 'todos') return pedidos
    if (filter === 'facturados') return pedidos.filter(getAuthorizedComprobante)
    if (filter === 'con_nc') {
      return pedidos.filter(pedido => (pedido.comprobantes_fiscales || []).some(c => esNotaCredito(c.tipo_cbte) && c.estado === 'autorizado'))
    }
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
              Caja y facturación
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Mostrando: {dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <EstadoChip
                ok
                icon={Usb}
                label="Comandera USB"
                detail="Impresion desde Windows"
              />
              <EstadoChip
                ok={arcaReady}
                icon={ShieldCheck}
                label="ARCA WSFE"
                detail={arcaReady ? `PV ${config?.punto_venta}` : 'Conector pendiente'}
              />
              <EstadoChip
                ok={Boolean(config?.cuit)}
                icon={FileText}
                label={config?.nombre_fantasia || 'Kiku Sushi'}
                detail={config?.cuit ? `CUIT ${config.cuit}` : 'Datos fiscales pendientes'}
              />
            </div>
          </div>
          {puede('pagos') && (
            <button
              onClick={() => setSeccion('pagos')}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
            >
              <Banknote size={15} />
              Pagos
            </button>
          )}
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

        {/* Filtro de fecha */}
        <section className="mb-4 flex flex-wrap items-end gap-2">
          {RANGOS_RAPIDOS.map(r => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={rango === r.id
                ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {r.label}
            </button>
          ))}
          {rango === 'custom' && (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Desde</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="block mt-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Hasta</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="block mt-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>
            </>
          )}
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <GrupoMetricas titulo="Facturación" color="#f97316" icon={Receipt}>
            <FilaMetrica label="Pedidos" value={stats.pedidos} />
            <FilaMetrica label="Pendientes facturación" value={stats.pendientes} color="#fbbf24" apagado={stats.pendientes === 0} />
            <FilaMetrica label="Facturados" value={stats.facturados} color="#34d399" apagado={stats.facturados === 0} />
            <FilaMetrica label="Notas de crédito" value={stats.notasCredito} color="#f87171" apagado={stats.notasCredito === 0} />
          </GrupoMetricas>

          <GrupoMetricas titulo="Formas de pago" color="#4f8ef7" icon={Banknote}>
            {resumenPagos.medios.map(medio => (
              <FilaMetrica
                key={medio.id}
                label={medio.label}
                value={`$${formatMoney(medio.monto)}`}
                hint={medio.cobros > 0 ? `${medio.cobros} ${medio.cobros === 1 ? 'cobro' : 'cobros'}` : null}
                color={medio.color}
                apagado={medio.cobros === 0}
              />
            ))}
            {resumenPagos.sinRegistrar > 0 && (
              <FilaMetrica
                label="Sin cobro registrado"
                value={`${resumenPagos.sinRegistrar} ${resumenPagos.sinRegistrar === 1 ? 'orden' : 'órdenes'}`}
                color="#fbbf24"
              />
            )}
            <FilaMetrica label="Total cobrado" value={`$${formatMoney(resumenPagos.totalCobrado)}`} fuerte />
          </GrupoMetricas>

          <GrupoMetricas titulo="Totales" color="#34d399" icon={WalletCards}>
            <FilaMetrica label="Vendido (pedidos)" value={`$${formatMoney(stats.total)}`} />
            <FilaMetrica label="Total facturado" value={`$${formatMoney(stats.totalFacturado)}`} color="#4f8ef7" />
            <FilaMetrica
              label="Notas de crédito"
              value={`-$${formatMoney(stats.totalNotasCredito)}`}
              color="#f87171"
              apagado={!stats.totalNotasCredito}
            />
            <FilaMetrica label="Neto (post-NC)" value={`$${formatMoney(stats.netoFacturado)}`} color="var(--accent-lift)" fuerte />
          </GrupoMetricas>
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

        <section className="mt-5 flex flex-wrap gap-2">
          {seccionesVisibles.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setSeccion(item.id)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={seccion === item.id
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                <Icon size={14} />
                {item.label}
              </button>
            )
          })}
        </section>

        {seccion === 'caja_fuerte' ? (
          <div className="mt-5"><CajaFuertePanel /></div>
        ) : seccion === 'pagos' ? (
          <div className="mt-5"><PagosPanel /></div>
        ) : seccion === 'arqueo' ? (
          <ArqueoCajaSection dateFrom={dateFrom} dateTo={dateTo} />
        ) : (
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
        )}
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
