import { useState, useMemo } from 'react'
import { BadgeDollarSign, Lock, Trash2, Clock } from 'lucide-react'
import { useEgresos } from '../../hooks/useEgresos'
import { fmtMoney, MEDIOS_PAGO } from '../../lib/finanzas'
import { fmtMinutos } from '../../lib/horas'
import { ModalShell, Field, Select } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

const CHIP = {
  pagado:       { label: 'Pagada',       bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  pendiente:    { label: 'Pendiente',    bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  en_curso:     { label: 'En curso',     bg: 'var(--accent-soft)',    color: 'var(--accent-lift)' },
  sin_liquidar: { label: 'Sin liquidar', bg: 'var(--bg-active)',      color: 'var(--text-muted)' },
}

// Liquidación semanal (martes → lunes) con estados:
//   En curso (semana actual, live) → Cerrar semana → Pendiente → Pagar → Pagada
// Al pagar se crea el egreso en Finanzas (categoría sueldos) y se vincula.
export default function LiquidacionSection({ horas, enCurso }) {
  const { semana, resumen, liquidaciones, generarLiquidacion, actualizarLiquidacion, eliminarLiquidacion, loading } = horas
  const { crearEgreso } = useEgresos(semana.desde, semana.hasta)

  const [pagando, setPagando]     = useState(null)  // liq a pagar
  const [medioPago, setMedioPago] = useState('transferencia')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [delLiq, setDelLiq]       = useState(null)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState(null)

  const liqPorEmpleado = useMemo(
    () => new Map(liquidaciones.map(l => [l.empleado_id, l])),
    [liquidaciones],
  )

  // Filas visibles: todo empleado con horas en la semana o con liquidación.
  const filas = useMemo(() => {
    return resumen
      .filter(r => r.minutos > 0 || liqPorEmpleado.has(r.empleado_id))
      .map(r => {
        const liq = liqPorEmpleado.get(r.empleado_id) || null
        const estado = liq ? liq.estado : (enCurso ? 'en_curso' : 'sin_liquidar')
        return { ...r, liq, estado }
      })
  }, [resumen, liqPorEmpleado, enCurso])

  const totalSemana = filas.reduce((s, f) => s + Number(f.liq ? f.liq.total : f.total), 0)
  const hayPorHora = filas.some(f => f.tipo_sueldo === 'hora' && f.minutos > 0)
  const pendientes = filas.filter(f => f.estado === 'pendiente')

  const handleCerrar = async () => {
    setBusy(true); setError(null)
    try { await generarLiquidacion() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const handlePagar = async () => {
    if (!pagando) return
    setBusy(true); setError(null)
    try {
      const nombre = `${pagando.empleado?.nombre || ''} ${pagando.empleado?.apellido || ''}`.trim() || 'empleado'
      const egreso = await crearEgreso({
        fecha: fechaPago,
        categoria: 'sueldos',
        subtipo: 'sueldo',
        descripcion: `Sueldo semanal ${nombre} · ${pagando.semana_inicio} → ${pagando.semana_fin}`,
        monto: pagando.total,
        empleado_id: pagando.empleado_id,
        periodo: String(pagando.semana_inicio).slice(0, 7),
        medio_pago: medioPago,
        estado: 'pagado',
      })
      await actualizarLiquidacion(pagando.id, {
        estado: 'pagado',
        egreso_id: egreso.id,
        pagado_at: new Date().toISOString(),
      })
      setPagando(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total de la semana (por hora)</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalSemana)}</p>
        </div>
        <button onClick={handleCerrar} disabled={busy || loading || !hayPorHora}
          title={enCurso ? 'La semana sigue en curso: podés cerrarla igual y regenerarla después' : ''}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Lock size={14} /> {busy ? 'Cerrando…' : (enCurso ? 'Cerrar semana (en curso)' : 'Cerrar semana')}
        </button>
      </div>

      {enCurso && pendientes.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-xmuted)' }}>
          La semana está en curso: las horas siguen sumando. Cerrala cuando termine (o antes, si ya está todo fichado) —
          si la volvés a cerrar se recalculan las horas de las filas no pagadas.
        </p>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Tabla por empleado */}
      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : filas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <Clock size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Sin horas fichadas esta semana</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filas.map(f => {
            const chip = CHIP[f.estado]
            const minutosMostrar = f.liq ? f.liq.minutos : f.minutos
            const totalMostrar = f.liq ? f.liq.total : f.total
            return (
              <div key={f.empleado_id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3 flex-wrap"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{f.nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtMinutos(minutosMostrar)}
                    </span>
                    {f.tipo_sueldo === 'hora' ? (
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-xmuted)' }}>
                        · {fmtMoney(f.liq ? f.liq.valor_hora : f.valor_hora)}/h
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>· sueldo fijo (horas informativas)</span>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.color }}>
                      {chip.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.tipo_sueldo === 'hora' && (
                    <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(totalMostrar)}
                    </span>
                  )}
                  {f.estado === 'pendiente' && (
                    <button onClick={() => { setPagando(f.liq); setError(null) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                      <BadgeDollarSign size={12} /> Pagar
                    </button>
                  )}
                  {f.liq && f.estado !== 'pagado' && (
                    <button onClick={() => setDelLiq(f.liq)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de pago */}
      {pagando && (
        <ModalShell title={`Pagar semana · ${pagando.empleado?.nombre || ''}`} icon={BadgeDollarSign} onClose={() => setPagando(null)} maxW="max-w-sm">
          <div className="p-5 space-y-4">
            <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--bg-active)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {fmtMinutos(pagando.minutos)} × {fmtMoney(pagando.valor_hora)}/h
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(pagando.total)}</p>
            </div>
            <Field label="Fecha de pago" type="date" value={fechaPago} onChange={setFechaPago} required />
            <Select label="Medio de pago" value={medioPago} onChange={setMedioPago}
              options={MEDIOS_PAGO.map(m => ({ value: m.id, label: m.label }))} />
            <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
              Se registra como egreso en Finanzas (categoría sueldos) y la semana queda Pagada.
            </p>
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <button onClick={handlePagar} disabled={busy}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
              {busy ? 'Registrando…' : `Confirmar pago de ${fmtMoney(pagando.total)}`}
            </button>
          </div>
        </ModalShell>
      )}

      {delLiq && (
        <ConfirmDelete titulo="Eliminar liquidación"
          mensaje="Se elimina el cierre (vuelve a 'Sin liquidar'). Los fichajes no se tocan."
          onClose={() => setDelLiq(null)} onConfirm={() => eliminarLiquidacion(delLiq.id)} />
      )}
    </div>
  )
}
