import { useState } from 'react'
import { AlertTriangle, Handshake, Loader2 } from 'lucide-react'
import { Field, ModalShell, Select, TextArea } from '../finanzas/fields'
import { COND_IVA_RECEPTOR_LABEL, CONDICIONES_FACTURA_A, validateCuit } from '../../lib/fiscal'
import { parseCurrencyValue } from '../../lib/orders'

// Alta / edición de una cuenta corriente (canje): cuánto se acordó, hasta
// cuándo vale y —opcional— los datos fiscales para poder hacerle Factura A
// cuando consume.

const OPCIONES_IVA = [
  { value: '', label: 'Sin datos fiscales' },
  ...CONDICIONES_FACTURA_A.map(id => ({ value: String(id), label: COND_IVA_RECEPTOR_LABEL[id] })),
]

function formInicial(cuenta) {
  return {
    nombre: cuenta?.nombre || '',
    monto_acordado: cuenta ? String(Math.round(Number(cuenta.monto_acordado || 0))) : '',
    vigencia_desde: cuenta?.vigencia_desde || '',
    vigencia_hasta: cuenta?.vigencia_hasta || '',
    notas: cuenta?.notas || '',
    razon_social: cuenta?.razon_social || '',
    cuit: cuenta?.cuit || '',
    condicion_iva: cuenta?.condicion_iva ? String(cuenta.condicion_iva) : '',
    domicilio: cuenta?.domicilio || '',
    activa: cuenta ? cuenta.activa !== false : true,
  }
}

export default function CuentaCorrienteModal({ cuenta = null, onClose, onGuardar }) {
  const [form, setForm] = useState(() => formInicial(cuenta))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo) => (valor) => setForm(prev => ({ ...prev, [campo]: valor }))

  const cuitDigits = String(form.cuit || '').replace(/\D/g, '')
  const hayFiscales = Boolean(cuitDigits || form.razon_social.trim() || form.condicion_iva)
  const consumido = Number(cuenta?.consumido || 0)
  const acordado = parseCurrencyValue(form.monto_acordado)

  const validar = () => {
    if (!form.nombre.trim()) return 'Poné un nombre para la cuenta (ej: Revista Punto Biz).'
    if (!(acordado >= 0) || String(form.monto_acordado).trim() === '') return 'Ingresá el monto acordado.'
    if (form.vigencia_desde && form.vigencia_hasta && form.vigencia_hasta < form.vigencia_desde) {
      return 'La vigencia "hasta" no puede ser anterior a "desde".'
    }
    if (hayFiscales) {
      if (!validateCuit(cuitDigits)) return 'El CUIT no es válido. Revisalo (11 números) o dejá vacíos los datos fiscales.'
      if (!form.razon_social.trim()) return 'Falta la razón social (o dejá vacíos los datos fiscales).'
      if (!form.condicion_iva) return 'Elegí la condición frente al IVA (o dejá vacíos los datos fiscales).'
    }
    return null
  }

  const guardar = async () => {
    const problema = validar()
    if (problema) { setError(problema); return }
    setSaving(true); setError(null)
    try {
      await onGuardar({ ...form, cuit: cuitDigits }, cuenta?.id || null)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la cuenta.')
      setSaving(false)
    }
  }

  return (
    <ModalShell title={cuenta ? 'Editar cuenta corriente' : 'Nueva cuenta corriente'} icon={Handshake}
      onClose={saving ? () => {} : onClose} maxW="max-w-xl">
      <div className="p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nombre de la cuenta" value={form.nombre} onChange={set('nombre')}
              placeholder="Ej: Revista Punto Biz" maxLength={80} required />
          </div>
          <Field label="Monto acordado ($)" value={form.monto_acordado} onChange={set('monto_acordado')}
            placeholder="500000" inputMode="decimal" required />
          <div className="self-end pb-2 text-[11px] leading-4" style={{ color: 'var(--text-xmuted)' }}>
            Lo que puede consumir en total. Si el acuerdo se renueva o se amplía, se cambia acá.
          </div>
          <Field label="Vigente desde (opcional)" type="date" value={form.vigencia_desde} onChange={set('vigencia_desde')} />
          <Field label="Vigente hasta (opcional)" type="date" value={form.vigencia_hasta} onChange={set('vigencia_hasta')} />
        </div>

        {cuenta && acordado < consumido && (
          <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            Ya lleva consumido más que ese monto: la cuenta va a figurar excedida.
          </p>
        )}

        <TextArea label="Notas del acuerdo" value={form.notas} onChange={set('notas')} rows={3}
          placeholder="Qué se canjea, con quién se habló, condiciones (ej: 2 páginas por año a cambio de consumo)…" />

        <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Datos fiscales (opcional)</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Con estos datos, al cobrarle un consumo la Factura A sale precargada a su nombre.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Razón social" value={form.razon_social} onChange={set('razon_social')}
                placeholder="Empresa SA" maxLength={120} />
            </div>
            <Field label="CUIT" value={form.cuit} onChange={v => set('cuit')(v.replace(/[^\d-]/g, ''))}
              placeholder="30712345678" inputMode="numeric" maxLength={13} />
            <Select label="Condición frente al IVA" value={form.condicion_iva} onChange={set('condicion_iva')}
              options={OPCIONES_IVA} />
            <div className="sm:col-span-2">
              <Field label="Domicilio" value={form.domicilio} onChange={set('domicilio')}
                placeholder="Calle 123, Rosario" maxLength={160} />
            </div>
          </div>
        </div>

        {cuenta && (
          <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.activa} onChange={e => set('activa')(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]" />
            <span>
              Cuenta activa
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Desactivada no se ofrece al cobrar; el historial queda.
              </span>
            </span>
          </label>
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
            {cuenta ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
