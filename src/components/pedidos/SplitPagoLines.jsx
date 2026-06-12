import { Plus, Trash2, Banknote, CreditCard, Send } from 'lucide-react'
import { formatMoney } from '../../lib/printing'
import { parseCurrencyValue } from '../../lib/orders'

export const MEDIOS_SPLIT = [
  { id: 'efectivo',        label: 'Efectivo',        icon: Banknote,   color: '#34d399' },
  { id: 'tarjeta_credito', label: 'Tarjeta Crédito', icon: CreditCard, color: '#f59e0b' },
  { id: 'tarjeta_debito',  label: 'Tarjeta Débito',  icon: CreditCard, color: '#a78bfa' },
  { id: 'transferencia',   label: 'Transferencia',   icon: Send,       color: '#60a5fa' },
]

const TARJETAS = new Set(['tarjeta_credito', 'tarjeta_debito'])

export function nuevaLinea(medio = 'efectivo', monto = '') {
  return { _key: Math.random().toString(36).slice(2, 9), medio, monto: String(monto), nroOp: '' }
}

export function sumaLineas(lineas) {
  return (lineas || []).reduce((acc, l) => acc + parseCurrencyValue(l.monto), 0)
}

/** Valida que la suma coincida con el total (±$1 por redondeo) y que las tarjetas tengan nro. */
export function lineasValidas(lineas, total) {
  if (!lineas || lineas.length === 0) return false
  for (const l of lineas) {
    if (!l.medio || parseCurrencyValue(l.monto) <= 0) return false
    if (TARJETAS.has(l.medio) && !String(l.nroOp || '').trim()) return false
  }
  return Math.abs(sumaLineas(lineas) - Number(total || 0)) <= 1
}

/** Lista lista para registrarPago: [{ medio_pago, monto, numero_operacion }]. */
export function lineasAPagos(lineas) {
  return (lineas || []).map(l => ({
    medio_pago: l.medio,
    monto: parseCurrencyValue(l.monto),
    numero_operacion: TARJETAS.has(l.medio) ? String(l.nroOp || '').trim() : null,
  }))
}

/** Resumen legible para el ticket: "Efectivo $1.000 + Transferencia $500". */
export function resumenMedios(lineas) {
  return (lineas || [])
    .map(l => {
      const m = MEDIOS_SPLIT.find(x => x.id === l.medio)
      return `${m?.label || l.medio} $${formatMoney(parseCurrencyValue(l.monto))}`
    })
    .join(' + ')
}

/**
 * Editor de líneas de pago dividido (controlado).
 * Props: total, lineas, setLineas.
 */
export default function SplitPagoLines({ total, lineas, setLineas }) {
  const asignado = sumaLineas(lineas)
  const resta = Number(total || 0) - asignado

  const update = (key, patch) => setLineas(prev => prev.map(l => (l._key === key ? { ...l, ...patch } : l)))
  const remove = (key) => setLineas(prev => prev.filter(l => l._key !== key))
  const add = () => setLineas(prev => [...prev, nuevaLinea('efectivo', resta > 0 ? Math.round(resta) : '')])

  return (
    <div className="space-y-2">
      {lineas.map(l => (
        <div key={l._key} className="rounded-lg p-2 space-y-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <select
              value={l.medio}
              onChange={e => update(l._key, { medio: e.target.value })}
              className="flex-1 rounded-lg px-2 py-2 text-xs outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {MEDIOS_SPLIT.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="flex items-center gap-1 px-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                inputMode="decimal"
                value={l.monto}
                onChange={e => update(l._key, { monto: e.target.value })}
                placeholder="0"
                className="w-20 py-2 text-xs text-right outline-none bg-transparent"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(l._key)}
              disabled={lineas.length <= 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
              style={{ color: '#f87171' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {TARJETAS.has(l.medio) && (
            <input
              inputMode="numeric"
              value={l.nroOp}
              onChange={e => update(l._key, { nroOp: e.target.value })}
              placeholder="Nro. operación (posnet)"
              className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
        style={{ background: 'var(--bg-input)', color: 'var(--accent-lift)', border: '1px dashed var(--accent-border)' }}
      >
        <Plus size={13} /> Agregar medio
      </button>

      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Asignado ${formatMoney(asignado)} de ${formatMoney(total)}</span>
        <span className="font-bold" style={{ color: Math.abs(resta) <= 1 ? '#34d399' : '#f59e0b' }}>
          {Math.abs(resta) <= 1 ? 'OK' : (resta > 0 ? `Falta $${formatMoney(resta)}` : `Sobra $${formatMoney(-resta)}`)}
        </span>
      </div>
    </div>
  )
}
