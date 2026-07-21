import { useState } from 'react'
import { ChevronLeft, ChevronRight, BadgeDollarSign, ListChecks, UserCog, QrCode, AlertTriangle } from 'lucide-react'
import { useHoras } from '../hooks/useHoras'
import { useEmpleados } from '../hooks/useEmpleados'
import { shiftSemana, esSemanaActual } from '../lib/horas'
import LiquidacionSection from '../components/personal/LiquidacionSection'
import FichajesSection from '../components/personal/FichajesSection'
import UsuariosSection from '../components/personal/UsuariosSection'
import PuntosQRSection from '../components/personal/PuntosQRSection'

const SECCIONES = [
  { id: 'liquidacion', label: 'Liquidación', icon: BadgeDollarSign },
  { id: 'fichajes',    label: 'Fichajes',    icon: ListChecks },
  { id: 'usuarios',    label: 'Usuarios',    icon: UserCog },
  { id: 'qr',          label: 'QR del local', icon: QrCode },
]

// Personal: control de horas y liquidación semanal (lunes → domingo).
// Exclusivo del usuario de Finanzas (guard en App.jsx + RLS en la BD).
export default function PersonalPage() {
  const [refDate, setRefDate] = useState(() => new Date())
  const [seccion, setSeccion] = useState('liquidacion')

  const horas = useHoras(refDate)
  const { empleados } = useEmpleados()

  const enCurso = esSemanaActual(horas.semana.inicio)
  const conSemana = seccion === 'liquidacion' || seccion === 'fichajes'

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Personal</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Fichaje y horas · semana lunes → domingo · bloques de 30 min
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <section className="flex flex-wrap gap-2">
        {SECCIONES.map(item => {
          const Icon = item.icon
          return (
            <button key={item.id} onClick={() => setSeccion(item.id)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={seccion === item.id
                ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <Icon size={14} />
              {item.label}
            </button>
          )
        })}
      </section>

      {/* Navegador de semana (solo para secciones con período) */}
      {conSemana && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setRefDate(d => shiftSemana(d, -1))}
            className="p-1.5 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[210px]">
            <span className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
              {horas.semana.label}
            </span>
            {enCurso && (
              <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
                En curso
              </span>
            )}
          </div>
          <button onClick={() => setRefDate(d => shiftSemana(d, 1))} disabled={enCurso}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { if (!enCurso) e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {horas.error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {horas.error}
        </div>
      )}

      {/* Contenido */}
      <div className="mt-1">
        {seccion === 'liquidacion' && <LiquidacionSection horas={horas} enCurso={enCurso} />}
        {seccion === 'fichajes'    && <FichajesSection horas={horas} empleados={empleados} />}
        {seccion === 'usuarios'    && <UsuariosSection empleados={empleados} />}
        {seccion === 'qr'          && <PuntosQRSection horas={horas} />}
      </div>
    </div>
  )
}
