import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Loader2 } from 'lucide-react'
import { Field, ModalShell, Select } from '../fields'
import { fmtPlata, labelMes, listaMeses, serieEstimados, sumarMeses } from '../../../lib/cashflow'
import { parseCurrencyValue } from '../../../lib/orders'

// Completa una fila del cash flow para varios meses de una: un monto base y,
// si hace falta, un aumento mensual (inflación, crecimiento). Es lo que en la
// planilla se hace arrastrando la fórmula hacia la derecha.

export default function EstimarFilaModal({ concepto, label, mesActual, hastaSugerido, promedioReal, onClose, onGuardar }) {
  const meses = useMemo(() => listaMeses(mesActual, 18), [mesActual])
  const [desde, setDesde] = useState(mesActual)
  const [hasta, setHasta] = useState(() => (meses.includes(hastaSugerido) ? hastaSugerido : sumarMeses(mesActual, 5)))
  const [monto, setMonto] = useState('')
  const [aumento, setAumento] = useState('0')
  const [saving, setSaving] = useState(null)   // 'guardar' | 'borrar'
  const [error, setError] = useState(null)

  const serie = useMemo(() => {
    if (String(monto).trim() === '') return []
    return serieEstimados({
      concepto, desde, hasta,
      monto: Math.max(0, parseCurrencyValue(monto)),
      aumentoPct: Number(String(aumento).replace(',', '.')) || 0,
    })
  }, [concepto, desde, hasta, monto, aumento])

  const rangoOk = hasta >= desde
  const opciones = meses.map(m => ({ value: m, label: labelMes(m, { largo: true }) }))

  const correr = async (accion) => {
    if (!rangoOk) { setError('El mes "hasta" no puede ser anterior al "desde".'); return }
    if (accion === 'guardar' && serie.length === 0) { setError('Escribí el monto del primer mes.'); return }
    setSaving(accion); setError(null)
    try {
      const items = accion === 'guardar'
        ? serie
        : serieEstimados({ concepto, desde, hasta, monto: 0 }).map(i => ({ ...i, monto: null }))
      await onGuardar(items)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setSaving(null)
    }
  }

  return (
    <ModalShell title={`Estimar varios meses · ${label}`} icon={CalendarRange} onClose={saving ? () => {} : onClose} maxW="max-w-md">
      <div className="p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Desde" value={desde} onChange={setDesde} options={opciones} />
          <Select label="Hasta" value={hasta} onChange={setHasta} options={opciones} />
          <div>
            <Field label="Monto del primer mes ($)" value={monto} onChange={setMonto} placeholder="5500000" inputMode="numeric" required />
            {promedioReal ? (
              <button type="button" onClick={() => setMonto(String(promedioReal))}
                className="mt-1 text-left text-[11px] underline decoration-dotted" style={{ color: 'var(--accent-lift)' }}>
                Usar el promedio real de los últimos meses: {fmtPlata(promedioReal)}
              </button>
            ) : null}
          </div>
          <div>
            <Field label="Aumento por mes (%)" value={aumento} onChange={setAumento} placeholder="0" inputMode="decimal" />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>0 = el mismo monto todos los meses.</p>
          </div>
        </div>

        {serie.length > 0 && rangoOk && (
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Así queda ({serie.length} {serie.length === 1 ? 'mes' : 'meses'})
            </p>
            <div className="grid max-h-40 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto text-xs sm:grid-cols-2">
              {serie.map(s => (
                <div key={s.mes} className="flex items-baseline justify-between gap-2">
                  <span className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{labelMes(s.mes)}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtPlata(s.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] leading-4" style={{ color: 'var(--text-xmuted)' }}>
          Pisa los estimados que ya tenga esta fila en esos meses. Los pagos reales no se tocan.
        </p>

        {error && (
          <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button type="button" onClick={() => correr('borrar')} disabled={Boolean(saving)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--bad)' }}>
            {saving === 'borrar' && <Loader2 size={13} className="animate-spin" />} Borrar estimados del rango
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={Boolean(saving)}
              className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="button" onClick={() => correr('guardar')} disabled={Boolean(saving)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 btn-cta"
              style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
              {saving === 'guardar' && <Loader2 size={14} className="animate-spin" />} Guardar
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
