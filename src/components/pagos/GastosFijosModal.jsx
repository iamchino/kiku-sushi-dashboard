import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { usePermisos } from '../../context/usePermisos'
import { useProveedores } from '../../hooks/useProveedores'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'
import { catColor, catLabel, fmtFecha, fmtPlata, localDateISO, medioLabel } from '../../lib/finanzas'
import {
  CATEGORIAS_FIJAS, MEDIOS_FIJOS, mesTexto, mesesParaElegir, primerMesSugerido, proximoVencimiento,
  resumenGastosFijos, textoDia, validarGastoFijo,
} from '../../lib/gastosFijos'
import {
  activarGastoFijo, borrarGastoFijo, cargarGastosFijos, generarGastosFijosHoy, guardarGastoFijo,
} from '../../lib/gastosFijosApi'

// Gastos fijos (SQL 60): la lista, el alta y los cambios. Cada gasto fijo se
// carga UNA vez; el sistema crea el pendiente de cada mes en Pagos, con su
// vencimiento. Lo abre Caja → Pagos y Finanzas → Proyección de pagos.
//
// `onCambio` avisa a la pantalla de atrás que puede haber pendientes nuevos.

function formVacio(hoy) {
  return {
    descripcion: '', categoria: 'alquiler', monto: '', dia_vencimiento: '10',
    medio_pago: 'transferencia', proveedor_id: '', notas: '', desde: primerMesSugerido(10, hoy), nuevo: true,
  }
}

function FormGastoFijo({ inicial, proveedores, onCancelar, onGuardado }) {
  const hoy = localDateISO()
  const nuevo = !inicial
  const [form, setForm] = useState(() => inicial
    ? {
        descripcion: inicial.descripcion, categoria: inicial.categoria, monto: String(inicial.monto ?? ''),
        dia_vencimiento: String(inicial.dia_vencimiento), medio_pago: inicial.medio_pago,
        proveedor_id: inicial.proveedor_id || '', notas: inicial.notas || '', desde: inicial.desde, nuevo: false,
      }
    : formVacio(hoy))
  // El primer mes se propone solo según el día, hasta que alguien lo elija.
  const [desdeTocado, setDesdeTocado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (v) => {
    setError(null)
    setForm(f => {
      const n = { ...f, [k]: v }
      if (k === 'dia_vencimiento' && nuevo && !desdeTocado) {
        const d = Number(v)
        if (Number.isInteger(d) && d >= 1 && d <= 31) n.desde = primerMesSugerido(d, hoy)
      }
      return n
    })
  }
  const v = validarGastoFijo(form, hoy)

  const guardar = async () => {
    if (!v.ok) { setError(v.error); return }
    setBusy(true); setError(null)
    try {
      const fila = await guardarGastoFijo(inicial?.id || null, v.datos)
      const gen = await generarGastosFijosHoy({ forzar: true })
      const delMes = gen.detalle.filter(d => d.gasto_fijo_id === fila.id)
      onGuardado(nuevo
        ? (delMes.length > 0
            ? `Listo: «${fila.descripcion}» se carga solo todos los meses. El de ${mesTexto(delMes[0].periodo)} ya está en pendientes, vence el ${fmtFecha(delMes[0].vencimiento)}.`
            : `Listo: «${fila.descripcion}» se carga solo todos los meses. El primero aparece en pendientes el 1 de ${mesTexto(fila.desde)}.`)
        : `«${fila.descripcion}» actualizado. El cambio vale para los meses que vienen; los pendientes que ya estaban se corrigen en Pagos.`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const diaOk = textoDia(form.dia_vencimiento)
  return (
    <div className="space-y-4" data-form-gasto-fijo>
      <button type="button" onClick={onCancelar} className="flex items-center gap-1 text-xs font-semibold"
        style={{ color: 'var(--accent-lift)' }}>
        <ArrowLeft size={13} /> Volver a la lista
      </button>
      <Field label="Descripción" value={form.descripcion} onChange={set('descripcion')} maxLength={120} required
        placeholder="Ej: Alquiler, Autónomos, F931" />
      <p className="-mt-2 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
        Cada mes se le agrega el mes: «{(form.descripcion || 'Alquiler').trim()} · {mesTexto(form.desde || hoy.slice(0, 7))}».
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Categoría" value={form.categoria} onChange={set('categoria')} required
          options={CATEGORIAS_FIJAS.map(c => ({ value: c.id, label: c.label }))} />
        <Select label="Medio de pago previsto" value={form.medio_pago} onChange={set('medio_pago')}
          options={MEDIOS_FIJOS.map(m => ({ value: m.id, label: m.label }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Field label="Monto" value={form.monto} onChange={set('monto')} inputMode="decimal" placeholder="0" required />
          {v.ok && <p data-eco-monto-fijo className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Cada mes por <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(v.datos.monto)}</strong>
          </p>}
        </div>
        <div>
          <Field label="Vence el día" value={form.dia_vencimiento} onChange={set('dia_vencimiento')} inputMode="numeric"
            placeholder="10" required />
          {diaOk && <p data-texto-dia className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Vence {diaOk}</p>}
        </div>
      </div>
      <Select label="Proveedor (opcional)" value={form.proveedor_id} onChange={set('proveedor_id')}
        options={[{ value: '', label: '— Sin proveedor —' },
          ...(proveedores || []).map(p => ({ value: p.id, label: p.razon_social }))]} />
      {nuevo ? (
        <Select label="Primer mes" value={form.desde}
          onChange={(x) => { setDesdeTocado(true); set('desde')(x) }}
          options={mesesParaElegir(hoy)}
          hint="Si lo de este mes ya lo cargaste a mano, elegí el que viene." />
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Se carga desde {mesTexto(form.desde)}. El cambio vale para los meses que vienen: los pendientes que ya se crearon se corrigen en Pagos.
        </p>
      )}
      <TextArea label="Notas (opcional)" value={form.notas} onChange={set('notas')} rows={2}
        placeholder="Se copian en el pendiente de cada mes. Ej: contrato hasta 2028" />
      {error && <p className="text-xs" style={{ color: '#F2708C' }} data-error-gasto-fijo>{error}</p>}
      <button onClick={guardar} disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--cta)' }}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        {nuevo ? 'Guardar gasto fijo' : 'Guardar cambios'}
      </button>
    </div>
  )
}

export default function GastosFijosModal({ onClose, onCambio }) {
  const { puedeEditar } = usePermisos()
  const editable = puedeEditar('pagos') || puedeEditar('finanzas')
  const { proveedores } = useProveedores()
  const [datos, setDatos] = useState(null)
  const [vista, setVista] = useState('lista')       // 'lista' | 'nuevo' | fila (edición)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [borrando, setBorrando] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  const cargar = useCallback(async () => {
    setDatos(await cargarGastosFijos())
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const hoy = localDateISO()
  const lista = useMemo(() => datos?.lista || [], [datos])
  const resumen = useMemo(() => resumenGastosFijos(lista), [lista])

  const pausar = async (g) => {
    setOcupado(g.id); setError(null); setAviso(null)
    try {
      await activarGastoFijo(g.id, !g.activo)
      if (!g.activo) {
        const gen = await generarGastosFijosHoy({ forzar: true })
        if (gen.creados > 0) onCambio?.()
      }
      setAviso(g.activo
        ? `«${g.descripcion}» quedó pausado: no se crean más pendientes hasta que lo reanudes.`
        : `«${g.descripcion}» reanudado: vuelve a cargarse solo desde este mes.`)
      await cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <ModalShell title="Gastos fijos" icon={Repeat} onClose={onClose} maxW="max-w-2xl">
      <div className="p-5 space-y-4" data-gastos-fijos>
        {vista !== 'lista' ? (
          <FormGastoFijo inicial={vista === 'nuevo' ? null : vista} proveedores={proveedores}
            onCancelar={() => setVista('lista')}
            onGuardado={async (msg) => { setVista('lista'); setAviso(msg); await cargar(); onCambio?.() }} />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-md text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Se cargan una vez. El día 1 de cada mes el sistema crea solo el pendiente de cada uno, con su vencimiento.
                Se paga como cualquier pendiente; si el monto cambió, se corrige al pagarlo y los meses que vienen toman ese monto.
              </p>
              {editable && datos?.disponible && (
                <button onClick={() => { setAviso(null); setError(null); setVista('nuevo') }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: 'var(--cta)' }}>
                  <Plus size={13} /> Nuevo gasto fijo
                </button>
              )}
            </div>

            {aviso && (
              <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" data-aviso-gastos-fijos
                style={{ background: 'rgba(63,191,138,0.08)', border: '1px solid rgba(63,191,138,0.2)', color: '#3FBF8A' }}>
                <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" /> {aviso}
              </p>
            )}
            {error && <p className="text-xs" style={{ color: '#F2708C' }}>{error}</p>}

            {datos === null ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
            ) : !datos.disponible ? (
              <p className="text-xs" style={{ color: '#E8A23F' }} data-gastos-fijos-sin-sql>
                Para usar gastos fijos falta correr el SQL 60 en Supabase.
              </p>
            ) : lista.length === 0 ? (
              <p className="py-4 text-center text-xs" style={{ color: 'var(--text-xmuted)' }}>
                Todavía no hay gastos fijos. También se arman desde Registrar pago, con la casilla «Se repite todos los meses».
              </p>
            ) : (
              <>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }} data-resumen-gastos-fijos>
                  {resumen.activos} {resumen.activos === 1 ? 'gasto fijo' : 'gastos fijos'} · <strong style={{ color: 'var(--text-primary)' }}>{fmtPlata(resumen.total)}</strong> por mes
                  {resumen.pausados > 0 && ` · ${resumen.pausados} ${resumen.pausados === 1 ? 'pausado' : 'pausados'}`}
                </p>
                <div className="space-y-1.5">
                  {lista.map(g => {
                    const prox = proximoVencimiento(g, hoy)
                    return (
                      <div key={g.id} data-gasto-fijo={g.descripcion}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2.5"
                        style={{ background: 'var(--bg-input)', opacity: g.activo ? 1 : 0.6 }}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {g.descripcion}
                            {g.proveedor?.razon_social && <span style={{ color: 'var(--text-muted)' }}> · {g.proveedor.razon_social}</span>}
                            {!g.activo && <span className="ml-1.5 text-[10px] font-semibold" style={{ color: '#E8A23F' }}>PAUSADO</span>}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                            <span className="rounded-full px-1.5 py-0.5 font-semibold"
                              style={{ background: `${catColor(g.categoria)}22`, color: catColor(g.categoria) }}>
                              {catLabel(g.categoria)}
                            </span>
                            <span>Vence {textoDia(g.dia_vencimiento)}</span>
                            <span>· {medioLabel(g.medio_pago)}</span>
                            {prox && (
                              <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }} data-proximo>
                                <CalendarClock size={10} /> próximo: {fmtFecha(prox)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtPlata(g.monto)}</span>
                          {editable && (
                            <>
                              <button type="button" title="Corregir" aria-label={`Corregir ${g.descripcion}`}
                                onClick={() => { setAviso(null); setError(null); setVista(g) }}
                                className="rounded-lg p-1.5" style={{ color: 'var(--text-muted)' }}>
                                <Pencil size={13} />
                              </button>
                              <button type="button" disabled={ocupado === g.id}
                                title={g.activo ? 'Pausar: deja de crear los pendientes' : 'Reanudar'}
                                aria-label={g.activo ? `Pausar ${g.descripcion}` : `Reanudar ${g.descripcion}`}
                                onClick={() => pausar(g)} className="rounded-lg p-1.5 disabled:opacity-50" style={{ color: 'var(--text-muted)' }}>
                                {g.activo ? <Pause size={13} /> : <Play size={13} />}
                              </button>
                              <button type="button" title="Borrar" aria-label={`Borrar ${g.descripcion}`}
                                onClick={() => { setAviso(null); setError(null); setBorrando(g) }}
                                className="rounded-lg p-1.5" style={{ color: 'var(--text-muted)' }}>
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {borrando && (
        <ConfirmDelete titulo="Borrar gasto fijo"
          mensaje={`¿Borrás «${borrando.descripcion}»? No se crean más pendientes. Los pagos que ya se crearon quedan como están: si sobra alguno, se anula en Pagos. Para dejarlo de lado un tiempo, conviene pausarlo.`}
          onClose={() => setBorrando(null)}
          onConfirm={async () => {
            await borrarGastoFijo(borrando.id)
            setAviso(`«${borrando.descripcion}» borrado. Los pagos que ya había creado siguen en Pagos.`)
            await cargar()
          }} />
      )}
    </ModalShell>
  )
}
