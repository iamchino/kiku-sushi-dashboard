import { useMemo, useState } from 'react'
import {
  Landmark, ArrowDownLeft, ArrowUpRight, SlidersHorizontal, AlertTriangle,
} from 'lucide-react'
import { useCajaFuerte } from '../../hooks/useCajaFuerte'
import { fmtMoney, fmtFecha } from '../../lib/finanzas'

// Historial de la caja fuerte para la foto del negocio: cuánto hay guardado
// hoy, cuánto entró y salió en el período, y el detalle de cada movimiento.
// Solo lectura: los retiros y ajustes se hacen en Caja → Caja fuerte.

const META = {
  deposito: { label: 'Entró',  color: '#10b981', icon: ArrowDownLeft,      signo: +1 },
  egreso:   { label: 'Salió',  color: '#f87171', icon: ArrowUpRight,       signo: -1 },
  ajuste:   { label: 'Ajuste', color: '#f59e0b', icon: SlidersHorizontal,  signo: 0 },
}

// Un ajuste puede sumar (sobrante) o restar (faltante).
function signoDe(mov) {
  if (mov.tipo === 'ajuste') return mov.categoria === 'faltante' ? -1 : +1
  return META[mov.tipo]?.signo ?? 0
}

function tituloDe(mov) {
  if (mov.descripcion) return mov.descripcion
  if (mov.tipo === 'deposito') return 'Retiro de la caja a la caja fuerte'
  if (mov.tipo === 'egreso') return 'Pago desde la caja fuerte'
  return 'Ajuste'
}

export default function CajaFuerteResumen({ desde, hasta, label }) {
  const { movimientos, saldo, loading, error } = useCajaFuerte({ desde, hasta })
  const [verTodos, setVerTodos] = useState(false)

  const { entro, salio } = useMemo(() => {
    let entro = 0, salio = 0
    for (const m of movimientos) {
      const monto = Number(m.monto || 0)
      const signo = signoDe(m)
      if (signo > 0) entro += monto
      else if (signo < 0) salio += monto
    }
    return { entro, salio }
  }, [movimientos])

  const visibles = verTodos ? movimientos : movimientos.slice(0, 6)

  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark size={15} style={{ color: 'var(--accent-lift)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Caja fuerte</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Guardado hoy</p>
          <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {loading ? '—' : fmtMoney(saldo || 0)}
          </p>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 py-2 text-xs" style={{ color: '#f87171' }}>
          <AlertTriangle size={12} /> {error}
        </p>
      ) : loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-9 rounded-lg" />)}</div>
      ) : (
        <>
          {/* Entró / salió en el período: el movimiento, no solo el saldo */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)' }}>
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
                <ArrowDownLeft size={11} style={{ color: '#10b981' }} /> Entró · {label}
              </p>
              <p className="mt-0.5 text-sm font-bold" style={{ color: '#10b981' }}>{fmtMoney(entro)}</p>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-input)' }}>
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
                <ArrowUpRight size={11} style={{ color: '#f87171' }} /> Salió · {label}
              </p>
              <p className="mt-0.5 text-sm font-bold" style={{ color: '#f87171' }}>{fmtMoney(salio)}</p>
            </div>
          </div>

          {movimientos.length === 0 ? (
            <p className="py-4 text-center text-xs" style={{ color: 'var(--text-xmuted)' }}>
              Sin movimientos en el período
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-1.5">
                {visibles.map(m => {
                  const meta = META[m.tipo] || META.ajuste
                  const signo = signoDe(m)
                  const Icon = meta.icon
                  const color = signo > 0 ? '#10b981' : signo < 0 ? '#f87171' : meta.color
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                      style={{ background: 'var(--bg-input)' }}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${color}1f`, color }}>
                          <Icon size={13} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {tituloDe(m)}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                            {meta.label}
                            {m.tipo === 'ajuste' && m.categoria ? ` (${m.categoria})` : ''}
                            {' · '}
                            {new Date(m.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {m.turno?.business_date ? ` · caja del ${fmtFecha(m.turno.business_date)}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold tabular-nums" style={{ color }}>
                        {signo < 0 ? '−' : signo > 0 ? '+' : ''}{fmtMoney(m.monto)}
                      </span>
                    </div>
                  )
                })}
              </div>
              {movimientos.length > 6 && (
                <button onClick={() => setVerTodos(v => !v)}
                  className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold transition-colors"
                  style={{ color: 'var(--accent-lift)', border: '1px dashed var(--accent-border)' }}>
                  {verTodos ? 'Ver menos' : `Ver los ${movimientos.length} movimientos`}
                </button>
              )}
            </>
          )}

          <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Los retiros y ajustes se hacen en Caja y facturación → Caja fuerte
          </p>
        </>
      )}
    </div>
  )
}
