import { useEffect, useMemo, useState } from 'react'
import { X, Percent, DollarSign, Loader2, Tag, Trash2, Gift } from 'lucide-react'
import { previewDescuento, getDescuentoConfig } from '../../lib/orders'
import { formatMoney } from '../../lib/printing'

/**
 * Modal para aplicar un descuento tipo "gift card" a un pedido:
 *  - Tipo: porcentaje (%) o monto fijo ($).
 *  - Alcance: todo el pedido o una selección de ítems (ej. solo comida o bebida).
 *  - Muestra el subtotal, el descuento calculado y el total resultante.
 *
 * Props:
 *  - open, onClose
 *  - pedido, items
 *  - onAplicar({ tipo, valor, alcance, seleccionIds }) => Promise<{error}>
 *  - onQuitar() => Promise<{error}>
 */
export default function DescuentoModal({ open, onClose, pedido, items = [], onAplicar, onQuitar }) {
  const [tipo, setTipo] = useState('porcentaje')
  const [valor, setValor] = useState('')
  const [alcance, setAlcance] = useState('todo')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Inicializa desde el descuento ya guardado al abrir (no en cada refetch del
  // pedido; por eso dependemos de open + id y no del objeto pedido completo).
  useEffect(() => {
    if (!open) return
    const cfg = getDescuentoConfig(pedido)
    setTipo(cfg.tipo || 'porcentaje')
    setValor(cfg.valor ? String(cfg.valor) : '')
    setAlcance(cfg.alcance || 'todo')
    setSeleccion(new Set(cfg.seleccionIds || []))
    setError(null)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pedido?.id])

  const seleccionIds = useMemo(() => [...seleccion], [seleccion])

  const preview = useMemo(
    () => previewDescuento({ items, tipo, valor: Number(valor) || 0, alcance, seleccionIds }),
    [items, tipo, valor, alcance, seleccionIds],
  )

  if (!open || !pedido) return null

  const toggleItem = (id) => {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleAplicar = async () => {
    if (!(Number(valor) > 0)) { setError('Ingresá un valor mayor a cero.'); return }
    if (alcance === 'seleccion' && seleccionIds.length === 0) {
      setError('Elegí al menos un ítem para el descuento.'); return
    }
    setSaving(true); setError(null)
    const { error: err } = (await onAplicar?.({ tipo, valor: Number(valor) || 0, alcance, seleccionIds })) || {}
    setSaving(false)
    if (err) { setError(err.message || 'No se pudo aplicar el descuento.'); return }
    onClose?.()
  }

  const handleQuitar = async () => {
    setSaving(true); setError(null)
    const { error: err } = (await onQuitar?.()) || {}
    setSaving(false)
    if (err) { setError(err.message || 'No se pudo quitar el descuento.'); return }
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Gift size={16} style={{ color: 'var(--accent-lift)' }} />
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Descuento / Gift card</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Tipo */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Tipo</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipo('porcentaje')}
                className="rounded-lg px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                style={tipo === 'porcentaje'
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <Percent size={15} /> Porcentaje
              </button>
              <button type="button" onClick={() => setTipo('monto')}
                className="rounded-lg px-3 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                style={tipo === 'monto'
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <DollarSign size={15} /> Monto fijo
              </button>
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
              {tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto ($)'}
            </label>
            <input
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={e => { setValor(e.target.value); setError(null) }}
              placeholder={tipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 5000'}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Alcance */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Aplica a</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAlcance('todo')}
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                style={alcance === 'todo'
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Todo el pedido
              </button>
              <button type="button" onClick={() => setAlcance('seleccion')}
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                style={alcance === 'seleccion'
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Elegir ítems
              </button>
            </div>
          </div>

          {/* Checklist de ítems */}
          {alcance === 'seleccion' && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Ítems con descuento ({seleccionIds.length})
              </p>
              <div className="space-y-1 rounded-lg p-1.5 max-h-48 overflow-y-auto" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                {items.length === 0 ? (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--text-xmuted)' }}>El pedido no tiene ítems.</p>
                ) : items.map(item => {
                  const checked = seleccion.has(item.id)
                  const linea = (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0)
                  return (
                    <label key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} className="h-4 w-4 accent-[var(--accent)]" />
                      <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>
                        {item.cantidad}× {item.nombre}
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>${formatMoney(linea)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Subtotal</span><span>${formatMoney(preview.subtotal)}</span>
            </div>
            {alcance === 'seleccion' && (
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>Base del descuento</span><span>${formatMoney(preview.base)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs" style={{ color: 'var(--accent-lift)' }}>
              <span className="flex items-center gap-1"><Tag size={11} /> Descuento</span>
              <span>-${formatMoney(preview.descuentoMonto)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="text-base font-bold" style={{ color: 'var(--accent-lift)' }}>${formatMoney(preview.total)}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              {error}
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-2">
          <button type="button" onClick={handleQuitar} disabled={saving}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            <Trash2 size={13} /> Quitar
          </button>
          <button type="button" onClick={handleAplicar} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
            Aplicar descuento
          </button>
        </div>
      </div>
    </div>
  )
}
