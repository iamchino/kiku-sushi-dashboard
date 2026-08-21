import { useState, useMemo } from 'react'
import { BadgeDollarSign, Trash2, Clock, Pencil } from 'lucide-react'
import { fmtMoney, fmtFecha } from '../../lib/finanzas'
import { fmtMinutos, fmtHorasCompacto, fmtHora, fmtFechaHora, diasDeLaSemana } from '../../lib/horas'
import { ModalShell, Field } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

const CHIP = {
  pagado:       { label: 'Pagada',       bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  pendiente:    { label: 'Pendiente',    bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  en_curso:     { label: 'En curso',     bg: 'var(--accent-soft)',    color: 'var(--accent-lift)' },
  sin_liquidar: { label: 'Sin liquidar', bg: 'var(--bg-active)',      color: 'var(--text-muted)' },
}

// Liquidación semanal (lunes → domingo): SOLO consulta y corrección de horas.
// Muestra cuánto le corresponde a cada empleado, el desglose por día y permite
// corregir una jornada mal fichada. Los pagos NO se hacen acá: van por el alta
// centralizada de Caja → Pagos, igual que cualquier otro egreso.
// Las liquidaciones ya existentes (cierres semanales y jornales) se siguen
// viendo y se pueden anular.
export default function LiquidacionSection({ horas, enCurso }) {
  const {
    semana, resumen, liquidaciones, liquidacionesDia, horasDia, jornadasDia, sueldos,
    fichajes, actualizarFichaje, eliminarFichaje, anularLiquidacionDia, eliminarLiquidacion, loading,
  } = horas
  const [editJornada, setEditJornada] = useState(null) // { jornada, empleado_id, nombre }
  const [delJornada, setDelJornada] = useState(null) // { jornada, empleado_id, nombre }
  const [delLiq, setDelLiq]       = useState(null)
  const [delDia, setDelDia]       = useState(null)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState(null)

  const liqPorEmpleado = useMemo(
    () => new Map(liquidaciones.map(l => [l.empleado_id, l])),
    [liquidaciones],
  )

  // Los 7 días de la semana visible (lun→dom) para la tira de horas por día.
  const dias = useMemo(() => diasDeLaSemana(semana.inicio), [semana.inicio])

  // Filas visibles: todo empleado con horas pendientes de cierre o con cierre semanal.
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
  const totalJornales = liquidacionesDia.reduce((s, l) => s + Number(l.total || 0), 0)
  // Borrado de una jornada desde la tira: elimina LAS DOS marcas (entrada y
  // salida) que la forman. Es la salida de emergencia para una jornada que
  // quedó mal armada — por ejemplo una salida de madrugada que se registró
  // como entrada y quedó apareada con la entrada del día siguiente.
  const handleEliminarJornada = async () => {
    if (!delJornada) return
    const { jornada, empleado_id } = delJornada
    setBusy(true); setError(null)
    try {
      const eq = (a, b) => new Date(a).getTime() === new Date(b).getTime()
      const fe = fichajes.find(x => x.empleado_id === empleado_id && x.tipo === 'entrada' && eq(x.ts, jornada.entrada))
      const fs = fichajes.find(x => x.empleado_id === empleado_id && x.tipo === 'salida'  && eq(x.ts, jornada.salida))
      if (!fe && !fs) {
        throw new Error('No encontré las marcas de esa jornada. Borralas desde la pestaña Fichajes.')
      }
      if (fe) await eliminarFichaje(fe.id)
      if (fs) await eliminarFichaje(fs.id)
      setDelJornada(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Corrección de una jornada desde la tira: ajusta las marcas reales de
  // fichaje (entrada/salida). Queda como corrección manual y recalcula todo.
  const handleEditarJornada = async ({ fecha, horaEntrada, horaSalida }) => {
    if (!editJornada) return
    const { jornada, empleado_id } = editJornada
    setBusy(true); setError(null)
    try {
      const eq = (a, b) => new Date(a).getTime() === new Date(b).getTime()
      const fe = fichajes.find(x => x.empleado_id === empleado_id && x.tipo === 'entrada' && eq(x.ts, jornada.entrada))
      const fs = fichajes.find(x => x.empleado_id === empleado_id && x.tipo === 'salida' && eq(x.ts, jornada.salida))
      if (!fe || !fs) {
        throw new Error('No encontré las marcas de esa jornada. Corregila desde la pestaña Fichajes.')
      }
      const armar = (fechaStr, hhmm) => {
        const [y, mo, d] = String(fechaStr).split('-').map(Number)
        const [h, mi] = String(hhmm).split(':').map(Number)
        return new Date(y, mo - 1, d, h, mi, 0, 0)
      }
      const nuevaEntrada = armar(fecha, horaEntrada)
      let nuevaSalida    = armar(fecha, horaSalida)
      // Salida "antes" de la entrada = la jornada cruzó la medianoche.
      if (nuevaSalida <= nuevaEntrada) {
        nuevaSalida = new Date(nuevaSalida.getTime() + 24 * 3600 * 1000)
      }
      if (nuevaSalida - nuevaEntrada > 16 * 3600 * 1000) {
        throw new Error('La jornada quedaría de más de 16 horas: revisá las horas cargadas.')
      }
      if (!eq(nuevaEntrada.toISOString(), jornada.entrada)) await actualizarFichaje(fe.id, { ts: nuevaEntrada.toISOString() })
      if (!eq(nuevaSalida.toISOString(), jornada.salida))  await actualizarFichaje(fs.id, { ts: nuevaSalida.toISOString() })
      setEditJornada(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>A pagar por las horas de la semana</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalSemana)}</p>
          {totalJornales > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
              + {fmtMoney(totalJornales)} ya pagados por día esta semana
            </p>
          )}
        </div>
        {/* Los sueldos se pagan desde Caja → Pagos, como cualquier otro egreso:
            acá solo se consultan y corrigen las horas. */}
        <span className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg"
          style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
          <BadgeDollarSign size={12} /> Los sueldos se pagan en Caja y facturación → Pagos
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Tabla semanal por empleado */}
      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : filas.length === 0 && liquidacionesDia.length === 0 ? (
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
            const porDia = horasDia[f.empleado_id] || {}
            // La tira Lun→Dom se muestra para TODOS los que tengan horas,
            // también sueldo fijo: sus horas se contabilizan igual (solo que
            // no generan monto en el cierre).
            const tieneDetalle = dias.some(d => (porDia[d.iso] || 0) > 0)
            return (
              <div key={f.empleado_id} className="rounded-xl px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
               <div className="flex items-center justify-between gap-3 flex-wrap">
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
                      <span className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
                        · sueldo fijo{(sueldos?.[f.empleado_id] || 0) > 0 ? ` · ${fmtMoney(sueldos[f.empleado_id])}/mes` : ''}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.color }}>
                      {chip.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.tipo_sueldo === 'hora' ? (
                    <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(totalMostrar)}
                    </span>
                  ) : (sueldos?.[f.empleado_id] || 0) > 0 && (
                    <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtMoney(sueldos[f.empleado_id])}
                      <span className="text-[10px] font-normal" style={{ color: 'var(--text-xmuted)' }}> /mes</span>
                    </span>
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

               {/* Desglose por día (lun→dom). Suma el total de arriba: los días
                   pagados por jornal se excluyen (aparecen abajo, en "Pagos por día"). */}
               {tieneDetalle && (
                 <DiaStrip dias={dias} porDia={porDia}
                   detalles={jornadasDia?.[f.empleado_id] || {}}
                   onEditar={f.liq
                     ? null // con la semana ya cerrada, primero eliminar el cierre
                     : (j) => { setError(null); setEditJornada({ jornada: j, empleado_id: f.empleado_id, nombre: f.nombre }) }}
                   onEliminar={f.liq
                     ? null
                     : (j) => { setError(null); setDelJornada({ jornada: j, empleado_id: f.empleado_id, nombre: f.nombre }) }} />
               )}
              </div>
            )
          })}
        </div>
      )}

      {/* Jornales (pagos por día) de la semana */}
      {liquidacionesDia.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Pagos por día (jornales)</p>
          <div className="space-y-2">
            {liquidacionesDia.map(l => (
              <div key={l.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {l.empleado?.nombre} {l.empleado?.apellido || ''}
                    <span className="ml-2 text-xs font-normal capitalize" style={{ color: 'var(--text-muted)' }}>{fmtFecha(l.semana_inicio)}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtMinutos(l.minutos)}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-xmuted)' }}>· {fmtMoney(l.valor_hora)}/h</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: CHIP[l.estado].bg, color: CHIP[l.estado].color }}>
                      {l.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(l.total)}</span>
                  <button onClick={() => setDelDia(l)} title="Anular jornal (borra también su egreso)"
                    className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de corrección de jornada */}
      {editJornada && (
        <EditarJornadaModal seed={editJornada} busy={busy} error={error}
          onClose={() => setEditJornada(null)} onConfirm={handleEditarJornada} />
      )}

      {delJornada && (
        <ConfirmDelete titulo="Eliminar jornada"
          mensaje={`¿Borrás la jornada de ${delJornada.nombre} del ${fmtFechaHora(delJornada.jornada.entrada)} (${fmtHora(delJornada.jornada.entrada)} → ${fmtHora(delJornada.jornada.salida)})? Se eliminan las DOS marcas, la de entrada y la de salida. Cambia el cálculo de horas.`}
          onClose={() => setDelJornada(null)} onConfirm={handleEliminarJornada} />
      )}

      {delLiq && (
        <ConfirmDelete titulo="Eliminar liquidación"
          mensaje="Se elimina el cierre (vuelve a 'Sin liquidar'). Los fichajes no se tocan."
          onClose={() => setDelLiq(null)} onConfirm={() => eliminarLiquidacion(delLiq.id)} />
      )}

      {delDia && (
        <ConfirmDelete titulo="Anular jornal"
          mensaje={`¿Anulás el jornal de ${delDia.empleado?.nombre || ''} del ${fmtFecha(delDia.semana_inicio)} por ${fmtMoney(delDia.total)}? Se borra también su egreso en Finanzas y las horas vuelven al cierre semanal.`}
          onClose={() => setDelDia(null)} onConfirm={() => anularLiquidacionDia(delDia)} />
      )}
    </div>
  )
}

// Tira de horas por día (lun→dom) bajo el total del empleado. Cada celda
// muestra el día y sus horas; tocando un día con horas se despliega el
// detalle de cada jornada: de qué hora a qué hora.
function DiaStrip({ dias, porDia, detalles, onEditar, onEliminar }) {
  const [sel, setSel] = useState(null)
  const jornadasSel = sel ? (detalles?.[sel] || []) : []
  const diaSel = sel ? dias.find(d => d.iso === sel) : null

  return (
    <div className="mt-2.5">
      <div className="grid grid-cols-7 gap-1">
        {dias.map(d => {
          const min = porDia[d.iso] || 0
          const activo = min > 0
          const abierto = sel === d.iso
          return (
            <button
              key={d.iso}
              type="button"
              disabled={!activo}
              onClick={() => setSel(abierto ? null : d.iso)}
              title={`${d.etiqueta} ${d.num}: ${activo ? `${fmtMinutos(min)} — tocá para ver los horarios` : 'sin horas'}`}
              className="flex flex-col items-center justify-center rounded-lg py-1.5 gap-0.5 transition-all"
              style={{
                background: abierto ? 'rgba(var(--accent-rgb),0.18)' : activo ? 'var(--accent-soft)' : 'var(--bg-input)',
                border: `1px solid ${abierto ? 'var(--accent-lift)' : activo ? 'var(--accent-border)' : 'var(--border)'}`,
                cursor: activo ? 'pointer' : 'default',
              }}
            >
              <span
                className="text-[9px] font-semibold uppercase tracking-wide capitalize"
                style={{ color: activo ? 'var(--accent-lift)' : 'var(--text-xmuted)' }}
              >
                {d.etiqueta}
              </span>
              <span
                className="text-[11px] tabular-nums font-medium"
                style={{ color: activo ? 'var(--text-primary)' : 'var(--text-xmuted)' }}
              >
                {fmtHorasCompacto(min)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Detalle del día elegido: cada jornada con su entrada → salida */}
      {sel && jornadasSel.length > 0 && (
        <div className="mt-1.5 rounded-lg px-3 py-2 space-y-1"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--accent-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide capitalize"
            style={{ color: 'var(--accent-lift)' }}>
            {diaSel ? `${diaSel.etiqueta} ${diaSel.num}` : sel}
            {jornadasSel.length > 1 && (
              <span className="ml-1.5 font-normal normal-case" style={{ color: 'var(--text-xmuted)' }}>
                · {jornadasSel.length} jornadas
              </span>
            )}
          </p>
          {jornadasSel.map((j, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
              <span style={{ color: 'var(--text-primary)' }}>
                {fmtHora(j.entrada)} → {fmtHora(j.salida)}
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }}>{fmtMinutos(j.minutos_reales ?? j.minutos)}</span>
                {onEditar && (
                  <button type="button" onClick={() => onEditar(j)} title="Corregir entrada/salida"
                    className="p-1 rounded transition-colors" style={{ color: 'var(--accent-lift)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Pencil size={11} />
                  </button>
                )}
                {onEliminar && (
                  <button type="button" onClick={() => onEliminar(j)} title="Eliminar esta jornada (borra las dos marcas)"
                    className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </span>
            </div>
          ))}
          {!onEditar && (
            <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
              La semana ya tiene cierre: para corregir horarios, eliminá el cierre primero.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Corrección rápida de una jornada: dos campos de hora, listo. Toca las
// marcas reales de fichaje (quedan como corrección manual).
function EditarJornadaModal({ seed, busy, error, onClose, onConfirm }) {
  const hhmm = (iso) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const fechaLocal = (iso) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const [fecha, setFecha]             = useState(() => fechaLocal(seed.jornada.entrada))
  const [horaEntrada, setHoraEntrada] = useState(() => hhmm(seed.jornada.entrada))
  const [horaSalida, setHoraSalida]   = useState(() => hhmm(seed.jornada.salida))

  return (
    <ModalShell title={`Corregir jornada · ${seed.nombre}`} icon={Pencil} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Field label="Día trabajado" type="date" value={fecha} onChange={setFecha} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entrada" type="time" value={horaEntrada} onChange={setHoraEntrada} required />
          <Field label="Salida"  type="time" value={horaSalida}  onChange={setHoraSalida} required />
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Corrige las marcas reales de fichaje (quedan como corrección manual) y
          recalcula horas y liquidación al instante. Si la salida es &quot;antes&quot; que
          la entrada, se toma como del día siguiente (turno que cruza la medianoche).
          Si cambiás el día a otra semana, la jornada se muda a esa semana.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={() => onConfirm({ fecha, horaEntrada, horaSalida })}
          disabled={busy || !fecha || !horaEntrada || !horaSalida}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Guardando…' : 'Guardar corrección'}
        </button>
      </div>
    </ModalShell>
  )
}
