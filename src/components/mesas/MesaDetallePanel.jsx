import { useState } from 'react'
import {
  X, Users, Clock, User, Plus, Minus, Trash2, Printer, ChefHat,
  Receipt, AlertCircle, Loader2, Ban, Tag, CheckCircle2,
} from 'lucide-react'
import { useMesaPedido } from '../../hooks/useMesaPedido'
import { useMinutesSince } from '../../hooks/useNowTick'
import { printComanda, printCustomerTicket, formatMoney } from '../../lib/printing'
import { getEstadoConfig } from './mesaColors'
import AgregarItemsModal from './AgregarItemsModal'
import CobrarMesaModal from './CobrarMesaModal'

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
  const [showCobrar, setShowCobrar]   = useState(false)
  const [enviando, setEnviando]       = useState(false)
  const [cancelando, setCancelando]   = useState(false)
  const [actionErr, setActionErr]     = useState(null)
  const [editDesc, setEditDesc]       = useState(false)
  const [descInput, setDescInput]     = useState('')

  const minutos = useMinutesSince(mesa?.pedido_abierta_at)

  if (!mesa) return null

  const cfg = getEstadoConfig(mesa.estado_mesa)

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

  const handleImprimirComanda = () => { if (pedido) printComanda(pedido) }
  const handleImprimirCliente = () => { if (pedido) printCustomerTicket(pedido) }

  const handleSetDesc = async (e) => {
    e.preventDefault()
    await setDescuento(parseFloat(descInput) || 0)
    setEditDesc(false); setDescInput('')
  }

  return (
    <aside
      className="flex flex-col h-full w-full lg:w-[380px] flex-shrink-0"
      style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }}
    >
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
          color: '#ffffff',
          borderBottom: '1px solid var(--accent-border)',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--accent-lift)' }}>Mesa</p>
            <p className="font-bold text-3xl leading-none mt-0.5">{mesa.numero}</p>
            <span
              className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#ffffff',
                border: `1px solid ${cfg.borderHi}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.borderHi }} />
              {cfg.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
          >
            <X size={16} />
          </button>
        </div>

        {pedido && (
          <div className="flex items-center gap-3 mt-3 text-xs opacity-95 flex-wrap">
            <span className="flex items-center gap-1.5"><Users size={12} /> {pedido.personas || 1} personas</span>
            {mesa.mozo_nombre && (
              <span className="flex items-center gap-1.5"><User size={12} /> {mesa.mozo_nombre}</span>
            )}
            {minutos !== null && (
              <span className="flex items-center gap-1.5"><Clock size={12} /> {minutos}m</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {pedidoError && (
          <div className="mx-4 mt-3 rounded-lg p-3 text-xs flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
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
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: mesa.estado_mesa === 'libre' ? 'var(--accent-soft)' : 'rgba(251,191,36,0.15)' }}>
              <Users size={26} style={{ color: mesa.estado_mesa === 'libre' ? 'var(--accent-lift)' : '#fbbf24' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {mesa.estado_mesa === 'libre' ? 'Mesa disponible' : 'Mesa marcada como ocupada, pero sin pedido visible'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {mesa.estado_mesa === 'libre'
                  ? `Capacidad ${mesa.capacidad} personas`
                  : 'Puede ser un problema de permisos (RLS) o el pedido fue borrado. Revisá la consola (F12).'
                }
              </p>
            </div>
            {mesa.estado_mesa === 'libre' && (
              <button
                type="button"
                onClick={() => onAbrirMesa?.(mesa)}
                className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02]"
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
          <div className="px-5 py-4 space-y-4">
            {pedido.cliente_nombre && (
              <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <p className="font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{pedido.cliente_nombre}</p>
                {pedido.cliente_telefono && <p style={{ color: 'var(--text-muted)' }}>{pedido.cliente_telefono}</p>}
              </div>
            )}

            {itemsNoEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--accent-lift)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    Por enviar a cocina
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
                    {itemsNoEnviados.length}
                  </span>
                </div>
                <div className="space-y-1">
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

            {itemsEnviados.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={10} /> Enviados a cocina
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                    {itemsEnviados.length}
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
                Mesa abierta sin productos. Agregá items para empezar.
              </div>
            )}

            <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                <span style={{ color: 'var(--text-secondary)' }}>${formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs items-center">
                <button
                  type="button"
                  onClick={() => { setEditDesc(!editDesc); setDescInput(String(descuentoPct || '')) }}
                  className="flex items-center gap-1"
                  style={{ color: descuentoPct > 0 ? 'var(--accent-lift)' : 'var(--text-muted)' }}
                >
                  <Tag size={11} /> Descuento {descuentoPct > 0 ? `${descuentoPct}%` : '—'}
                </button>
                <span style={{ color: descuentoPct > 0 ? 'var(--accent-lift)' : 'var(--text-secondary)' }}>
                  {descuentoPct > 0 ? `-$${formatMoney(descuentoMonto)}` : '$0,00'}
                </span>
              </div>
              {editDesc && !facturada && (
                <form onSubmit={handleSetDesc} className="flex gap-1.5 pt-1.5">
                  <input
                    type="number" min={0} max={100} step="0.01"
                    autoFocus
                    value={descInput}
                    onChange={e => setDescInput(e.target.value)}
                    placeholder="%"
                    className="flex-1 px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  <button type="submit" className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: 'var(--accent)' }}>OK</button>
                </form>
              )}
              <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
                <span className="text-base font-bold" style={{ color: 'var(--accent-lift)' }}>${formatMoney(total)}</span>
              </div>
            </div>

            {facturada && (
              <div className="rounded-lg p-3 text-xs flex items-start gap-2" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent-lift)' }}>
                <Receipt size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Factura emitida</p>
                  <p className="mt-0.5 opacity-90">CAE {comprobanteAutorizado?.cae} · #{comprobanteAutorizado?.numero}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pedido && (
        <div className="flex-shrink-0 p-3 space-y-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {actionErr && (
            <div className="rounded-lg px-2 py-1.5 text-[11px] flex items-center gap-1.5" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <AlertCircle size={11} /> {actionErr}
            </div>
          )}

          {!facturada && (
            <>
              <button
                type="button"
                onClick={() => setShowAgregar(true)}
                className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
              >
                <Plus size={14} /> Agregar productos
              </button>

              {itemsNoEnviados.length > 0 && (
                <button
                  type="button"
                  onClick={handleEnviar}
                  disabled={enviando}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
                  }}
                >
                  {enviando
                    ? <><Loader2 size={14} className="animate-spin" /> Enviando…</>
                    : <><ChefHat size={14} /> Enviar a cocina ({itemsNoEnviados.length})</>
                  }
                </button>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleImprimirComanda}
              className="py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Printer size={11} /> Comanda
            </button>
            <button
              type="button"
              onClick={handleImprimirCliente}
              className="py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Receipt size={11} /> Pre-cuenta
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCobrar(true)}
            disabled={items.length === 0}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
              boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
              border: '1px solid var(--accent-border)',
            }}
          >
            <Receipt size={14} />
            {facturada ? 'Cerrar mesa' : 'Cobrar / Facturar'}
          </button>

          {!facturada && (
            <button
              type="button"
              onClick={handleCancelar}
              disabled={cancelando}
              className="w-full py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {cancelando ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              Cancelar mesa
            </button>
          )}
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

function ItemRow({ item, onMinus, onPlus, onRemove, editable = true, dimmed = false }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        opacity: dimmed ? 0.7 : 1,
      }}
    >
      {editable ? (
        <>
          <button type="button" onClick={onMinus} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            <Minus size={10} />
          </button>
          <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>{item.cantidad}</span>
          <button type="button" onClick={onPlus} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            <Plus size={10} />
          </button>
        </>
      ) : (
        <span className="text-xs font-bold w-12 text-center" style={{ color: 'var(--text-primary)' }}>{item.cantidad}×</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{item.nombre}</p>
        {item.notas && <p className="text-[10px] truncate italic" style={{ color: 'var(--text-xmuted)' }}>{item.notas}</p>}
      </div>
      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        ${formatMoney(item.precio_unitario * item.cantidad)}
      </span>
      {editable && (
        <button type="button" onClick={onRemove} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: 'var(--text-xmuted)' }}>
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}
