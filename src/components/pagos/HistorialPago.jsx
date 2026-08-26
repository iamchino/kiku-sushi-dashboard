import { useEffect, useState } from 'react'
import { History, Loader2, ArrowRight } from 'lucide-react'
import { historialDePago, EVENTO_PAGO, cambiosDePago, valorPago } from '../../lib/pagos'
import { fmtMoney } from '../../lib/finanzas'

// Historial de un pago: cuándo se registró, cada corrección con el antes y el
// después de cada campo, y la anulación con su motivo. Se lee de
// `egresos_auditoria`, que llena un trigger de la base — así queda registrado
// venga el cambio de donde venga, y no se puede maquillar desde la pantalla.

function fechaHora(ts) {
  return new Date(ts).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function HistorialPago({ pagoId }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    historialDePago(pagoId).then(res => {
      if (!vivo) return
      setFilas(res)
      setCargando(false)
    })
    return () => { vivo = false }
  }, [pagoId])

  if (cargando) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
        <Loader2 size={11} className="animate-spin" /> Buscando el historial…
      </p>
    )
  }

  if (filas.length === 0) {
    return (
      <p className="py-2 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
        Este pago todavía no tiene historial. Se empieza a registrar desde que se
        instala el historial en la base; los cambios anteriores no quedaron guardados.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}>
        <History size={11} /> Historial del pago
      </p>
      {filas.map(fila => {
        const meta = EVENTO_PAGO[fila.evento] || EVENTO_PAGO.editado
        const cambios = cambiosDePago(fila)
        const alta = fila.detalle?.nuevo
        const baja = fila.detalle?.anterior
        return (
          <div key={fila.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-xmuted)' }}>
                {fechaHora(fila.created_at)}
              </span>
            </div>

            {fila.motivo && (
              <p className="mt-0.5 text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>
                “{fila.motivo}”
              </p>
            )}

            {fila.evento === 'creado' && alta && (
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {alta.descripcion} · {fmtMoney(alta.monto)}
              </p>
            )}

            {fila.evento === 'anulado' && baja && (
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {baja.descripcion} · {fmtMoney(baja.monto)}
                {baja.pagado_desde ? ` · la plata volvió a ${valorPago('pagado_desde', baja.pagado_desde)}` : ''}
              </p>
            )}

            {cambios.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {cambios.map(c => (
                  <p key={c.campo} className="flex flex-wrap items-center gap-1 text-[11px]"
                    style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{c.label}:</span>
                    <span className="line-through" style={{ color: 'var(--text-xmuted)' }}>{c.antes}</span>
                    <ArrowRight size={9} style={{ color: 'var(--text-xmuted)' }} />
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.despues}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
