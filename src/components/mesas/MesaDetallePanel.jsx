import { useState } from 'react'
import {
  X, Users, Clock, User, Plus, Minus, Trash2, Printer,
  Receipt, AlertCircle, Loader2, Ban, Tag, FileText,
} from 'lucide-react'
import { useMesaPedido } from '../../hooks/useMesaPedido'
import { useMinutesSince } from '../../hooks/useNowTick'
import { printComanda, printCustomerTicket, formatMoney } from '../../lib/printing'
import { getEstadoConfig } from './mesaColors'
import AgregarItemsModal from './AgregarItemsModal'
import CobrarMesaModal from './CobrarMesaModal'

/**
 * Panel lateral de la mesa rediseñado para uso bajo estrés.
 * - Header compacto: número grande + chip de estado en una sola línea
 * - CTA principal "Agregar productos" siempre visible arriba
 * - Items con sección clara de "por enviar" vs "enviados"
 * - Total sticky abajo, fácil de leer
 * - Acción contextual GIGANTE según estado (enviar/cobrar/cerrar)
 * - Acciones secundarias en row de iconos compactos
 */
export default function MesaDetallePanel({ mesa, onClose, onAbrirMesa }) {
  const {
    pedido, items, itemsNoEnviados, itemsEnviados,
    subtotal, descuentoPct, descuentoMonto, total,
    facturada, comprobanteAutorizado,
    loading, error: pedidoError,
    agregarItems, updateItemCantidad, removeItem,
    enviarACocina, cerrarMesa, cancelarMesa,
    setDescuento,
  } = useMesaPedido({ mesaId: mesa?.id })

  const [showAgregar, setShowAgregar] = useState(false)
  const [showCobrar,  setShowCobrar]  = useState(false)
  const [enviando,    setEnviando]    = useState(false)
  const [cancelando,  setCancelando]  = useState(false)
  const [actionErr,   setActionErr]   = useState(null)
  const [editDesc,    setEditDesc]    = useState(false)
  const [descInput,   setDescInput]   = useState('')

  const minutos = useMinutesSince(mesa?.pedido_abierta_at)

  if (!mesa) return null

  const cfg = getEstadoConfig(mesa.estado_mesa)
  const todoEnviado = items.length > 0 && itemsNoEnviados.length === 0

  const handleEnviar = async () => {
    setEnviando(true); setActionErr(null)
    const aImprimir = [...itemsNoEnviados]
    const { error } = await enviarACocina()
    setEnviando(false)
    if (error) { setActionErr(error.message || 'Error al enviar'); return }
    if (aImprimir.length > 0) {
      printComanda({
        ...pedido,
        pedido_items: aImprimir,
        _ronda_label: itemsEnviados.length > 0 ? 'RONDA ADICIONAL' : null,
      })
    }
  }

  const handleCancelar = async () => {
    if (!confirm('¿Cancelar la mesa? Se descartará el pedido sin facturar.')) return
    setCancelando(true); setActionErr(null)
    const { error } = await cancelarMesa()
    setCancelando(false)
    if (error) { setActionErr(error.message || 'Error al cancelar'); return }
    onClose?.()
  }

  const handleSetDesc = async (e) => {
    e.preventDefault()
    await setDescuento(parseFloat(descInput) || 0)
    setEditDesc(false); setDescInput('')
  }

  // Acción principal del footer.
  // Los CTAs "Enviar a cocina" y "Cobrar / Facturar" fueron removidos:
  // ese flujo ahora vive en la pestaña Ordenes (avanzar estado) y el cobro
  // se sigue disparando desde el icono "Cobrar" de las acciones secundarias.
  const accionPrincipal = facturada
    ? { label: 'Cerrar mesa', icon: Receipt, color: '#71717a', onClick: () => setShowCobrar(true) }
    : null

  // Evita warning de "variable no usada" cuando ya no se invoca el CTA grande.
  void todoEnviado; void enviando; void handleEnviar

  return (
    <aside
      className="flex flex-col h-full w-full lg:w-[400px] xl:w-[420px] flex-shrink-0"
      style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }}
    >
      {/* ── HEADER COMPACTO ──────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
          color: '#ffffff',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="font-bold text-3xl leading-none">Mesa {mesa.numero}</p>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(255,255,255,0.18)',
                color: '#ffffff',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.borderHi }} />
              {cfg.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          >
            <X size={16} />
          </button>
        </div>

        {pedido && (
          <div className="flex items-center gap-3 mt-1.5 text-[11px] opacity-90">
            <span className="flex items-center gap-1"><Users size={11} /> {pedido.personas || 1}</span>
            {mesa.mozo_nombre && (
              <span className="flex items-center gap-1"><User size={11} /> {mesa.mozo_nombre}</span>
            )}
            {minutos !== null && (
              <span className="flex items-center gap-1"><Clock size={11} /> {minutos}m</span>
            )}
            {pedido.cliente_nombre && (
              <span className="ml-auto font-medium opacity-100">{pedido.cliente_nombre}</span>
            )}
          </div>
        )}
      </div>

      {/* ── CTA AGREGAR (siempre visible cuando hay pedido) ────────── */}
      {pedido && !facturada && (
        <div className="flex-shrink-0 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setShowAgregar(true)}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-lift)',
              border: '2px dashed var(--accent-border)',
            }}
          >
            <Plus size={18} /> Agregar productos
          </button>
        </div>
      )}

      {/* ── BODY: items + total ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {pedidoError && (
          <div className="mx-3 mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error al cargar el pedido</p>
              <p className="opacity-90 mt-0.5 break-all">{pedidoError}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
          </div>
        ) : !pedido ? (
          // ── Mesa libre ────────────────────────────────────────────
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: mesa.estado_mesa === 'libre' ? 'var(--accent-soft)' : 'rgba(251,191,36,0.15)' }}>
              <Users size={26} style={{ color: mesa.estado_mesa === 'libre' ? 'var(--accent-lift)' : '#fbbf24' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {mesa.estado_mesa === 'libre' ? 'Mesa disponible' : 'Mesa ocupada, sin pedido visible'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {mesa.estado_mesa === 'libre'
                  ? `Capacidad ${mesa.capacidad} personas`
                  : 'Revisá la consola (F12) para más info.'
                }
              </p>
            </div>
            {mesa.estado_mesa === 'libre' && (
              <button
                type="button"
                onClick={() => onAbrirMesa?.(mesa)}
                className="w-full mt-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
                  boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
                }}
              >
                Abrir mesa
              </button>
            )}
          </div>
        ) : (
          // ── Mesa abierta: items ───────────────────────────────────
          <div className="px-3 py-3 space-y-3">
            {/* Items POR ENVIAR — más prominentes (borde accent) */}
            {itemsNoEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--accent-lift)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    Por enviar a cocina
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                    {itemsNoEnviados.reduce((a, i) => a + i.cantidad, 0)}
                  </span>
                </div>
                <div className="space-y-1 rounded-lg p-1.5" style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
                  {itemsNoEnviados.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onMinus={() => updateItemCantidad(item.id, item.cantidad - 1)}
                      onPlus={()  => updateItemCantidad(item.id, item.cantidad + 1)}
                      onRemove={() => removeItem(item.id)}
                      editable
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Items YA ENVIADOS */}
            {itemsEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    En cocina / servidos
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                    {itemsEnviados.reduce((a, i) => a + i.cantidad, 0)}
                  </span>
                </div>
                <div className="space-y-1">
                  {itemsEnviados.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onMinus={() => updateItemCantidad(item.id, item.cantidad - 1)}
                      onPlus={()  => updateItemCantidad(item.id, item.cantidad + 1)}
                      onRemove={() => removeItem(item.id)}
                      editable={!facturada}
                      dimmed
                    />
                  ))}
                </div>
              </section>
            )}

            {items.length === 0 && (
              <div className="text-center py-6 text-xs" style={{ color: 'var(--text-xmuted)' }}>
                Mesa abierta sin productos.
              </div>
            )}

            {facturada && (
              <div className="rounded-lg p-2.5 text-xs flex items-start gap-2" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
                <Receipt size={13} className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">Factura emitida</p>
                  <p className="mt-0.5 opacity-90 truncate">CAE {comprobanteAutorizado?.cae} · #{comprobanteAutorizado?.numero}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TOTAL + acciones sticky ─────────────────────────────── */}
      {pedido && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {/* TOTAL prominente */}
          <div className="px-4 py-3 flex items-end justify-between gap-3"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total</p>
              <p className="font-bold text-2xl leading-none mt-0.5" style={{ color: 'var(--accent-lift)' }}>
                ${formatMoney(total)}
              </p>
              {descuentoPct > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: '#34d399' }}>
                  Subt ${formatMoney(subtotal)} · -{descuentoPct}% (-${formatMoney(descuentoMonto)})
                </p>
              )}
            </div>
            {!facturada && (
              <button
                type="button"
                onClick={() => { setEditDesc(!editDesc); setDescInput(String(descuentoPct || '')) }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0"
                style={{
                  background: descuentoPct > 0 ? 'rgba(52,211,153,0.1)' : 'var(--bg-input)',
                  color: descuentoPct > 0 ? '#34d399' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
                title="Aplicar descuento"
              >
                <Tag size={10} /> {descuentoPct > 0 ? `${descuentoPct}%` : 'Desc.'}
              </button>
            )}
          </div>

          {editDesc && !facturada && (
            <form onSubmit={handleSetDesc} className="flex gap-1.5 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <input
                type="number" min={0} max={100} step="0.01"
                autoFocus
                value={descInput}
                onChange={e => setDescInput(e.target.value)}
                placeholder="%"
                className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--accent-border)', color: 'var(--text-primary)' }}
              />
              <button type="submit" className="px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: 'var(--accent)' }}>OK</button>
              <button type="button" onClick={() => setEditDesc(false)} className="px-2 py-1.5 rounded text-xs" style={{ color: 'var(--text-muted)' }}>×</button>
            </form>
          )}

          {actionErr && (
            <div className="mx-3 mt-2 rounded-md px-2 py-1.5 text-[11px] flex items-center gap-1.5" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <AlertCircle size={11} /> {actionErr}
            </div>
          )}

          {/* CTA principal contextual GRANDE */}
          {accionPrincipal && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={accionPrincipal.onClick}
                disabled={items.length === 0 && !facturada || accionPrincipal.loading}
                className="w-full py-4 rounded-xl text-base font-extrabold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:scale-[1.01]"
                style={{
                  background: accionPrincipal.gradient || accionPrincipal.color,
                  boxShadow: accionPrincipal.shadow || 'none',
                }}
              >
                {accionPrincipal.loading
                  ? <><Loader2 size={18} className="animate-spin" /> Procesando…</>
                  : <><accionPrincipal.icon size={18} /> {accionPrincipal.label}</>
                }
              </button>
            </div>
          )}

          {/* Acciones secundarias compactas: iconos */}
          <div className="grid grid-cols-4 gap-1 p-3">
            <IconButton
              icon={Printer}
              label="Comanda"
              onClick={() => printComanda(pedido)}
            />
            <IconButton
              icon={FileText}
              label="Pre-cuenta"
              onClick={() => printCustomerTicket(pedido)}
            />
            <IconButton
              icon={Receipt}
              label={facturada ? 'Ticket fiscal' : 'Cobrar'}
              onClick={() => setShowCobrar(true)}
              accent
            />
            {!facturada && (
              <IconButton
                icon={cancelando ? Loader2 : Ban}
                label="Cancelar"
                onClick={handleCancelar}
                disabled={cancelando}
                danger
                spin={cancelando}
              />
            )}
          </div>
        </div>
      )}

      <AgregarItemsModal
        open={showAgregar}
        mesa={mesa}
        onClose={() => setShowAgregar(false)}
        onAdd={async (newItems) => {
          const { error } = await agregarItems(newItems)
          return { error }
        }}
      />

      <CobrarMesaModal
        open={showCobrar}
        onClose={() => setShowCobrar(false)}
        pedido={pedido}
        onCerrarMesa={async () => {
          const { error } = await cerrarMesa()
          if (!error) onClose?.()
          return { error }
        }}
      />
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────
function IconButton({ icon: Icon, label, onClick, accent = false, danger = false, disabled = false, spin = false }) {
  const baseStyle = danger
    ? { background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
    : accent
      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
      : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-colors disabled:opacity-50"
      style={baseStyle}
    >
      <Icon size={14} className={spin ? 'animate-spin' : ''} />
      <span className="text-[9px] font-semibold leading-none">{label}</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
function ItemRow({ item, onMinus, onPlus, onRemove, editable = true, dimmed = false }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        opacity: dimmed ? 0.75 : 1,
      }}
    >
      {editable ? (
        <div className="flex items-center rounded" style={{ background: 'var(--bg-input)' }}>
          <button type="button" onClick={onMinus} className="w-5 h-6 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <Minus size={11} />
          </button>
          <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>{item.cantidad}</span>
          <button type="button" onClick={onPlus} className="w-5 h-6 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <Plus size={11} />
          </button>
        </div>
      ) : (
        <span className="text-xs font-bold w-8 text-center px-1 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
          {item.cantidad}×
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.nombre}</p>
        {item.notas && <p className="text-[10px] truncate italic" style={{ color: 'var(--text-xmuted)' }}>{item.notas}</p>}
      </div>
      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
        ${formatMoney(item.precio_unitario * item.cantidad)}
      </span>
      {editable && (
        <button type="button" onClick={onRemove} className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}
