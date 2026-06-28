import { useState, useMemo } from 'react'
import { PieChart, Wallet, ArrowDownCircle, Truck, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { calcularPeriodo, shiftRef, localDateISO } from '../lib/finanzas'
import ResumenFinanzas from '../components/finanzas/ResumenFinanzas'
import CajasDiarias from '../components/finanzas/CajasDiarias'
import EgresosSection from '../components/finanzas/EgresosSection'
import ProveedoresPagos from '../components/finanzas/ProveedoresPagos'
import SueldosSection from '../components/finanzas/SueldosSection'

const GRANS = [
  { id: 'dia',  label: 'Día' },
  { id: 'mes',  label: 'Mes' },
  { id: 'anio', label: 'Año' },
]

const SECCIONES = [
  { id: 'resumen',     label: 'Resumen',      icon: PieChart },
  { id: 'cajas',       label: 'Cajas diarias', icon: Wallet },
  { id: 'egresos',     label: 'Egresos',      icon: ArrowDownCircle },
  { id: 'proveedores', label: 'Proveedores',  icon: Truck },
  { id: 'sueldos',     label: 'Sueldos',      icon: Users },
]

export default function FinanzasPage() {
  const [gran, setGran]       = useState('mes')
  const [refDate, setRefDate] = useState(() => new Date())
  const [seccion, setSeccion] = useState('resumen')

  const { desde, hasta, label } = useMemo(() => calcularPeriodo(gran, refDate), [gran, refDate])
  const esActual = useMemo(() => {
    const hoy = localDateISO()
    return hoy >= desde && hoy <= hasta
  }, [desde, hasta])

  const cambiarGran = (g) => { setGran(g); setRefDate(new Date()) }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Finanzas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Foto del negocio — solo administradores
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector Día/Mes/Año */}
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {GRANS.map(g => (
              <button key={g.id} onClick={() => cambiarGran(g.id)}
                className="px-3 py-2 text-xs font-semibold transition-colors"
                style={gran === g.id
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)' }
                  : { color: 'var(--text-secondary)' }}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navegador de período */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setRefDate(d => shiftRef(gran, d, -1))}
          className="p-1.5 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold capitalize min-w-[140px] text-center" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <button onClick={() => setRefDate(d => shiftRef(gran, d, 1))} disabled={esActual}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { if (!esActual) e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ChevronRight size={16} />
        </button>
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

      {/* Contenido */}
      <div className="mt-1">
        {seccion === 'resumen'     && <ResumenFinanzas   desde={desde} hasta={hasta} label={label} />}
        {seccion === 'cajas'       && <CajasDiarias      desde={desde} hasta={hasta} />}
        {seccion === 'egresos'     && <EgresosSection    desde={desde} hasta={hasta} label={label} />}
        {seccion === 'proveedores' && <ProveedoresPagos  desde={desde} hasta={hasta} label={label} />}
        {seccion === 'sueldos'     && <SueldosSection    desde={desde} hasta={hasta} label={label} />}
      </div>
    </div>
  )
}
