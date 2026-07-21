import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, BadgeDollarSign } from 'lucide-react'
import { useMisHoras } from '../hooks/useMisHoras'
import { fmtMinutos, fmtHora, shiftSemana, esSemanaActual } from '../lib/horas'
import { fmtMoney, localDateISO } from '../lib/finanzas'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import EmpleadoHeader from '../components/layout/EmpleadoHeader'

const ESTADO_CHIP = {
  pagado:    { label: 'Pagada ✓',           bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  pendiente: { label: 'Pendiente de pago',   bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  en_curso:  { label: 'En curso',            bg: 'var(--accent-soft)',    color: 'var(--accent-lift)' },
}

// Mis horas: la semana de liquidación va de MARTES a LUNES.
export default function MisHorasPage() {
  const [refDate, setRefDate] = useState(() => new Date())
  const { empleado, jornadas, minutos, estimado, esPorHora, liquidacion, jornales, semana, loading, error } = useMisHoras(refDate)

  const totalJornales = jornales.reduce((s, j) => s + Number(j.total || 0), 0)
  const diasJornal = new Set(jornales.map(j => j.semana_inicio))

  const enCurso = esSemanaActual(semana.inicio)
  const chip = liquidacion
    ? ESTADO_CHIP[liquidacion.estado]
    : (enCurso ? ESTADO_CHIP.en_curso : null)

  const abiertas = jornadas.filter(j => !j.salida)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <EmpleadoHeader />

      <div className="max-w-md mx-auto p-4 space-y-4 pb-10">
        <div className="pt-2">
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Mis horas
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Semana de liquidación: lunes a domingo · bloques de 30 min
          </p>
        </div>

        {/* Navegador de semana */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setRefDate(d => shiftSemana(d, -1))}
            className="p-1.5 rounded-lg transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold capitalize min-w-[190px] text-center" style={{ color: 'var(--text-primary)' }}>
            {semana.label}
          </span>
          <button onClick={() => setRefDate(d => shiftSemana(d, 1))} disabled={enCurso}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Total de la semana */}
        <div className="rounded-2xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Horas de la semana</p>
              <p className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Clock size={18} style={{ color: 'var(--accent-lift)' }} />
                {fmtMinutos(liquidacion ? liquidacion.minutos : minutos)}
              </p>
            </div>
            {esPorHora && (
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {liquidacion ? 'Total' : 'Estimado'}
                </p>
                <p className="text-2xl font-bold tracking-tight flex items-center gap-1.5" style={{ color: '#22c55e' }}>
                  <BadgeDollarSign size={18} />
                  {fmtMoney(liquidacion ? liquidacion.total : estimado)}
                </p>
              </div>
            )}
          </div>
          {chip && (
            <span className="inline-block mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: chip.bg, color: chip.color }}>
              {chip.label}
            </span>
          )}
          {esPorHora && empleado?.sueldo_base > 0 && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-xmuted)' }}>
              Valor hora: {fmtMoney(empleado.sueldo_base)}
            </p>
          )}
          {jornales.length > 0 && (
            <p className="text-[11px] mt-1" style={{ color: '#22c55e' }}>
              Jornales pagados: {jornales.length} {jornales.length === 1 ? 'día' : 'días'} · {fmtMoney(totalJornales)}
            </p>
          )}
        </div>

        {abiertas.length > 0 && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-2 text-xs"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Tenés {abiertas.length === 1 ? 'una jornada abierta' : `${abiertas.length} jornadas abiertas`} (sin salida).
              Si te olvidaste de fichar la salida, avisale al encargado para que la corrija.
            </span>
          </div>
        )}

        {/* Jornadas */}
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : jornadas.length === 0 ? (
            <p className="text-xs py-8 text-center rounded-xl"
              style={{ color: 'var(--text-xmuted)', background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              Sin fichajes esta semana
            </p>
          ) : (
            jornadas.map((j, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div>
                  <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {format(new Date(j.entrada), 'EEEE d/M', { locale: es })}
                  </p>
                  <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {fmtHora(j.entrada)} → {j.salida ? fmtHora(j.salida) : '⋯ (abierta)'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums" style={{ color: j.salida ? 'var(--accent-lift)' : '#f59e0b' }}>
                    {j.salida ? fmtMinutos(j.minutos) : '—'}
                  </p>
                  {j.salida && j.minutos !== j.minutos_reales && (
                    <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-xmuted)' }}>
                      reales: {fmtMinutos(j.minutos_reales)}
                    </p>
                  )}
                  {diasJornal.has(localDateISO(new Date(j.entrada))) && (
                    <p className="text-[10px] font-semibold" style={{ color: '#22c55e' }}>jornal pagado</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
