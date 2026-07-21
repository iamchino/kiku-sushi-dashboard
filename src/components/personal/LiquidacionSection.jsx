import { useState, useEffect, useMemo } from 'react'
import { BadgeDollarSign, Lock, Trash2, Clock, CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useEgresos } from '../../hooks/useEgresos'
import { fmtMoney, fmtFecha, MEDIOS_PAGO, localDateISO } from '../../lib/finanzas'
import { fmtMinutos, fmtHorasCompacto, diasDeLaSemana } from '../../lib/horas'
import { ModalShell, Field, Select } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

const CHIP = {
  pagado:       { label: 'Pagada',       bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  pendiente:    { label: 'Pendiente',    bg: 'rgba(245,158,11,0.14)', color: '#f59e0b' },
  en_curso:     { label: 'En curso',     bg: 'var(--accent-soft)',    color: 'var(--accent-lift)' },
  sin_liquidar: { label: 'Sin liquidar', bg: 'var(--bg-active)',      color: 'var(--text-muted)' },
}

// Liquidación semanal (lunes → domingo) con estados + pago por DÍA (jornal):
//   Semana:  En curso → Cerrar semana → Pendiente → Pagar → Pagada
//   Día:     "Pagar día" → jornal pendiente + egreso → Pagado
// Un día pagado por jornal queda excluido del cierre semanal (sin dobles pagos).
export default function LiquidacionSection({ horas, enCurso }) {
  const {
    semana, resumen, liquidaciones, liquidacionesDia, horasDia,
    generarLiquidacion, generarLiquidacionDia, anularLiquidacionDia,
    actualizarLiquidacion, eliminarLiquidacion, loading,
  } = horas
  const { crearEgreso } = useEgresos(semana.desde, semana.hasta)

  const [pagando, setPagando]     = useState(null)  // liq semanal a pagar
  const [pagandoDia, setPagandoDia] = useState(null) // { empleado_id, nombre, valor_hora }
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
  const hayPorHora = filas.some(f => f.tipo_sueldo === 'hora' && f.minutos > 0)
  const empleadosHora = useMemo(
    () => resumen.filter(r => r.tipo_sueldo === 'hora'),
    [resumen],
  )

  const handleCerrar = async () => {
    setBusy(true); setError(null)
    try { await generarLiquidacion() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  // Pago de cierre SEMANAL (crea egreso + marca pagada).
  const handlePagar = async ({ fechaPago, medioPago }) => {
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

  // Pago de JORNAL: genera la fila 'dia' y la paga en el acto.
  const handlePagarDia = async ({ empleado_id, nombre, fecha, fechaPago, medioPago }) => {
    if (!empleado_id) return
    setBusy(true); setError(null)
    try {
      const liq = await generarLiquidacionDia(empleado_id, fecha)
      const egreso = await crearEgreso({
        fecha: fechaPago,
        categoria: 'sueldos',
        subtipo: 'jornal',
        descripcion: `Jornal ${nombre} · ${fecha}`,
        monto: liq.total,
        empleado_id,
        periodo: String(fecha).slice(0, 7),
        medio_pago: medioPago,
        estado: 'pagado',
      })
      await actualizarLiquidacion(liq.id, {
        estado: 'pagado',
        egreso_id: egreso.id,
        pagado_at: new Date().toISOString(),
      })
      setPagandoDia(null)
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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pendiente de cierre semanal</p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalSemana)}</p>
          {totalJornales > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
              + {fmtMoney(totalJornales)} ya pagados por día esta semana
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setPagandoDia({ elegir: true }); setError(null) }}
            disabled={empleadosHora.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
            <CalendarDays size={14} /> Pagar día
          </button>
          <button onClick={handleCerrar} disabled={busy || loading || !hayPorHora}
            title={enCurso ? 'La semana sigue en curso: podés cerrarla igual y regenerarla después' : ''}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <Lock size={14} /> {busy ? 'Procesando…' : (enCurso ? 'Cerrar semana (en curso)' : 'Cerrar semana')}
          </button>
        </div>
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
            const tieneDetalle = f.tipo_sueldo === 'hora' && dias.some(d => (porDia[d.iso] || 0) > 0)
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
                  {f.tipo_sueldo === 'hora' && !f.liq && (
                    <button onClick={() => { setPagandoDia({ empleado_id: f.empleado_id, nombre: f.nombre, valor_hora: f.valor_hora }); setError(null) }}
                      title="Pagar un día suelto (jornal)"
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
                      Día
                    </button>
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

               {/* Desglose por día (lun→dom). Suma el total de arriba: los días
                   pagados por jornal se excluyen (aparecen abajo, en "Pagos por día"). */}
               {tieneDetalle && <DiaStrip dias={dias} porDia={porDia} />}
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

      {/* Modal de pago semanal */}
      {pagando && (
        <PagoSemanaModal pagando={pagando} busy={busy} error={error}
          onClose={() => setPagando(null)} onConfirm={handlePagar} />
      )}

      {/* Modal de pago por día */}
      {pagandoDia && (
        <PagoDiaModal
          seed={pagandoDia}
          empleados={empleadosHora}
          busy={busy}
          error={error}
          onClose={() => setPagandoDia(null)}
          onConfirm={handlePagarDia}
        />
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

// Tira de horas por día (lun→dom) bajo el total del empleado. Cada celda muestra
// el día y las horas de ese día; los días sin horas quedan en gris. La suma de
// la tira coincide con el total "pendiente de cierre" de la fila.
function DiaStrip({ dias, porDia }) {
  return (
    <div className="mt-2.5 grid grid-cols-7 gap-1">
      {dias.map(d => {
        const min = porDia[d.iso] || 0
        const activo = min > 0
        return (
          <div
            key={d.iso}
            title={`${d.etiqueta} ${d.num}: ${activo ? fmtMinutos(min) : 'sin horas'}`}
            className="flex flex-col items-center justify-center rounded-lg py-1.5 gap-0.5"
            style={{
              background: activo ? 'var(--accent-soft)' : 'var(--bg-input)',
              border: `1px solid ${activo ? 'var(--accent-border)' : 'var(--border)'}`,
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
          </div>
        )
      })}
    </div>
  )
}

function PagoSemanaModal({ pagando, busy, error, onClose, onConfirm }) {
  const [medioPago, setMedioPago] = useState('transferencia')
  const [fechaPago, setFechaPago] = useState(() => localDateISO())

  return (
    <ModalShell title={`Pagar semana · ${pagando.empleado?.nombre || ''}`} icon={BadgeDollarSign} onClose={onClose} maxW="max-w-sm">
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
        <button onClick={() => onConfirm({ fechaPago, medioPago })} disabled={busy}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          {busy ? 'Registrando…' : `Confirmar pago de ${fmtMoney(pagando.total)}`}
        </button>
      </div>
    </ModalShell>
  )
}

// Modal de jornal: elegí empleado (si no vino pre-elegido) y día → muestra las
// horas cerradas de ese día → confirma el pago (jornal + egreso en un paso).
function PagoDiaModal({ seed, empleados, busy, error, onClose, onConfirm }) {
  const [empleadoId, setEmpleadoId] = useState(seed?.empleado_id || empleados[0]?.empleado_id || '')
  const [fecha, setFecha]           = useState(() => localDateISO())
  const [fechaPago, setFechaPago]   = useState(() => localDateISO())
  const [medioPago, setMedioPago]   = useState('efectivo')
  const [preview, setPreview]       = useState(null)   // { minutos, total, valor_hora } | null
  const [cargando, setCargando]     = useState(false)

  // Horas cerradas del día elegido (excluye días ya pagados por jornal).
  useEffect(() => {
    let vivo = true
    if (!empleadoId || !fecha) { setPreview(null); return }
    setCargando(true)
    supabase.rpc('liquidacion_horas', { p_desde: fecha, p_hasta: fecha })
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) { setPreview(null); return }
        const fila = (data || []).find(r => r.empleado_id === empleadoId)
        setPreview(fila || null)
      })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [empleadoId, fecha])

  const sinHoras = !cargando && (!preview || preview.minutos <= 0)
  const nombre = empleados.find(r => r.empleado_id === empleadoId)?.nombre || seed?.nombre || ''

  return (
    <ModalShell title="Pagar día (jornal)" icon={CalendarDays} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Select label="Empleado" value={empleadoId} onChange={setEmpleadoId} required
          options={empleados.map(r => ({ value: r.empleado_id, label: r.nombre }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día trabajado" type="date" value={fecha} onChange={setFecha} required />
          <Field label="Fecha de pago" type="date" value={fechaPago} onChange={setFechaPago} required />
        </div>

        <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--bg-active)' }}>
          {cargando ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Calculando…</p>
          ) : preview && preview.minutos > 0 ? (
            <>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {fmtMinutos(preview.minutos)} × {fmtMoney(preview.valor_hora)}/h
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(preview.total)}</p>
            </>
          ) : (
            <p className="text-xs" style={{ color: '#f59e0b' }}>
              Sin horas cerradas ese día (jornada abierta, sin fichajes, o ya pagado).
            </p>
          )}
        </div>

        <Select label="Medio de pago" value={medioPago} onChange={setMedioPago}
          options={MEDIOS_PAGO.map(m => ({ value: m.id, label: m.label }))} />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          El jornal queda Pagado, genera su egreso en Finanzas y ese día se descuenta del cierre semanal.
        </p>
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button
          onClick={() => onConfirm({ empleado_id: empleadoId, nombre, fecha, fechaPago, medioPago })}
          disabled={busy || sinHoras || !empleadoId}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          {busy ? 'Registrando…' : `Confirmar jornal${preview?.total ? ` de ${fmtMoney(preview.total)}` : ''}`}
        </button>
      </div>
    </ModalShell>
  )
}
