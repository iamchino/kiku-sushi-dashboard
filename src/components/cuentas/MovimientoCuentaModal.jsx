import { useState } from 'react'
import { AlertTriangle, Loader2, ReceiptText } from 'lucide-react'
import { Field, ModalShell } from '../finanzas/fields'
import { fechaHoyAR } from '../../lib/fiscal'
import { formatMoney } from '../../lib/printing'
import { parseCurrencyValue } from '../../lib/orders'

// Consumo cargado a mano en una cuenta corriente: lo que se consumió antes de
// tener el sistema (el cuaderno), un consumo que no pasó por una mesa, o una
// devolución / corrección a favor. Los consumos que se cobran desde una mesa
// o un pedido NO pasan por acá: se cargan solos al cobrar.

const TIPOS = [
  { id: 'consumo',    label: 'Consumo',             hint: 'Baja el saldo' },
  { id: 'devolucion', label: 'Devolución a favor',  hint: 'Sube el saldo' },
]

export default function MovimientoCuentaModal({ cuenta, movimiento = null, onClose, onGuardar }) {
  const [form, setForm] = useState(() => ({
    tipo: movimiento && Number(movimiento.monto) < 0 ? 'devolucion' : 'consumo',
    fecha: movimiento?.fecha || fechaHoyAR(),
    monto: movimiento ? String(Math.abs(Number(movimiento.monto || 0))) : '',
    detalle: movimiento?.detalle || '',
    numero_operacion: movimiento?.numero_operacion || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo) => (valor) => setForm(prev => ({ ...prev, [campo]: valor }))

  const valor = Math.abs(parseCurrencyValue(form.monto))
  const firmado = form.tipo === 'devolucion' ? -valor : valor
  // Saldo que queda: el actual, sin el movimiento que se está editando, menos el nuevo.
  const saldoBase = Number(cuenta?.saldo || 0) + Number(movimiento?.monto || 0)
  const saldoDespues = saldoBase - firmado

  const guardar = async () => {
    if (!form.fecha) { setError('Elegí la fecha del consumo.'); return }
    if (!(valor > 0)) { setError('Ingresá un monto mayor a cero.'); return }
    setSaving(true); setError(null)
    try {
      await onGuardar(cuenta.id, form, movimiento?.id || null)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <ModalShell title={`${movimiento ? 'Editar' : 'Agregar'} consumo · ${cuenta?.nombre || ''}`} icon={ReceiptText}
      onClose={saving ? () => {} : onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {TIPOS.map(t => {
            const activo = form.tipo === t.id
            return (
              <button key={t.id} type="button" onClick={() => set('tipo')(t.id)}
                className="rounded-lg px-3 py-2 text-left transition-colors"
                style={activo
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold">{t.label}</p>
                <p className="text-[10px] mt-0.5 opacity-80">{t.hint}</p>
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" type="date" value={form.fecha} onChange={set('fecha')} required />
          <Field label="Monto ($)" value={form.monto} onChange={set('monto')}
            placeholder="117700" inputMode="decimal" required />
        </div>
        <Field label="Detalle" value={form.detalle} onChange={set('detalle')}
          placeholder="Ej: Cena 4 personas, canje de octubre" maxLength={160} />
        <Field label="Nro. de operación / voucher" value={form.numero_operacion} onChange={set('numero_operacion')}
          placeholder="Ej: V-0012" maxLength={40} />

        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Saldo después de guardar</span>
          <span className="font-bold" style={{ color: saldoDespues < -1 ? 'var(--bad)' : 'var(--ok)' }}>
            {saldoDespues < 0 ? '-' : ''}${formatMoney(Math.abs(saldoDespues))}
          </span>
        </div>
        {saldoDespues < -1 && (
          <p className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--warn)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            Supera lo acordado: la cuenta va a quedar excedida. Se puede guardar igual.
          </p>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 btn-cta"
            style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {movimiento ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
