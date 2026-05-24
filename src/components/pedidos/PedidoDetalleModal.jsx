import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Printer, Ban, ChevronRight, Receipt, User, Phone, MapPin,
  Clock, Tag, ExternalLink, AlertCircle, Loader2, Utensils, Truck,
  ShoppingBag, CheckCircle2,
} from 'lucide-react'
import { ESTADO_SIGUIENTE, getEstadoSimple, getTipoPedido } from '../../hooks/usePedidos'
import { printComanda, printCustomerTicket, formatMoney } from '../../lib/printing'
import { getAuthorizedComprobante } from '../../lib/fiscal'

const TIPO_META = {
  salon:    { label: 'Para Comer Aquí', icon: Utensils,    color: 'var(--accent-lift)' },
  llevar:   { label: 'Para Llevar',     icon: ShoppingBag, color: '#fbbf24'             },
  delivery: { label: 'Delivery',        icon: Truck,       color: '#4f8ef7'             },
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

const BTN_AVANZAR_LABEL = {
  pendiente:  'Enviar a cocina',
  preparando: 'Marcar listo',
  listo:      'Marcar entregado',
}

function formatFechaHora(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
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
export default function PedidoDetalleModal({ pedido, onClose, onAvanzar, onCancelar }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!pedido) return
    setError(null)
    setBusy(false)
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pedido, onClose])

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
  const siguiente  = ESTADO_SIGUIENTE[pedido.estado]
  const puedeAvanzar = simple === 'activa' && siguiente && !pedido.mesa_id
  const puedeCancelar = simple === 'activa'

  const handleAvanzar = async () => {
    setBusy(true); setError(null)
    const err = await onAvanzar?.(pedido.id, pedido.estado)
    setBusy(false)
    if (err) setError(err.message || 'Error al avanzar el estado')
  }

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar este pedido? Esta acción no se puede deshacer.')) return
    setBusy(true); setError(null)
    const err = await onCancelar?.(pedido.id)
    setBusy(false)
    if (err) { setError(err.message || 'Error al cancelar'); return }
    onClose?.()
  }

  return (
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
                      <span
                        className="text-xs font-bold w-7 text-center flex-shrink-0 pt-0.5"
                        style={{ color: 'var(--accent-lift)' }}
                      >
                        {item.cantidad}×
                      </span>
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

          {/* Totales */}
          <section className="rounded-lg p-3 space-y-1"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {Number(pedido.descuento_porcentaje) > 0 && (
              <div className="flex justify-between text-xs items-center">
                <span className="flex items-center gap-1" style={{ color: 'var(--accent-lift)' }}>
                  <Tag size={11} /> Descuento {pedido.descuento_porcentaje}%
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="text-base font-bold" style={{ color: 'var(--accent-lift)' }}>
                ${formatMoney(pedido.total)}
              </span>
            </div>
          </section>

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
          {pedido.mesa_id ? (
            <Link
              to="/mesas"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              <ExternalLink size={14} />
              Abrir mesa {pedido.mesa} (editar / cobrar)
            </Link>
          ) : puedeAvanzar ? (
            <button
              type="button"
              onClick={handleAvanzar}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              {BTN_AVANZAR_LABEL[pedido.estado] || 'Avanzar estado'}
            </button>
          ) : simple === 'completada' && (
            <div
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', border: '1px solid rgba(52,211,153,0.18)' }}
            >
              <CheckCircle2 size={12} /> Pedido completado
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => printComanda(pedido)}
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
  )
}
