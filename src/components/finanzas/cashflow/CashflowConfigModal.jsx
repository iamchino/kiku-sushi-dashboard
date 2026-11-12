import { useState } from 'react'
import { AlertTriangle, Loader2, PiggyBank } from 'lucide-react'
import { Field, ModalShell, Select } from '../fields'
import { labelMes, listaMeses, mesDe, sumarMeses } from '../../../lib/cashflow'
import { parseCurrencyValue } from '../../../lib/orders'

// Saldo inicial y colchón de seguridad del cash flow. El dashboard no conoce
// los saldos de las cuentas del banco: el punto de partida lo carga
// administración una vez, y desde ahí el saldo de cada mes se arrastra solo.

export default function CashflowConfigModal({ config, mesActual, onClose, onGuardar }) {
  const [form, setForm] = useState(() => ({
    saldo_inicial: config ? String(Math.round(Number(config.saldo_inicial || 0))) : '',
    saldo_desde: config?.saldo_desde ? mesDe(config.saldo_desde) : mesActual,
    saldo_minimo: config ? String(Math.round(Number(config.saldo_minimo || 0))) : '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo) => (valor) => setForm(prev => ({ ...prev, [campo]: valor }))

  // Desde un año atrás hasta seis meses adelante.
  const meses = listaMeses(sumarMeses(mesActual, -12), 19)
  if (!meses.includes(form.saldo_desde)) meses.unshift(form.saldo_desde)

  const guardar = async () => {
    setSaving(true); setError(null)
    try {
      await onGuardar({
        saldo_inicial: parseCurrencyValue(form.saldo_inicial),
        saldo_desde: form.saldo_desde,
        saldo_minimo: Math.max(0, parseCurrencyValue(form.saldo_minimo)),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Saldo y alertas" icon={PiggyBank} onClose={saving ? () => {} : onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <p className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
          Con cuánta plata arrancan (caja, caja fuerte y bancos sumados) al empezar un mes. Desde ahí la
          tabla va sumando y restando el flujo de cada mes para mostrar el saldo final.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Saldo inicial ($)" value={form.saldo_inicial} onChange={set('saldo_inicial')}
            placeholder="2800000" inputMode="text" />
          <Select label="Al empezar el mes de" value={form.saldo_desde} onChange={set('saldo_desde')}
            options={meses.map(m => ({ value: m, label: labelMes(m, { largo: true }) }))} />
        </div>
        <p className="-mt-2 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Si arrancan debiendo, poné el saldo con un menos adelante (ej: -150000).
        </p>
        <Field label="Saldo mínimo de seguridad ($)" value={form.saldo_minimo} onChange={set('saldo_minimo')}
          placeholder="500000" inputMode="numeric" />
        <p className="-mt-2 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Si el saldo final de un mes queda por debajo, ese mes se marca “BAJO MÍNIMO”. Si queda bajo cero, “NEGATIVO”.
        </p>

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
            {saving && <Loader2 size={14} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
