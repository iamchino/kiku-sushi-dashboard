import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Printer, Ban, Receipt, User, Phone, MapPin,
  Clock, Tag, ExternalLink, AlertCircle, Loader2, Utensils, Truck,
  ShoppingBag, CheckCircle2, Lock, Plus, Minus, Trash2, Banknote, Gift, RotateCcw,
  Pencil, AlertTriangle, CreditCard, Send, Wallet,
} from 'lucide-react'
import { getEstadoSimple, getTipoPedido } from '../../hooks/usePedidos'
import { useFacturacion } from '../../hooks/useFacturacion'
import { printCustomerTicket, formatMoney } from '../../lib/printing'
import { MEDIO_PAGO_LABELS } from '../../lib/escposFormatter'
import { applyStoredDiscount, parseCurrencyValue } from '../../lib/orders'
import { fetchEnvioConfig, costoDeZona } from '../../lib/envio'
import { getAuthorizedComprobante } from '../../lib/fiscal'
import FacturarModal from '../caja/FacturarModal'
import AgregarItemsModal from '../mesas/AgregarItemsModal'
import DescuentoModal from './DescuentoModal'
import ComandaModal from './ComandaModal'
import EditarDatosPedidoModal from './EditarDatosPedidoModal'

const TIPO_META = {
  salon:    { label: 'Para Comer Aquí', icon: Utensils,    color: 'var(--accent-lift)' },
  llevar:   { label: 'Para Llevar',     icon: ShoppingBag, color: '#fbbf24'             },
  delivery: { label: 'Web',             icon: Truck,       color: '#4f8ef7'             },
}

const ESTADO_BADGE = {
  activa:     { label: 'Activa',     bg: 'rgba(79,142,247,0.12)', color: '#4f8ef7' },
  completada: { label: 'Completada', bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
  cancelada:  { label: 'Cancelada',  bg: 'rgba(239,68,68,0.10)',  color: '#f87171' },
}

const ESTADO_CRUDO_LABEL = {
  pendiente:  'Pendiente',
  preparando: 'En cocina',
  listo:      'Listo',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
}


function formatFechaHora(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// Ícono según el medio de pago.
function medioIcon(medio) {
  if (medio === 'efectivo') return Banknote
  if (medio === 'transferencia') return Send
  if (medio === 'tarjeta_credito' || medio === 'tarjeta_debito') return CreditCard
  return Wallet
}

/**
 * Modal de detalle de pedido (lectura + acciones).
 *
 * Acciones disponibles:
 *  - Imprimir comanda (cocina)
 *  - Imprimir ticket cliente (pre-cuenta)
 *  - Avanzar estado (cuando el pedido está activo)
 *  - Cancelar pedido (cuando el pedido está activo)
 *  - Para pedidos de salón: link a la mesa para editar items / cobrar
 */
export default function PedidoDetalleModal({
  pedido, onClose, onCerrarClick, onCancelar,
  onReabrir, onReactivar, onAgregarItems, onUpdateItemCantidad, onRemoveItem,
  onAplicarDescuento, onQuitarDescuento, onSetEnvio, onActualizarDatos,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [facturarOpen, setFacturarOpen] = useState(false)
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [descuentoOpen, setDescuentoOpen] = useState(false)
  const [comandaOpen, setComandaOpen] = useState(false)
  const [datosOpen, setDatosOpen] = useState(false)
  const [zoomImg, setZoomImg] = useState(null)
  const [envioOpen, setEnvioOpen] = useState(false)
  const [envioInput, setEnvioInput] = useState('')
  const [envioBusy, setEnvioBusy] = useState(false)
  const [baseEnvio, setBaseEnvio] = useState(0)
  const [zonasEnvio, setZonasEnvio] = useState([])
  const [zonaSel, setZonaSel] = useState('')
  const { config, arcaReady, facturarEImprimir, imprimirTicket } = useFacturacion()

  useEffect(() => {
    if (!pedido) return
    setError(null)
    setBusy(false)
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (zoomImg) { setZoomImg(null); return }
      onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pedido, onClose, zoomImg])

  // Carga la config de envío (base + zonas) para el selector de zona.
  useEffect(() => {
    let activo = true
    fetchEnvioConfig().then(({ base, zonas }) => {
      if (!activo) return
      setBaseEnvio(base)
      setZonasEnvio(zonas)
    })
    return () => { activo = false }
  }, [])

  const tipo       = useMemo(() => pedido ? getTipoPedido(pedido) : null, [pedido])
  const simple     = useMemo(() => pedido ? getEstadoSimple(pedido) : null, [pedido])
  const comprobante = useMemo(() => pedido ? getAuthorizedComprobante(pedido) : null, [pedido])

  if (!pedido) return null

  const tipoMeta   = TIPO_META[tipo]
  const TipoIcon   = tipoMeta?.icon
  const estadoMeta = ESTADO_BADGE[simple]
  const shortId    = String(pedido.id).slice(-4).toUpperCase()
  const codigo     = pedido.codigo || `KS${shortId}`
  const items      = pedido.pedido_items || []
  const facturada  = Boolean(comprobante)
  const descuentoInfo = applyStoredDiscount(items, pedido)
  const envio = Number(pedido?.costo_envio || 0)
  const esDelivery = pedido?.canal === 'delivery'
  const puedeAvanzar = false
  const puedeCancelar = simple === 'activa'

  // Detalle de cómo pagó el cliente: usa la tabla `pagos` (soporta pago
  // dividido); si no hay filas, cae al medio guardado en el pedido (cobros
  // fuera de caja). Vacío si la orden todavía no se cobró.
  const pagos = Array.isArray(pedido.pagos)
    ? [...pedido.pagos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : []
  const pagoLineas = pagos.length > 0
    ? pagos.map(p => ({ medio: p.medio_pago, monto: Number(p.monto) || 0, nroOp: p.numero_operacion || null }))
    : (pedido.medio_pago ? [{ medio: pedido.medio_pago, monto: Number(pedido.total) || 0, nroOp: null }] : [])
  const pagoDividido = pagoLineas.length > 1

  // Edición de items: pedidos activos. Los facturados se permiten con aviso fiscal.
  const editable      = simple === 'activa'
  // Reabrir / editar: pedidos completados (entregados).
  const puedeReabrir  = simple === 'completada'
  // Restablecer: pedidos cancelados por accidente.
  const puedeReactivar = simple === 'cancelada'

  const handleReabrir = async () => {
    if (facturada && !confirm(
      'Esta orden ya tiene factura emitida (CAE). Reabrirla para editarla puede ' +
      'generar inconsistencias fiscales: la factura conserva su número y monto. ' +
      '¿Continuar de todas formas?'
    )) return
    setBusy(true); setError(null)
    const err = await onReabrir?.(pedido.id, { force: facturada })
    setBusy(false)
    if (err) { setError(err.message || 'No se pudo reabrir el pedido'); return }
    // El pedido queda activo; el modal se sincroniza solo (realtime en la página).
  }

  const handleReactivar = async () => {
    const msg = facturada
      ? 'Esta orden cancelada tiene factura emitida (CAE). Restaurarla puede generar ' +
        'inconsistencias fiscales. ¿Restaurar de todas formas? Volverá a estar pendiente.'
      : '¿Restablecer este pedido cancelado? Volverá a estar pendiente.'
    if (!confirm(msg)) return
    setBusy(true); setError(null)
    const err = await onReactivar?.(pedido.id, { force: facturada })
    setBusy(false)
    if (err) { setError(err.message || 'No se pudo restablecer el pedido'); return }
    onClose?.()
  }

  const handleAgregarItems = async (newItems) => {
    const err = await onAgregarItems?.(pedido.id, newItems)
    return { error: err || null }
  }

  const handleItemCantidad = async (itemId, nuevaCantidad) => {
    setError(null)
    const err = await onUpdateItemCantidad?.(pedido.id, itemId, nuevaCantidad)
    if (err) setError(err.message || 'No se pudo actualizar el item')
  }

  const abrirEnvio = () => {
    setEnvioInput(envio > 0 ? String(envio) : (baseEnvio ? String(baseEnvio) : ''))
    // Si el pedido ya tenía una zona guardada, la preseleccionamos.
    const z = zonasEnvio.find(z => z.nombre === pedido?.envio_zona)
    setZonaSel(z ? z.id : '')
    setEnvioOpen(true)
  }

  const handleZonaChange = (id) => {
    setZonaSel(id)
    if (!id) return
    const zona = zonasEnvio.find(z => z.id === id)
    if (zona) setEnvioInput(String(costoDeZona(baseEnvio, zona)))
  }

  const handleSetEnvio = async () => {
    setEnvioBusy(true); setError(null)
    const zonaNombre = zonaSel ? (zonasEnvio.find(z => z.id === zonaSel)?.nombre || null) : null
    const err = await onSetEnvio?.(pedido.id, envioInput, zonaNombre)
    setEnvioBusy(false)
    if (err) { setError(err.message || 'No se pudo actualizar el envío'); return }
    setEnvioOpen(false)
  }

  const handleItemRemove = async (itemId) => {
    setError(null)
    const err = await onRemoveItem?.(pedido.id, itemId)
    if (err) setError(err.message || 'No se pudo quitar el item')
  }

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar este pedido? Esta acción no se puede deshacer.')) return
    setBusy(true); setError(null)
    const err = await onCancelar?.(pedido.id)
    setBusy(false)
    if (err) { setError(err.message || 'Error al cancelar'); return }
    onClose?.()
  }

  const handleFacturarClick = () => {
    setError(null)
    if (comprobante) {
      // Ya facturado → reimprime directo
      imprimirTicket(pedido, comprobante)
      return
    }
    if (!arcaReady) {
      setError('ARCA no está configurado.')
      return
    }
    setFacturarOpen(true)
  }

  const handleConfirmarFactura = async ({ tipo_cbte, receptor }) => {
    setBusy(true); setError(null)
    try {
      await facturarEImprimir(pedido, { tipo_cbte, receptor })
      setFacturarOpen(false)
    } catch (e) {
      setError(e.message || 'No se pudo facturar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-start justify-between gap-3"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
            color: '#fff',
            borderBottom: '1px solid var(--accent-border)',
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-medium uppercase tracking-wider opacity-90">Pedido</p>
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
              >
                {ESTADO_CRUDO_LABEL[pedido.estado] || pedido.estado}
              </span>
            </div>
            <p className="font-mono font-bold text-xl leading-none mt-1 tracking-tight">{codigo}</p>
            <div className="flex items-center gap-3 mt-2 text-[11px] opacity-95 flex-wrap">
              {TipoIcon && (
                <span className="flex items-center gap-1.5">
                  <TipoIcon size={11} /> {tipoMeta.label}
                </span>
              )}
              {pedido.mesa && (
                <span className="flex items-center gap-1.5">
                  <Utensils size={11} /> Mesa {pedido.mesa}
                  {pedido.personas ? ` · ${pedido.personas} p` : ''}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock size={11} /> {formatFechaHora(pedido.created_at)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Aviso fiscal: la orden ya tiene factura y aún se permite editar/reabrir/restaurar */}
          {facturada && (editable || puedeReabrir || puedeReactivar) && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#f59e0b' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Orden facturada.</strong> Editar, reabrir o restaurar esta orden puede
                generar inconsistencias fiscales: el comprobante ya emitido conserva su número
                y monto (CAE {comprobante?.cae ? `${comprobante.cae}` : 'autorizado'}).
              </span>
            </div>
          )}

          {/* Datos cliente */}
          {(pedido.cliente_nombre || pedido.cliente_telefono || pedido.cliente_direccion) && (
            <div
              className="rounded-lg p-3 space-y-1.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Cliente
              </p>
              {pedido.cliente_nombre && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                  <User size={12} style={{ color: 'var(--text-muted)' }} />
                  <span className="font-medium truncate">{pedido.cliente_nombre}</span>
                </div>
              )}
              {pedido.cliente_telefono && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                  <a
                    href={`tel:${pedido.cliente_telefono}`}
                    className="hover:underline"
                    style={{ color: 'var(--accent-lift)' }}
                  >
                    {pedido.cliente_telefono}
                  </a>
                </div>
              )}
              {pedido.cliente_direccion && (
                <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <MapPin size={12} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
                  <span className="leading-snug">{pedido.cliente_direccion}</span>
                </div>
              )}
            </div>
          )}

          {/* Items */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Productos ({items.length})
              </p>
              {estadoMeta && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: estadoMeta.bg, color: estadoMeta.color }}
                >
                  {estadoMeta.label}
                </span>
              )}
            </div>

            {editable && (
              <button
                type="button"
                onClick={() => setAgregarOpen(true)}
                className="w-full mb-2 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '2px dashed var(--accent-border)' }}
              >
                <Plus size={15} /> Agregar productos
              </button>
            )}

            {items.length === 0 ? (
              <p className="text-xs italic py-3" style={{ color: 'var(--text-xmuted)' }}>
                Sin productos cargados.
              </p>
            ) : (
              <div className="space-y-1">
                {items.map(item => {
                  const linea = (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0)
                  return (
                    <div
                      key={item.id || `${item.nombre}-${item.cantidad}`}
                      className="flex items-start gap-3 px-3 py-2 rounded-lg"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
                    >
                      {item.imagen_url && (
                        <button
                          type="button"
                          onClick={() => setZoomImg({ url: item.imagen_url, alt: item.nombre })}
                          className="flex-shrink-0 w-11 h-11 rounded-md overflow-hidden transition-transform hover:scale-105 cursor-zoom-in"
                          style={{ border: '1px solid var(--border)' }}
                          title="Ampliar imagen"
                          aria-label={`Ampliar imagen de ${item.nombre}`}
                        >
                          <img
                            src={item.imagen_url}
                            alt={item.nombre}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                      {editable ? (
                        <div className="flex items-center rounded-md flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            onClick={() => handleItemCantidad(item.id, Number(item.cantidad) - 1)}
                            className="w-6 h-7 flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                            title="Restar"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="text-xs font-bold w-6 text-center" style={{ color: 'var(--text-primary)' }}>
                            {item.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleItemCantidad(item.id, Number(item.cantidad) + 1)}
                            className="w-6 h-7 flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                            title="Sumar"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="text-xs font-bold w-7 text-center flex-shrink-0 pt-0.5"
                          style={{ color: 'var(--accent-lift)' }}
                        >
                          {item.cantidad}×
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>
                          {item.nombre}
                        </p>
                        {item.notas && (
                          <p className="text-[10px] italic mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {item.notas}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-medium tabular-nums flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        ${formatMoney(linea)}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => handleItemRemove(item.id)}
                          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                          style={{ color: '#f87171' }}
                          title="Quitar producto"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Notas */}
          {pedido.notas && (
            <section className="rounded-lg p-3"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
                Notas
              </p>
              <p className="text-xs whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {pedido.notas}
              </p>
            </section>
          )}

          {/* Historial de rondas de "libre" */}
          {Array.isArray(pedido.kiku_libre_historial) && pedido.kiku_libre_historial.length > 0 && (
            <section className="rounded-lg p-3"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Repes de libre ({pedido.kiku_libre_historial.length}
                {(() => {
                  const tot = pedido.kiku_libre_historial.reduce((a, h) => a + (parseInt(h?.platos) || 0), 0)
                  return tot > 0 ? ` · ${tot} platos` : ''
                })()})
              </p>
              <div className="space-y-1">
                {[...pedido.kiku_libre_historial].reverse().map((h, idx) => (
                  <div key={idx} className="flex items-start gap-2 px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <span className="text-[11px] font-extrabold tabular-nums flex-shrink-0 px-1 rounded"
                      style={{ color: '#f59e0b', background: 'rgba(251,191,36,0.12)' }} title={`Repe ${h.ronda}`}>#{h.ronda}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>Kiku libre x{h.platos || 1}</p>
                      {h.nota && <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{h.nota}</p>}
                      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        {h.at ? new Date(h.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {h.mozo ? ` · ${h.mozo}` : ''}
                        {!h.nota ? ' · sin nota' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Totales */}
          <section className="rounded-lg p-3 space-y-1"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {(descuentoInfo.descuentoMonto > 0 || envio > 0) && (
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Subtotal</span>
                <span>${formatMoney(descuentoInfo.subtotal)}</span>
              </div>
            )}
            {descuentoInfo.descuentoMonto > 0 && (
              <div className="flex justify-between text-xs items-center" style={{ color: 'var(--accent-lift)' }}>
                <span className="flex items-center gap-1"><Tag size={11} /> Descuento</span>
                <span>-${formatMoney(descuentoInfo.descuentoMonto)}</span>
              </div>
            )}
            {envio > 0 && (
              <div className="flex justify-between text-xs items-center" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1"><Truck size={11} /> Envío{pedido.envio_zona ? ` · ${pedido.envio_zona}` : ''}</span>
                <span>${formatMoney(envio)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="text-base font-bold" style={{ color: 'var(--accent-lift)' }}>
                ${formatMoney(descuentoInfo.total + envio)}
              </span>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => setDescuentoOpen(true)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
              >
                <Gift size={13} /> {descuentoInfo.descuentoMonto > 0 ? 'Editar descuento / gift card' : 'Aplicar descuento / gift card'}
              </button>
            )}

            {/* Costo de envío: editable solo para delivery activo y no facturado */}
            {editable && esDelivery && (
              envioOpen ? (
                <div className="mt-2 rounded-lg p-2 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Costo de envío</label>
                  {zonasEnvio.length > 0 && (
                    <select
                      value={zonaSel}
                      onChange={e => handleZonaChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="">Manual / sin zona (base ${baseEnvio.toLocaleString('es-AR')})</option>
                      {zonasEnvio.map(z => (
                        <option key={z.id} value={z.id}>
                          {z.nombre} — ${costoDeZona(baseEnvio, z).toLocaleString('es-AR')}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-xmuted)' }}>$</span>
                      <input
                        type="text" inputMode="numeric" autoFocus
                        value={envioInput}
                        onChange={e => { setEnvioInput(e.target.value); setZonaSel('') }}
                        placeholder="0"
                        className="w-full pl-6 pr-2 py-1.5 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <button type="button" onClick={handleSetEnvio} disabled={envioBusy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}>
                      {envioBusy ? <Loader2 size={13} className="animate-spin" /> : 'Guardar'}
                    </button>
                    <button type="button" onClick={() => setEnvioOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={abrirEnvio}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  <Truck size={13} /> {envio > 0 ? `Editar envío ($${formatMoney(envio)})` : 'Agregar costo de envío'}
                </button>
              )
            )}
            {pedido.afecta_caja === false && (
              <div className="mt-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px]"
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                <Banknote size={12} />
                Cobrada fuera de caja — no afecta el arqueo
                {pedido.medio_pago ? ` · ${MEDIO_PAGO_LABELS[pedido.medio_pago] || pedido.medio_pago}` : ''}
              </div>
            )}
          </section>

          {/* Pago — cómo pagó el cliente (medios registrados; soporta split) */}
          {pagoLineas.length > 0 && (
            <section className="rounded-lg p-3 space-y-1.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Wallet size={11} /> Pago{pagoDividido ? ' · dividido' : ''}
                </p>
                {pedido.afecta_caja === false && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                    Fuera de caja
                  </span>
                )}
              </div>
              {pagoLineas.map((l, i) => {
                const Icon = medioIcon(l.medio)
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <Icon size={13} style={{ color: 'var(--text-muted)' }} />
                      {MEDIO_PAGO_LABELS[l.medio] || l.medio}
                      {l.nroOp && <span style={{ color: 'var(--text-xmuted)' }}>· op. {l.nroOp}</span>}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      ${formatMoney(l.monto)}
                    </span>
                  </div>
                )
              })}
            </section>
          )}

          {/* Facturación */}
          {facturada && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
              <Receipt size={14} className="flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold">Factura emitida</p>
                <p className="mt-0.5 opacity-90 break-all">
                  CAE {comprobante?.cae} · #{comprobante?.numero}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer / acciones */}
        <div
          className="flex-shrink-0 p-3 space-y-2"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          {/* Facturar: botón principal cuando se puede emitir comprobante */}
          {simple === 'activa' && (
            <button
              type="button"
              onClick={onCerrarClick}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              <Lock size={14} />
              Cerrar pedido
            </button>
          )}

          {(arcaReady || comprobante) && simple !== 'activa' && simple !== 'cancelada' && (
            <button
              type="button"
              onClick={handleFacturarClick}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
              {comprobante ? 'Re-imprimir factura' : 'Facturar + ticket fiscal'}
            </button>
          )}

          {!puedeAvanzar && simple === 'completada' && (
            <div
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', border: '1px solid rgba(52,211,153,0.18)' }}
            >
              <CheckCircle2 size={12} /> Pedido completado
            </div>
          )}

          {/* Editar orden: reabre el pedido cerrado y lo deja editable en un paso */}
          {puedeReabrir && (
            <button
              type="button"
              onClick={handleReabrir}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
              title="Reabre la orden y la deja editable"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              Editar orden
            </button>
          )}

          {/* Restablecer: revierte una cancelación accidental (vuelve a pendiente) */}
          {puedeReactivar && (
            <button
              type="button"
              onClick={handleReactivar}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Restablecer pedido
            </button>
          )}

          {pedido.mesa_id && (
            <Link
              to="/mesas"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
            >
              <ExternalLink size={12} />
              Abrir mesa {pedido.mesa}
            </Link>
          )}

          {/* Editar todos los datos: fecha, hora, cliente, mesa, notas, tipo */}
          <button
            type="button"
            onClick={() => setDatosOpen(true)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
          >
            <Pencil size={14} /> Editar datos (fecha, cliente, notas…)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setComandaOpen(true)}
              className="py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Printer size={12} /> Comanda
            </button>
            <button
              type="button"
              onClick={() => printCustomerTicket(pedido)}
              className="py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Receipt size={12} /> Ticket cliente
            </button>
          </div>

          {puedeCancelar && (
            <button
              type="button"
              onClick={handleCancelar}
              disabled={busy}
              className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
              Cancelar pedido
            </button>
          )}
        </div>
      </div>
    </div>

      <FacturarModal
        open={facturarOpen}
        pedido={pedido}
        busy={busy}
        permiteFacturaA={Boolean(config?.permite_factura_a)}
        onClose={() => setFacturarOpen(false)}
        onConfirm={handleConfirmarFactura}
      />

      <AgregarItemsModal
        open={agregarOpen}
        mesa={pedido.mesa ? { numero: pedido.mesa } : null}
        titulo={pedido.mesa ? null : `Orden ${codigo}`}
        onClose={() => setAgregarOpen(false)}
        onAdd={handleAgregarItems}
      />

      <DescuentoModal
        open={descuentoOpen}
        pedido={pedido}
        items={items}
        onClose={() => setDescuentoOpen(false)}
        onAplicar={(cfg) => onAplicarDescuento?.(pedido.id, cfg)}
        onQuitar={() => onQuitarDescuento?.(pedido.id)}
      />

      <ComandaModal
        open={comandaOpen}
        pedido={pedido}
        items={items}
        onClose={() => setComandaOpen(false)}
      />

      <EditarDatosPedidoModal
        open={datosOpen}
        pedido={pedido}
        facturada={facturada}
        onClose={() => setDatosOpen(false)}
        onGuardar={onActualizarDatos}
      />

      {/* Lightbox: imagen ampliada del producto */}
      {zoomImg && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { e.stopPropagation(); setZoomImg(null) }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoomImg(null) }}
            className="absolute top-4 right-4 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            aria-label="Cerrar imagen"
          >
            <X size={18} />
          </button>
          <img
            src={zoomImg.url}
            alt={zoomImg.alt}
            className="max-w-full max-h-[88vh] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
