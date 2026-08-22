import { useState, useMemo } from 'react'
import {
  Plus, Edit2, Trash2, LogIn, LogOut, MapPin, ListChecks, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Moon,
} from 'lucide-react'
import { fmtFechaHora, fmtHora, fmtMinutos, fmtDiaOperativo } from '../../lib/horas'
import { agruparPorDia } from '../../lib/turnos'
import { ModalShell, Field, Select, TextArea } from '../finanzas/fields'
import ConfirmDelete from '../finanzas/ConfirmDelete'

// Fichajes de la semana en dos vistas:
//   · TURNOS  (por defecto): las marcas ya emparejadas entrada → salida. Un
//     turno que empieza a las 18:00 y termina a las 00:08 es UN solo turno,
//     del día en que empezó, aunque el reloj haya cambiado de fecha.
//   · MARCAS: el log crudo, para corregir una marca puntual.
// Arriba de todo, quién tiene el turno abierto ahora mismo (entró y todavía
// no fichó la salida), con la hora de entrada y cuánto lleva adentro.
// Toda marca creada/editada acá queda con origen='manual' (auditable).
export default function FichajesSection({ horas, empleados }) {
  const {
    fichajes, turnos, turnosAbiertos, semana,
    crearFichaje, actualizarFichaje, eliminarFichaje, loading,
  } = horas

  const [filtroEmp, setFiltroEmp] = useState('')
  const [vista, setVista]         = useState('turnos') // 'turnos' | 'marcas'
  const [modal, setModal]         = useState(null)     // null | 'nuevo' | { fichaje } | { seed }
  const [del, setDel]             = useState(null)

  // El log crudo se pide con margen a los costados de la semana (para no
  // partir los turnos que cruzan la medianoche): acá se recorta a la semana.
  const marcasVisibles = useMemo(() => {
    const desde = Date.parse(semana.inicioISO)
    const hasta = Date.parse(semana.finExclusivoISO)
    return (fichajes || []).filter(f => {
      if (filtroEmp && f.empleado_id !== filtroEmp) return false
      const t = Date.parse(f.ts)
      return t >= desde && t < hasta
    })
  }, [fichajes, filtroEmp, semana.inicioISO, semana.finExclusivoISO])

  const grupos = useMemo(
    () => agruparPorDia((turnos || []).filter(t => !filtroEmp || t.empleado_id === filtroEmp)),
    [turnos, filtroEmp],
  )
  const abiertos = useMemo(
    () => (turnosAbiertos || []).filter(t => !filtroEmp || t.empleado_id === filtroEmp),
    [turnosAbiertos, filtroEmp],
  )
  const activos   = empleados.filter(e => e.activo)
  const vacio     = vista === 'turnos' ? grupos.length === 0 : marcasVisibles.length === 0

  const nombreDe = (t) => `${t.empleado?.nombre || ''} ${t.empleado?.apellido || ''}`.trim() || 'Empleado'

  return (
    <div className="space-y-4">
      {/* ── Turnos abiertos ahora ─────────────────────────────────────────── */}
      {!loading && abiertos.length > 0 && (
        <div className="rounded-xl p-3.5"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold mb-2.5" style={{ color: '#f59e0b' }}>
            <Clock size={13} /> Turnos abiertos · {abiertos.length}
            <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
              — entraron y todavía no ficharon la salida
            </span>
          </p>
          <div className="space-y-2">
            {abiertos.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 flex-wrap"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.14)' }}>
                    <LogIn size={14} style={{ color: '#f59e0b' }} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {nombreDe(t)}
                    </p>
                    <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      Entró <span className="capitalize">{fmtFechaHora(t.entrada)}</span>
                      <span className="ml-1.5 font-semibold" style={{ color: '#f59e0b' }}>
                        · lleva {fmtMinutos(t.transcurrido || 0)}
                      </span>
                    </p>
                    {t.excedido && (
                      <p className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color: '#f87171' }}>
                        <AlertTriangle size={10} /> Hace más de 16 h: seguro se olvidó de fichar la salida
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setModal({ seed: { empleado_id: t.empleado_id, tipo: 'salida' } })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>
                    <LogOut size={12} /> Cargar salida
                  </button>
                  {t.entradaMarca && (
                    <>
                      <IconBtn onClick={() => setModal({ fichaje: t.entradaMarca })} title="Corregir la hora de entrada">
                        <Edit2 size={13} />
                      </IconBtn>
                      <IconBtn danger onClick={() => setDel(t.entradaMarca)} title="Borrar la marca de entrada">
                        <Trash2 size={13} />
                      </IconBtn>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Controles ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)}
            className="rounded-lg text-sm outline-none px-3 py-2"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="">Todos los empleados</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre} {e.apellido || ''}</option>
            ))}
          </select>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {[['turnos', 'Turnos'], ['marcas', 'Marcas sueltas']].map(([id, label]) => (
              <button key={id} onClick={() => setVista(id)}
                className="px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: vista === id ? 'var(--accent-soft)' : 'transparent',
                  color: vista === id ? 'var(--accent-lift)' : 'var(--text-muted)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setModal('nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          <Plus size={14} /> Marca manual
        </button>
      </div>

      {loading ? (
        <div className="space-y-2.5">{[1, 2, 3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : vacio ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <ListChecks size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Sin fichajes esta semana</p>
        </div>
      ) : vista === 'turnos' ? (
        <div className="space-y-4">
          {grupos.map(g => (
            <div key={g.dia}>
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 capitalize"
                style={{ color: 'var(--text-muted)' }}>
                {fmtDiaOperativo(g.dia)}
                <span className="ml-1.5 font-normal normal-case" style={{ color: 'var(--text-xmuted)' }}>
                  · {g.turnos.length} {g.turnos.length === 1 ? 'turno' : 'turnos'}
                </span>
              </p>
              <div className="space-y-2">
                {g.turnos.map(t => (
                  <TurnoCard key={t.id} turno={t} nombre={nombreDe(t)}
                    onEditarMarca={m => setModal({ fichaje: m })}
                    onBorrarMarca={m => setDel(m)}
                    onCargarSalida={() => setModal({ seed: { empleado_id: t.empleado_id, tipo: 'salida' } })} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {marcasVisibles.map(f => (
            <MarcaRow key={f.id} f={f}
              onEditar={() => setModal({ fichaje: f })} onBorrar={() => setDel(f)} />
          ))}
        </div>
      )}

      {modal && (
        <FichajeModal
          initial={modal?.fichaje || null}
          seed={modal?.seed || null}
          empleados={activos}
          onClose={() => setModal(null)}
          onSave={async (form) => {
            if (modal?.fichaje) await actualizarFichaje(modal.fichaje.id, form)
            else await crearFichaje(form)
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

function IconBtn({ children, onClick, title, danger }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded-lg transition-colors"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'rgba(248,113,113,0.1)' : 'var(--bg-hover)'
        if (danger) e.currentTarget.style.color = '#f87171'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--text-muted)'
      }}>
      {children}
    </button>
  )
}

// Un turno = entrada → salida. Se despliega para corregir cada marca por
// separado. El cartelito "+1 día" avisa que la salida cayó después de las 00
// sin que eso parta el turno en dos.
function TurnoCard({ turno: t, nombre, onEditarMarca, onBorrarMarca, onCargarSalida }) {
  const [abierto, setAbierto] = useState(false)
  const problema = t.abierto || t.anomalia
  const color = t.abierto ? '#f59e0b' : t.anomalia ? '#f87171' : '#22c55e'

  return (
    <div className="rounded-xl" style={{ background: 'var(--bg-card)', border: `1px solid ${problema ? `${color}44` : 'var(--border-card)'}` }}>
      <button onClick={() => setAbierto(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}1f` }}>
            <Clock size={14} style={{ color }} />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nombre}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] tabular-nums font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t.entrada ? fmtHora(t.entrada) : '—'} → {t.salida
                  ? fmtHora(t.salida)
                  : <span style={{ color }}>{t.abierto ? 'en curso' : 'sin salida'}</span>}
              </span>
              {t.cruzaMedianoche && (
                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ background: 'var(--bg-active)', color: 'var(--text-muted)' }}
                  title="El turno terminó después de la medianoche: sigue siendo el mismo turno de este día">
                  <Moon size={9} /> +1 día
                </span>
              )}
              {t.anomalia === 'sin_entrada' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>salida sin entrada</span>
              )}
              {t.anomalia === 'sin_salida' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                  style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>se olvidó la salida</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold tabular-nums" style={{ color: t.salida ? 'var(--text-primary)' : color }}>
            {t.salida ? fmtMinutos(t.minutos) : t.abierto ? `${fmtMinutos(t.transcurrido || 0)}…` : '—'}
          </span>
          {abierto ? <ChevronDown size={14} style={{ color: 'var(--text-xmuted)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--text-xmuted)' }} />}
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-3 space-y-1.5">
          {[t.entradaMarca, t.salidaMarca].filter(Boolean).map(m => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-input)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                {m.tipo === 'entrada'
                  ? <LogIn size={13} style={{ color: '#22c55e' }} />
                  : <LogOut size={13} style={{ color: '#f87171' }} />}
                <div className="min-w-0">
                  <p className="text-[11px] font-medium capitalize tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {m.tipo} · {fmtFechaHora(m.ts)}
                  </p>
                  <MarcaMeta f={m} />
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <IconBtn onClick={() => onEditarMarca(m)} title="Corregir esta marca"><Edit2 size={12} /></IconBtn>
                <IconBtn danger onClick={() => onBorrarMarca(m)} title="Borrar esta marca"><Trash2 size={12} /></IconBtn>
              </div>
            </div>
          ))}
          {!t.salida && (
            <button onClick={onCargarSalida}
              className="w-full rounded-lg py-1.5 text-[11px] font-semibold transition-colors"
              style={{ color, border: `1px dashed ${color}66` }}>
              Cargar la salida que falta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MarcaMeta({ f }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {f.origen === 'manual' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
          style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>manual</span>
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
  )
}

// Log crudo: una fila por marca, como estaba.
function MarcaRow({ f, onEditar, onBorrar }) {
  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
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
            <MarcaMeta f={f} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconBtn onClick={onEditar} title="Corregir esta marca"><Edit2 size={13} /></IconBtn>
        <IconBtn danger onClick={onBorrar} title="Borrar esta marca"><Trash2 size={13} /></IconBtn>
      </div>
    </div>
  )
}

function FichajeModal({ initial, seed, empleados, onClose, onSave }) {
  const base = initial ? new Date(initial.ts) : new Date()
  const [empleadoId, setEmpleadoId] = useState(initial?.empleado_id || seed?.empleado_id || empleados[0]?.id || '')
  const [tipo, setTipo]             = useState(initial?.tipo || seed?.tipo || 'entrada')
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
        {tipo === 'salida' && (
          <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            Si el turno terminó después de la medianoche, cargá la fecha del día
            siguiente: el turno igual queda contado en el día en que empezó.
          </p>
        )}
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
