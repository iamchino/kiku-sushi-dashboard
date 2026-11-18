import { useMemo, useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { ModalShell, Field } from './fields'
import { editarPago } from '../../lib/pagos'
import { fmtFecha, fmtPlata, localDateISO } from '../../lib/finanzas'
import { compararConResumen, fechaDelCargo, pagoDelResumen, resumenTarjeta, textoCompras, validarFechaPago } from '../../lib/tarjeta'

// "Pagar el resumen" de la tarjeta de crédito: se tilda lo que vino en el
// resumen y se marcan todos pagados juntos, con la fecha en que se pagó la
// tarjeta. Cada uno pasa por editar_pago() (queda en su historial, con el
// motivo). Si alguno falla, los demás quedan pagados y se dice cuál faltó.

export default function PagarResumenModal({ items, onClose, onPagado }) {
  const hoy = localDateISO()
  const [tildados, setTildados] = useState(() => new Set(items.map(e => e.id)))
  const [fecha, setFecha] = useState(hoy)
  const [totalResumen, setTotalResumen] = useState('')
  const [busy, setBusy] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState(null)

  const elegidos = useMemo(() => items.filter(e => tildados.has(e.id)), [items, tildados])
  const res = resumenTarjeta(elegidos)
  const comparacion = compararConResumen(res.total, totalResumen)
  const errorFecha = validarFechaPago(fecha, hoy)

  const alternar = (id) => setTildados(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const todos = tildados.size === items.length

  const pagar = async () => {
    if (errorFecha) { setError(errorFecha); return }
    setBusy(true); setError(null); setProgreso(0)
    const fallaron = []
    let hechos = 0
    for (const e of elegidos) {
      try {
        await editarPago(e, pagoDelResumen(e, fecha), 'Pago del resumen de la tarjeta')
        hechos += 1
      } catch (err) {
        fallaron.push(`${e.descripcion}: ${err.message}`)
      }
      setProgreso(p => p + 1)
    }
    if (fallaron.length === 0) {
      onPagado(`Listo: ${hechos === 1 ? 'quedó pagado 1 gasto' : `quedaron pagados ${hechos} gastos`} del resumen de la tarjeta, el ${fmtFecha(fecha)}, por ${fmtPlata(res.total)}. Desde ahí cuentan en «Salió» y en el cash flow.`)
      onClose()
      return
    }
    setBusy(false)
    setError(`Se marcaron ${hechos} de ${elegidos.length}. No se pudieron marcar: ${fallaron.join(' · ')}`)
    if (hechos > 0) onPagado(null)
  }

  return (
    <ModalShell title="Pagar el resumen de la tarjeta" icon={CreditCard} onClose={busy ? () => {} : onClose} maxW="max-w-lg">
      <div className="p-5 space-y-4" data-pagar-resumen>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Tildá lo que vino en este resumen. Se marcan como pagados con la fecha en que pagaste la tarjeta: desde ahí cuentan en «Salió» y en el cash flow.
          Los intereses o gastos del resumen cargalos antes como un pago pendiente más (Comisiones y financieros, con «Tarjeta crédito»), así aparecen acá.
        </p>

        <div className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            <input type="checkbox" checked={todos} disabled={busy}
              onChange={() => setTildados(todos ? new Set() : new Set(items.map(e => e.id)))} />
            {todos ? 'Destildar todo' : 'Tildar todo'}
          </label>
          <div className="max-h-64 overflow-y-auto">
            {items.map(e => (
              <label key={e.id} data-item-resumen={e.descripcion}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer"
                style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                <span className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={tildados.has(e.id)} disabled={busy} onChange={() => alternar(e.id)}
                    aria-label={`Incluir ${e.descripcion}`} />
                  <span className="min-w-0">
                    <span className="block truncate">{e.descripcion}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--text-xmuted)' }}>{fmtFecha(fechaDelCargo(e))}</span>
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{fmtPlata(e.monto)}</span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-sm" style={{ color: 'var(--text-secondary)' }} data-total-resumen>
          {textoCompras(res.cantidad)} {res.cantidad === 1 ? 'tildada' : 'tildadas'} · <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(res.total)}</strong>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha del pago" type="date" value={fecha} onChange={(x) => { setFecha(x); setError(null) }} />
          <Field label="Total del resumen (opcional)" value={totalResumen} onChange={setTotalResumen} inputMode="decimal"
            placeholder="Para comparar" />
        </div>
        {comparacion.texto && (
          <p className="text-[11px]" data-comparacion={comparacion.estado}
            style={{ color: comparacion.estado === 'coincide' ? '#3FBF8A' : '#E8A23F' }}>
            {comparacion.texto}
          </p>
        )}

        {error && <p className="text-xs" style={{ color: '#F2708C' }} data-error-resumen>{error}</p>}
        <button onClick={pagar} disabled={busy || elegidos.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--cta)' }}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy
            ? `Marcando ${progreso} de ${elegidos.length}…`
            : elegidos.length === 0 ? 'Tildá al menos uno'
              : `Marcar ${elegidos.length === 1 ? '1 como pagado' : `${elegidos.length} como pagados`} (${fmtPlata(res.total)})`}
        </button>
      </div>
    </ModalShell>
  )
}
