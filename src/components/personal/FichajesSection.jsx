import { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, LogIn, LogOut, MapPin, ListChecks } from 'lucide-react'
import { fmtFechaHora } from '../../lib/horas'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

// Log de fichajes de la semana + corrección manual (crear/editar/borrar marcas).
// Toda marca creada/editada acá queda con origen='manual' (auditable).
export default function FichajesSection({ horas, empleados }) {
  const { fichajes, crearFichaje, actualizarFichaje, eliminarFichaje, loading } = horas

  const [filtroEmp, setFiltroEmp] = useState('')
  const [modal, setModal]         = useState(null)   // null | 'nuevo' | fichaje
  const [del, setDel]             = useState(null)

  const visibles = useMemo(
    () => filtroEmp ? fichajes.filter(f => f.empleado_id === filtroEmp) : fichajes,
    [fichajes, filtroEmp],
  )

  const activos = empleados.filter(e => e.activo)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)}
          className="rounded-lg text-sm outline-none px-3 py-2"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">Todos los empleados</option>
          {empleados.map(e => (
            <option key={e.id} value={e.id}>{e.nombre} {e.apellido || ''}</option>
          ))}
        </select>
        <button onClick={() => setModal('nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Marca manual
        </button>
      </div>

      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <ListChecks size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Sin fichajes esta semana</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(f => (
            <div key={f.id} className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: f.tipo === 'entrada' ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.1)' }}>
                  {f.tipo === 'entrada'
                    ? <LogIn size={14} style={{ color: '#22c55e' }} />
                    : <LogOut size={14} style={{ color: '#f87171' }} />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {f.empleado?.nombre} {f.empleado?.apellido || ''}
                    <span className="ml-2 text-xs font-normal capitalize" style={{ color: 'var(--text-muted)' }}>{f.tipo}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] capitalize tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtFechaHora(f.ts)}
                    </span>
                    {f.origen === 'manual' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                        style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>
                        manual
                      </span>
                    )}
                    {f.origen === 'qr' && f.distancia_m != null && (
                      <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-xmuted)' }}>
                        <MapPin size={10} /> {f.distancia_m} m
                      </span>
                    )}
                    {f.punto?.nombre && f.origen === 'qr' && (
                      <span className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>· {f.punto.nombre}</span>
                    )}
                    {f.nota && <span className="text-[10px] italic truncate" style={{ color: 'var(--text-xmuted)' }}>· {f.nota}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setModal(f)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Edit2 size={13} />
                </button>
                <button onClick={() => setDel(f)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FichajeModal
          initial={modal !== 'nuevo' ? modal : null}
          empleados={activos}
          onClose={() => setModal(null)}
          onSave={async (form) => {
            if (modal === 'nuevo') await crearFichaje(form)
            else await actualizarFichaje(modal.id, form)
          }}
        />
      )}

      {del && (
        <ConfirmDelete titulo="Eliminar marca"
          mensaje={`¿Eliminás la marca de ${del.tipo} de ${del.empleado?.nombre || ''} (${fmtFechaHora(del.ts)})? Cambia el cálculo de horas.`}
          onClose={() => setDel(null)} onConfirm={() => eliminarFichaje(del.id)} />
      )}
    </div>
  )
}

function FichajeModal({ initial, empleados, onClose, onSave }) {
  const base = initial ? new Date(initial.ts) : new Date()
  const [empleadoId, setEmpleadoId] = useState(initial?.empleado_id || empleados[0]?.id || '')
  const [tipo, setTipo]             = useState(initial?.tipo || 'entrada')
  const [fecha, setFecha]           = useState(() => {
    const d = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
    return d.toISOString().slice(0, 10)
  })
  const [hora, setHora]             = useState(() => base.toTimeString().slice(0, 5))
  const [nota, setNota]             = useState(initial?.nota || '')
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState(null)

  const handle = async () => {
    if (!empleadoId || !fecha || !hora) { setError('Completá empleado, fecha y hora.'); return }
    setBusy(true); setError(null)
    try {
      const ts = new Date(`${fecha}T${hora}`)  // hora local → instante real
      await onSave({ empleado_id: empleadoId, tipo, ts: ts.toISOString(), nota: nota || null })
      onClose()
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <ModalShell title={initial ? 'Editar marca' : 'Marca manual'} icon={Edit2} onClose={onClose} maxW="max-w-sm">
      <div className="p-5 space-y-4">
        <Select label="Empleado" value={empleadoId} onChange={setEmpleadoId} required
          options={empleados.map(e => ({ value: e.id, label: `${e.nombre} ${e.apellido || ''}`.trim() }))} />
        <Select label="Tipo" value={tipo} onChange={setTipo} required
          options={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" type="date" value={fecha} onChange={setFecha} required />
          <Field label="Hora" type="time" value={hora} onChange={setHora} required />
        </div>
        <TextArea label="Nota (motivo de la corrección)" value={nota} onChange={setNota}
          placeholder="Ej: se olvidó de fichar la salida" rows={2} />
        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
        <button onClick={handle} disabled={busy}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {busy ? 'Guardando…' : 'Guardar marca'}
        </button>
      </div>
    </ModalShell>
  )
}
