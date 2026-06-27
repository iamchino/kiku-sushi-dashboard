import { useEffect, useMemo } from 'react'
import { Plus, Minus, Users, Split, Banknote, CreditCard, Send } from 'lucide-react'
import { formatMoney } from '../../lib/printing'

/**
 * CobroPorConsumo — divide la cuenta de una mesa por lo que consumió cada persona.
 *
 * El mozo arma N cuentas (Persona 1, 2, 3…), asigna cada ítem del pedido a una
 * cuenta (o lo reparte en partes iguales entre varias, para lo compartido), y el
 * sistema calcula el subtotal exacto de cada uno. El descuento del pedido se
 * prorratea proporcional al consumo. Cada cuenta elige su medio de pago.
 *
 * Es controlado: el padre tiene `cuentas` y `asignacion` (estado) y recibe el
 * resultado calculado vía `onChange(computed, valido)`.
 *
 * Modelo de asignación:
 *   asignacion[itemId] = { tipo: 'una' | 'repartir', cuentas: [cuentaKey, ...] }
 *   - 'una'      → el ítem entero va a UNA cuenta.
 *   - 'repartir' → el monto del ítem se divide en partes iguales entre las cuentas.
 *   Sin entrada = sin asignar (inválido hasta asignarlo).
 */

export const MEDIOS = [
  { id: 'efectivo',        label: 'Efectivo',  icon: Banknote,   color: '#34d399' },
  { id: 'tarjeta_credito', label: 'Crédito',   icon: CreditCard, color: '#f59e0b' },
  { id: 'tarjeta_debito',  label: 'Débito',    icon: CreditCard, color: '#a78bfa' },
  { id: 'transferencia',   label: 'Transf.',   icon: Send,       color: '#60a5fa' },
]
const TARJETAS = new Set(['tarjeta_credito', 'tarjeta_debito'])
const medioLabelDe = (id) => MEDIOS.find(m => m.id === id)?.label || id

export function nuevaCuenta(n) {
  return { _key: Math.random().toString(36).slice(2, 9), label: `Persona ${n}`, medio: 'efectivo', nroOp: '' }
}

const lineTotalDe = (it) => Number(it.precio_unitario || 0) * Number(it.cantidad || 0)

/** Ítems que todavía no están asignados a ninguna cuenta. */
export function itemsSinAsignar(items, asignacion) {
  return (items || []).filter(it => {
    const a = asignacion[it.id]
    return !a || !a.cuentas || a.cuentas.length === 0
  })
}

/**
 * Calcula el reparto. Devuelve las cuentas con { subtotal, descuento, total,
 * items[], medioLabel } y prorratea el descuento del pedido. Ajusta el redondeo
 * para que la suma de los totales sea exactamente `total`.
 */
export function computeCuentas(items, cuentas, asignacion, { subtotal, descuentoMonto, total }) {
  const base = cuentas.map(c => ({ ...c, subtotal: 0, items: [], medioLabel: medioLabelDe(c.medio) }))
  const byKey = Object.fromEntries(base.map(c => [c._key, c]))

  for (const it of items || []) {
    const a = asignacion[it.id]
    if (!a || !a.cuentas || a.cuentas.length === 0) continue
    const lt = lineTotalDe(it)
    if (a.tipo === 'repartir' && a.cuentas.length > 1) {
      const share = lt / a.cuentas.length
      a.cuentas.forEach(k => {
        const c = byKey[k]; if (!c) return
        c.subtotal += share
        c.items.push({ nombre: it.nombre, cantidad: it.cantidad, monto: share, compartido: true })
      })
    } else {
      const c = byKey[a.cuentas[0]]; if (!c) continue
      c.subtotal += lt
      c.items.push({ nombre: it.nombre, cantidad: it.cantidad, monto: lt, compartido: false })
    }
  }

  // Prorrateo del descuento proporcional al subtotal de cada cuenta.
  const sub = Number(subtotal || 0)
  const desc = Number(descuentoMonto || 0)
  base.forEach(c => {
    c.descuento = sub > 0 ? (desc * c.subtotal) / sub : 0
    c.total = Math.round(c.subtotal - c.descuento)
  })

  // Ajuste de redondeo: que la suma de los totales sea exactamente `total`.
  const objetivo = Math.round(Number(total || 0))
  const suma = base.reduce((a, c) => a + c.total, 0)
  const dif = objetivo - suma
  if (dif !== 0 && base.length > 0) {
    // Lo aplicamos a la cuenta de mayor total (la que menos se nota).
    const idx = base.reduce((best, c, i, arr) => (c.total > arr[best].total ? i : best), 0)
    base[idx].total += dif
  }

  return base
}

/** Valida: todo asignado, cada cuenta con medio (y nro op si es tarjeta), suma == total. */
export function cuentasValidas(computed, items, asignacion, total) {
  if (!computed || computed.length === 0) return false
  if (itemsSinAsignar(items, asignacion).length > 0) return false
  for (const c of computed) {
    if (c.total <= 0) return false
    if (!c.medio) return false
    if (TARJETAS.has(c.medio) && !String(c.nroOp || '').trim()) return false
  }
  const suma = computed.reduce((a, c) => a + c.total, 0)
  return Math.abs(suma - Math.round(Number(total || 0))) <= 1
}

/** Líneas para registrarPago: una por cuenta, con sus notas (persona + ítems). */
export function cuentasAPagos(computed) {
  return computed.map(c => ({
    medio_pago: c.medio,
    monto: c.total,
    numero_operacion: TARJETAS.has(c.medio) ? String(c.nroOp || '').trim() : null,
    notas: `${c.label}: ${c.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}`,
  }))
}

/** Estructura para el desglose del ticket. */
export function desgloseFromCuentas(computed) {
  return computed.map(c => ({
    label: c.label,
    total: c.total,
    medioLabel: c.medioLabel,
    items: c.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, monto: i.monto, compartido: i.compartido })),
  }))
}

// ── UI ──────────────────────────────────────────────────────────────────────

export default function CobroPorConsumo({
  items, subtotal, descuentoMonto, total,
  cuentas, setCuentas, asignacion, setAsignacion,
  onChange,
}) {
  const computed = useMemo(
    () => computeCuentas(items, cuentas, asignacion, { subtotal, descuentoMonto, total }),
    [items, cuentas, asignacion, subtotal, descuentoMonto, total],
  )
  const sinAsignar = useMemo(() => itemsSinAsignar(items, asignacion), [items, asignacion])
  const valido = useMemo(
    () => cuentasValidas(computed, items, asignacion, total),
    [computed, items, asignacion, total],
  )

  useEffect(() => { onChange?.(computed, valido) }, [computed, valido, onChange])

  // ── Cuentas ──
  const addCuenta = () => setCuentas(prev => [...prev, nuevaCuenta(prev.length + 1)])
  const removeCuenta = () => setCuentas(prev => {
    if (prev.length <= 1) return prev
    const quitada = prev[prev.length - 1]._key
    // Saca esa cuenta de toda asignación.
    setAsignacion(asg => {
      const next = {}
      for (const [itemId, a] of Object.entries(asg)) {
        const filt = (a.cuentas || []).filter(k => k !== quitada)
        if (filt.length > 0) next[itemId] = { ...a, cuentas: filt }
      }
      return next
    })
    return prev.slice(0, -1)
  })
  const updateCuenta = (key, patch) =>
    setCuentas(prev => prev.map(c => (c._key === key ? { ...c, ...patch } : c)))

  // ── Asignación de un ítem ──
  // Click en una cuenta para un ítem:
  //  - modo normal (una): selecciona esa cuenta como única dueña.
  //  - modo compartir (repartir): agrega/saca esa cuenta del reparto.
  const toggleAsignacion = (itemId, cuentaKey) => {
    setAsignacion(prev => {
      const a = prev[itemId]
      const compartiendo = a?.tipo === 'repartir'
      if (compartiendo) {
        const set = new Set(a.cuentas || [])
        if (set.has(cuentaKey)) set.delete(cuentaKey); else set.add(cuentaKey)
        const arr = [...set]
        if (arr.length === 0) { const { [itemId]: _d, ...rest } = prev; return rest }
        return { ...prev, [itemId]: { tipo: 'repartir', cuentas: arr } }
      }
      // modo 'una': si toca la misma, la deselecciona.
      if (a?.tipo === 'una' && a.cuentas?.[0] === cuentaKey) {
        const { [itemId]: _d, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: { tipo: 'una', cuentas: [cuentaKey] } }
    })
  }

  const toggleCompartir = (itemId) => {
    setAsignacion(prev => {
      const a = prev[itemId]
      if (a?.tipo === 'repartir') {
        // Volver a 'una': dejamos la primera cuenta seleccionada (o nada).
        if (a.cuentas?.length) return { ...prev, [itemId]: { tipo: 'una', cuentas: [a.cuentas[0]] } }
        const { [itemId]: _d, ...rest } = prev; return rest
      }
      // Pasar a 'repartir': mantenemos lo que hubiera.
      return { ...prev, [itemId]: { tipo: 'repartir', cuentas: a?.cuentas || [] } }
    })
  }

  // Atajo: repartir un ítem entre TODAS las cuentas.
  const repartirEntreTodos = (itemId) =>
    setAsignacion(prev => ({ ...prev, [itemId]: { tipo: 'repartir', cuentas: cuentas.map(c => c._key) } }))

  const cuentaIndex = Object.fromEntries(cuentas.map((c, i) => [c._key, i + 1]))

  return (
    <div className="space-y-3">
      {/* Encabezado de cuentas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <Users size={13} /> {cuentas.length} {cuentas.length === 1 ? 'cuenta' : 'cuentas'}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={removeCuenta} disabled={cuentas.length <= 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <Minus size={13} />
          </button>
          <button type="button" onClick={addCuenta}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Lista de ítems con su asignación */}
      <div className="space-y-2">
        {(items || []).map(it => {
          const a = asignacion[it.id]
          const compartiendo = a?.tipo === 'repartir'
          const seleccionadas = new Set(a?.cuentas || [])
          const asignado = seleccionadas.size > 0
          return (
            <div key={it.id} className="rounded-lg p-2.5 space-y-2"
              style={{ background: 'var(--bg-input)', border: `1px solid ${asignado ? 'var(--border)' : 'rgba(245,158,11,0.4)'}` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {it.cantidad}x {it.nombre}
                </span>
                <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                  ${formatMoney(lineTotalDe(it))}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {cuentas.map((c, i) => {
                  const sel = seleccionadas.has(c._key)
                  return (
                    <button key={c._key} type="button" onClick={() => toggleAsignacion(it.id, c._key)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                      style={sel
                        ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                        : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      P{i + 1}
                    </button>
                  )
                })}
                <button type="button" onClick={() => toggleCompartir(it.id)}
                  title="Repartir este ítem en partes iguales"
                  className="px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  style={compartiendo
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                    : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  <Split size={11} /> {compartiendo ? 'Compartido' : 'Compartir'}
                </button>
                {compartiendo && (
                  <button type="button" onClick={() => repartirEntreTodos(it.id)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium"
                    style={{ background: 'var(--bg-card)', color: 'var(--accent-lift)', border: '1px solid var(--border)' }}>
                    Entre todos
                  </button>
                )}
              </div>
              {compartiendo && seleccionadas.size > 1 && (
                <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                  Se reparte en {seleccionadas.size} → ${formatMoney(lineTotalDe(it) / seleccionadas.size)} c/u
                </p>
              )}
            </div>
          )
        })}
      </div>

      {sinAsignar.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-[11px] flex items-center gap-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
          Falta asignar {sinAsignar.length} {sinAsignar.length === 1 ? 'ítem' : 'ítems'}: {sinAsignar.map(i => i.nombre).join(', ')}
        </div>
      )}

      {/* Resumen por cuenta + medio de pago */}
      <div className="space-y-2 pt-1">
        {computed.map((c, i) => (
          <div key={c._key} className="rounded-lg p-2.5 space-y-2"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                P{i + 1} · {c.label}
              </span>
              <span className="text-sm font-bold" style={{ color: 'var(--accent-lift)' }}>
                ${formatMoney(c.total)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {MEDIOS.map(m => {
                const active = c.medio === m.id
                const Icon = m.icon
                return (
                  <button key={m.id} type="button" onClick={() => updateCuenta(c._key, { medio: m.id })}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors"
                    style={active
                      ? { background: 'var(--accent-soft)', border: `1px solid ${m.color}`, color: m.color }
                      : { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Icon size={11} style={{ color: m.color }} /> {m.label}
                  </button>
                )
              })}
            </div>
            {TARJETAS.has(c.medio) && (
              <input inputMode="numeric" value={c.nroOp || ''}
                onChange={e => updateCuenta(c._key, { nroOp: e.target.value })}
                placeholder="Nro. operación (posnet)"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Validación total */}
      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          Suma ${formatMoney(computed.reduce((a, c) => a + c.total, 0))} de ${formatMoney(Math.round(Number(total || 0)))}
        </span>
        <span className="font-bold" style={{ color: valido ? '#34d399' : '#f59e0b' }}>
          {valido ? 'OK' : 'Revisá la división'}
        </span>
      </div>
    </div>
  )
}
