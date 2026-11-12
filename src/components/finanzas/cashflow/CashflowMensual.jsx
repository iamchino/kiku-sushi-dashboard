import { useState } from 'react'
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, Loader2, PiggyBank, RefreshCw,
} from 'lucide-react'
import { usePermisos } from '../../../context/usePermisos'
import { useCashflow } from '../../../hooks/useCashflow'
import { useNegocio } from '../../../hooks/useNegocio'
import { ESTADOS, GRUPOS, fmtPlata, labelMes, mesDe, sumarMeses } from '../../../lib/cashflow'
import { fechaHoyAR } from '../../../lib/fiscal'
import { exportarCashflowExcel } from '../../../lib/cashflowExcel'
import CashflowGrafico from './CashflowGrafico'
import CashflowTabla from './CashflowTabla'
import CashflowConfigModal from './CashflowConfigModal'
import EstimarFilaModal from './EstimarFilaModal'
import DetalleCeldaModal from './DetalleCeldaModal'

// Finanzas → Cash flow: la planilla mensual de administración adentro del
// dashboard. Los meses pasados salen solos de lo cobrado y lo pagado; el mes
// en curso y los que vienen se estiman a mano (tocando la celda, o una fila
// entera con el botón del calendario) y se cruzan con los pagos pendientes
// que ya estén cargados.

const VISTAS = [
  { id: 6,  label: '6 meses',  atras: 1 },
  { id: 12, label: '12 meses', atras: 2 },
]

function Tarjeta({ label, valor, sub, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" style={{ color: color || 'var(--text-primary)' }}>{valor}</p>
      {sub && <p className="mt-1 text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function Aviso({ tono = 'bad', children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
      style={{ background: `var(--${tono}-soft)`, border: `1px solid var(--${tono})`, color: `var(--${tono})` }}>
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export default function CashflowMensual() {
  const { puedeEditar } = usePermisos()
  const editable = puedeEditar('finanzas')
  const negocio = useNegocio()

  const [vista, setVista] = useState(6)
  const [corrimiento, setCorrimiento] = useState(0)     // meses movidos con las flechas
  const [verDetalle, setVerDetalle] = useState(false)
  const [modalConfig, setModalConfig] = useState(false)
  const [filaAEstimar, setFilaAEstimar] = useState(null) // { concepto, label }
  const [detalle, setDetalle] = useState(null)           // { mes, concepto, celda }
  const [exportando, setExportando] = useState(false)
  const [aviso, setAviso] = useState(null)

  // El hook necesita el primer mes; el mes actual lo conoce él, así que la
  // ventana se define como "N meses antes de hoy" + lo que se movió.
  const atras = VISTAS.find(v => v.id === vista).atras
  const {
    meses, mesActual, modelo, config, loading, error, faltaMigracion, recargar, guardar, guardarConfig,
  } = useCashflow({ primerMes: sumarMeses(mesDe(fechaHoyAR()), corrimiento - atras), cantidad: vista })

  const colActual = modelo.columnas.find(c => c.mes === mesActual) || null
  const ultima = modelo.columnas[modelo.columnas.length - 1] || null
  const alerta = modelo.mesesEnAlerta
  const sinEstimados = modelo.columnas.filter(c => c.tipo === 'futuro').every(c => (
    c.ingresos.estimado === null && GRUPOS.every(g => c.grupos[g.id].estimado === null)
  ))

  const exportar = async () => {
    setExportando(true); setAviso(null)
    try {
      await exportarCashflowExcel(modelo, { negocio: negocio?.nombre || 'Cash flow' })
    } catch (err) {
      setAviso(`No se pudo armar el Excel: ${err.message || err}`)
    } finally {
      setExportando(false)
    }
  }

  const btn = { border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }
  const grupoDetalle = detalle ? GRUPOS.find(g => g.id === detalle.concepto) : null

  if (faltaMigracion) {
    return (
      <Aviso tono="warn">
        Falta correr el SQL 55 (cash flow mensual) en Supabase. Hasta entonces esta pestaña no tiene de dónde leer.
      </Aviso>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra: ventana de meses + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCorrimiento(c => c - 1)} aria-label="Ver un mes antes"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={btn}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[170px] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {meses.length ? `${labelMes(meses[0])} – ${labelMes(meses[meses.length - 1])}` : ''}
          </span>
          <button type="button" onClick={() => setCorrimiento(c => c + 1)} aria-label="Ver un mes después"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={btn}>
            <ChevronRight size={16} />
          </button>
          {corrimiento !== 0 && (
            <button type="button" onClick={() => setCorrimiento(0)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={btn}>
              Volver a hoy
            </button>
          )}
          <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }}>
            {VISTAS.map(v => (
              <button key={v.id} type="button" onClick={() => { setVista(v.id); setCorrimiento(0) }} aria-pressed={vista === v.id}
                className="px-3 py-2 text-xs font-semibold transition-colors"
                style={vista === v.id ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)' } : { color: 'var(--text-secondary)' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={recargar} aria-label="Actualizar" title="Actualizar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={btn}>
            <RefreshCw size={14} />
          </button>
          {editable && (
            <button type="button" onClick={() => setModalConfig(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={btn}>
              <PiggyBank size={14} /> Saldo y alertas
            </button>
          )}
          <button type="button" onClick={exportar} disabled={exportando || loading}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={btn}>
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar Excel
          </button>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
        </div>
      ) : (
        <>
          {/* Lo importante, antes de la planilla */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Tarjeta
              label={colActual ? `Flujo neto de ${labelMes(colActual.mes, { largo: true })}` : 'Flujo neto del período'}
              valor={fmtPlata(colActual ? colActual.flujo : modelo.total.flujo)}
              color={(colActual ? colActual.flujo : modelo.total.flujo) < 0 ? 'var(--bad)' : 'var(--ok)'}
              sub={!colActual
                ? `Entran ${fmtPlata(modelo.total.ingresos)} y salen ${fmtPlata(modelo.total.totalEgresos)}.`
                : colActual.ingresos.estimado === null
                  // Sin estimado, los ingresos del mes son solo lo cobrado hasta hoy
                  // contra los gastos del mes entero: hay que decirlo.
                  ? `Ojo: falta estimar los ingresos del mes. Por ahora cuenta solo lo cobrado hasta hoy (${fmtPlata(colActual.ingresos.real)}) contra ${fmtPlata(colActual.totalEgresos)} de egresos.`
                  : `Proyectado al cierre del mes: entran ${fmtPlata(colActual.ingresos.valor)} y salen ${fmtPlata(colActual.totalEgresos)}.`}
            />
            <Tarjeta
              label={ultima ? `Saldo a fin de ${labelMes(ultima.mes, { largo: true })}` : 'Saldo'}
              valor={ultima && ultima.saldoFinal !== null ? fmtPlata(ultima.saldoFinal) : '—'}
              color={ultima && ultima.saldoFinal !== null ? (ultima.saldoFinal < 0 ? 'var(--bad)' : 'var(--ok)') : undefined}
              sub={modelo.saldo.configurado
                ? `Partiendo de ${fmtPlata(modelo.saldo.inicial)} al empezar ${labelMes(modelo.saldo.desde, { largo: true })}.`
                : (editable ? 'Cargá el saldo inicial en “Saldo y alertas” para verlo.' : 'Todavía no se cargó el saldo inicial.')}
            />
            <Tarjeta
              label="Meses en alerta"
              valor={`${alerta.length} de ${modelo.columnas.length}`}
              color={alerta.length > 0 ? 'var(--bad)' : 'var(--ok)'}
              sub={alerta.length > 0
                ? alerta.map(m => `${labelMes(m)} (${ESTADOS[modelo.columnas.find(c => c.mes === m).estado].label.toLowerCase()})`).join(' · ')
                : (modelo.saldo.configurado ? 'Ningún mes termina bajo el mínimo de seguridad.' : 'Ningún mes cierra con flujo negativo.')}
            />
          </div>

          <section className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Flujo neto por mes</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Lo que sobra o falta cada mes: ingresos menos egresos.</p>
            </div>
            <CashflowGrafico columnas={modelo.columnas} />
          </section>

          <section className="rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>$1.000</strong> real o ya cargado</span>
                <span><em style={{ color: 'var(--text-secondary)' }}>$1.000</em> estimado</span>
                {editable && <span>Tocá una celda del mes en curso o de uno futuro para estimarla.</span>}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={verDetalle} onChange={e => setVerDetalle(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]" />
                Mostrar de qué está hecho cada número
              </label>
            </div>
            <div className="p-2 pt-3">
              <CashflowTabla
                modelo={modelo} editable={editable} verDetalle={verDetalle}
                onGuardar={guardar}
                onEstimarFila={setFilaAEstimar}
                onDetalle={setDetalle}
              />
            </div>
          </section>

          {editable && sinEstimados && (
            <p className="rounded-lg px-3 py-2 text-xs leading-5" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              Los meses que vienen todavía no tienen estimados. Para completar una fila entera de una vez (por ejemplo,
              Personal con 5 % de aumento por mes) usá el botón del calendario que está al lado de cada concepto.
            </p>
          )}
          {modelo.sinFecha.cantidad > 0 && (
            <p className="rounded-lg px-3 py-2 text-xs leading-5" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              Hay {modelo.sinFecha.cantidad} {modelo.sinFecha.cantidad === 1 ? 'pago pendiente' : 'pagos pendientes'} sin fecha de
              vencimiento por {fmtPlata(modelo.sinFecha.monto)}: no {modelo.sinFecha.cantidad === 1 ? 'entra' : 'entran'} en ningún mes de
              la tabla. Ponele fecha desde Proyección de pagos para que aparezca{modelo.sinFecha.cantidad === 1 ? '' : 'n'}.
            </p>
          )}
        </>
      )}

      {modalConfig && (
        <CashflowConfigModal config={config} mesActual={mesActual} onClose={() => setModalConfig(false)} onGuardar={guardarConfig} />
      )}
      {filaAEstimar && (
        <EstimarFilaModal
          concepto={filaAEstimar.concepto} label={filaAEstimar.label} mesActual={mesActual}
          hastaSugerido={meses[meses.length - 1]}
          promedioReal={modelo.promedios[filaAEstimar.concepto]}
          onClose={() => setFilaAEstimar(null)} onGuardar={guardar}
        />
      )}
      {detalle && grupoDetalle && (
        <DetalleCeldaModal grupo={grupoDetalle} mes={detalle.mes} celda={detalle.celda}
          esMesEnCurso={detalle.mes === mesActual} onClose={() => setDetalle(null)} />
      )}
    </div>
  )
}
