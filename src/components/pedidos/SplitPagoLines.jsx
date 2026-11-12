import { Plus, Trash2, Banknote, CreditCard, Send } from 'lucide-react'
import { formatMoney } from '../../lib/printing'
import { parseCurrencyValue } from '../../lib/orders'
import {
  LABEL_CUENTA_CORRIENTE, MEDIO_CUENTA_CORRIENTE,
  cuentaUsable, etiquetaCuenta, problemaCuentaCorriente,
} from '../../lib/cuentasCorrientes'

export const MEDIOS_SPLIT = [
  { id: 'efectivo',        label: 'Efectivo',        icon: Banknote,   color: '#5FD3A3' },
  { id: 'tarjeta_credito', label: 'Tarjeta Crédito', icon: CreditCard, color: '#E8A23F' },
  { id: 'tarjeta_debito',  label: 'Tarjeta Débito',  icon: CreditCard, color: '#a78bfa' },
  { id: 'transferencia',   label: 'Transferencia',   icon: Send,       color: '#8FB2F2' },
]

const TARJETAS = new Set(['tarjeta_credito', 'tarjeta_debito'])

// `extra` permite precargar la cuenta corriente y su nro. de operación.
export function nuevaLinea(medio = 'efectivo', monto = '', extra = {}) {
  return { _key: Math.random().toString(36).slice(2, 9), medio, monto: String(monto), nroOp: '', cuentaId: null, ...extra }
}

export function sumaLineas(lineas) {
  return (lineas || []).reduce((acc, l) => acc + parseCurrencyValue(l.monto), 0)
}

/**
 * Valida que la suma coincida con el total (±$1 por redondeo), que las
 * tarjetas tengan nro. y que lo que va a cuenta corriente tenga cuenta y no
 * supere su saldo. `cuentas` = cuentas disponibles para cobrar (con saldo).
 */
export function lineasValidas(lineas, total, cuentas = []) {
  if (!lineas || lineas.length === 0) return false
  for (const l of lineas) {
    if (!l.medio || parseCurrencyValue(l.monto) <= 0) return false
    if (TARJETAS.has(l.medio) && !String(l.nroOp || '').trim()) return false
  }
  if (problemaCuentaCorriente(lineasAPagos(lineas), cuentas)) return false
  return Math.abs(sumaLineas(lineas) - Number(total || 0)) <= 1
}

/** Lista lista para registrarPago: [{ medio_pago, monto, numero_operacion, cuenta_corriente_id? }]. */
export function lineasAPagos(lineas) {
  return (lineas || []).map(l => {
    const esCuenta = l.medio === MEDIO_CUENTA_CORRIENTE
    return {
      medio_pago: l.medio,
      monto: parseCurrencyValue(l.monto),
      // Tarjetas: cupón del posnet (obligatorio). Cuenta corriente: voucher (opcional).
      numero_operacion: (TARJETAS.has(l.medio) || esCuenta) ? (String(l.nroOp || '').trim() || null) : null,
      ...(esCuenta ? { cuenta_corriente_id: l.cuentaId || null } : {}),
    }
  })
}

const labelMedio = (id) => (
  id === MEDIO_CUENTA_CORRIENTE ? LABEL_CUENTA_CORRIENTE : (MEDIOS_SPLIT.find(x => x.id === id)?.label || id)
)

/** Resumen legible para el ticket: "Efectivo $1.000 + Transferencia $500". */
export function resumenMedios(lineas) {
  return (lineas || [])
    .map(l => `${labelMedio(l.medio)} $${formatMoney(parseCurrencyValue(l.monto))}`)
    .join(' + ')
}

/**
 * Editor de líneas de pago dividido (controlado).
 * Props: total, lineas, setLineas, cuentas (cuentas corrientes disponibles;
 * si no hay ninguna el medio "Cuenta corriente" no se ofrece).
 */
export default function SplitPagoLines({ total, lineas, setLineas, cuentas = [] }) {
  const asignado = sumaLineas(lineas)
  const resta = Number(total || 0) - asignado
  const hayCuentas = cuentas.length > 0
  const inputCard = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  // Lo que ya se cargó a cada cuenta sumando todas las líneas (una misma
  // cuenta puede aparecer en más de una).
  const cargadoA = (cuentaId) => lineas
    .filter(l => l.medio === MEDIO_CUENTA_CORRIENTE && l.cuentaId === cuentaId)
    .reduce((acc, l) => acc + parseCurrencyValue(l.monto), 0)

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
              {(hayCuentas || l.medio === MEDIO_CUENTA_CORRIENTE) && (
                <option value={MEDIO_CUENTA_CORRIENTE}>{LABEL_CUENTA_CORRIENTE}</option>
              )}
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
              style={{ color: '#F2708C' }}
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
          {l.medio === MEDIO_CUENTA_CORRIENTE && (() => {
            const cuenta = cuentas.find(c => c.id === l.cuentaId) || null
            const excedido = cuenta ? cargadoA(cuenta.id) - Number(cuenta.saldo || 0) : 0
            return (
              <>
                <div className="flex items-center gap-2">
                  <select
                    value={l.cuentaId || ''}
                    onChange={e => update(l._key, { cuentaId: e.target.value || null })}
                    aria-label="Cuenta corriente"
                    className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs outline-none"
                    style={{ ...inputCard, border: `1px solid ${l.cuentaId ? 'var(--border)' : '#F2708C'}` }}
                  >
                    <option value="">Elegí la cuenta…</option>
                    {cuentas.map(c => (
                      <option key={c.id} value={c.id} disabled={!cuentaUsable(c)}>{etiquetaCuenta(c)}</option>
                    ))}
                  </select>
                  <input
                    value={l.nroOp}
                    onChange={e => update(l._key, { nroOp: e.target.value })}
                    maxLength={40}
                    placeholder="Voucher (opcional)"
                    className="w-32 rounded-lg px-2 py-1.5 text-xs outline-none"
                    style={inputCard}
                  />
                </div>
                {cuenta && excedido > 1 && (
                  <p className="text-[10px]" style={{ color: '#F2708C' }}>
                    Supera el saldo de la cuenta (${formatMoney(cuenta.saldo)}) por ${formatMoney(excedido)}.
                  </p>
                )}
              </>
            )
          })()}
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
        <span className="font-bold" style={{ color: Math.abs(resta) <= 1 ? '#5FD3A3' : '#E8A23F' }}>
          {Math.abs(resta) <= 1 ? 'OK' : (resta > 0 ? `Falta $${formatMoney(resta)}` : `Sobra $${formatMoney(-resta)}`)}
        </span>
      </div>
    </div>
  )
}
