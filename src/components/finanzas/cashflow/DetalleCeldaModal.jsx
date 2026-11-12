import { useEffect, useState } from 'react'
import { AlertTriangle, ListChecks, Loader2 } from 'lucide-react'
import { ModalShell } from '../fields'
import { fmtPlata, labelMes } from '../../../lib/cashflow'
import { cargarDetalleCelda } from '../../../lib/cashflowApi'
import { catLabel, fmtFecha } from '../../../lib/finanzas'

// Qué hay adentro de una celda de egresos: los pagos ya hechos en ese mes y
// los pendientes cargados que vencen en él. Solo lectura: los pagos se cargan
// y corrigen desde Caja → Pagos y desde Proyección de pagos.

function Lista({ titulo, items, campoFecha, vacio }) {
  const total = items.reduce((a, e) => a + Number(e.monto || 0), 0)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {titulo} ({items.length})
        </p>
        <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtPlata(total)}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg px-3 py-3 text-xs" style={{ background: 'var(--bg-input)', color: 'var(--text-xmuted)' }}>{vacio}</p>
      ) : (
        <div className="divide-y rounded-lg" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
          {items.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate" style={{ color: 'var(--text-primary)' }}>
                  {e.descripcion}
                  {e.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {e.proveedor.razon_social}</span>}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {catLabel(e.categoria)} · {e[campoFecha] ? fmtFecha(e[campoFecha]) : 'sin fecha'}
                </p>
              </div>
              <span className="flex-shrink-0 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtPlata(e.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DetalleCeldaModal({ grupo, mes, celda, esMesEnCurso, onClose }) {
  const [estado, setEstado] = useState({ loading: true, error: null, pagados: [], pendientes: [] })

  useEffect(() => {
    let vivo = true
    cargarDetalleCelda({ categorias: grupo.categorias, mes, esMesEnCurso })
      .then(r => { if (vivo) setEstado({ loading: false, error: null, ...r }) })
      .catch(err => { if (vivo) setEstado({ loading: false, error: err.message, pagados: [], pendientes: [] }) })
    return () => { vivo = false }
  }, [grupo, mes, esMesEnCurso])

  return (
    <ModalShell title={`${grupo.label} · ${labelMes(mes, { largo: true })}`} icon={ListChecks} onClose={onClose} maxW="max-w-lg">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-lg p-3 text-xs" style={{ background: 'var(--bg-input)' }}>
          {[
            ['Estimado', celda.estimado === null ? '—' : fmtPlata(celda.estimado)],
            ['Pagado', fmtPlata(celda.real)],
            ['A pagar (cargado)', fmtPlata(celda.pendiente)],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>{l}</p>
              <p className="mt-0.5 font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{v}</p>
            </div>
          ))}
        </div>

        {estado.error && (
          <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)', color: 'var(--bad)' }}>
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {estado.error}
          </p>
        )}

        {estado.loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
          </div>
        ) : (
          <>
            <Lista titulo="Pagado" items={estado.pagados} campoFecha="fecha" vacio="Sin pagos registrados en este mes." />
            <Lista titulo="A pagar" items={estado.pendientes} campoFecha="vencimiento"
              vacio="Sin pagos pendientes cargados para este mes." />
          </>
        )}

        <p className="text-[11px] leading-4" style={{ color: 'var(--text-xmuted)' }}>
          Incluye: {grupo.categorias.map(catLabel).join(', ')}. Los pagos se cargan desde Caja → Pagos; los
          pendientes, desde Proyección de pagos.
        </p>
      </div>
    </ModalShell>
  )
}
