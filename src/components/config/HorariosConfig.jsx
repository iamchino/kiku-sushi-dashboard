import { useEffect, useState } from 'react'
import { Clock, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, Power } from 'lucide-react'
import {
  fetchAperturas, crearApertura, actualizarApertura, eliminarApertura,
  minToTime, timeToMin,
} from '../../lib/horarios'

const FIELD_STYLE = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// "YYYY-MM-DD" → "viernes 08/07/2026" (sin corrimiento de zona horaria).
function fechaLabel(fecha) {
  const [y, m, d] = String(fecha || '').split('-').map(Number)
  if (!y || !m || !d) return fecha
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIAS[dow]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

// Hoy en hora Argentina como "YYYY-MM-DD" (para el min del input date).
function hoyArg() {
  const arg = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${arg.getFullYear()}-${String(arg.getMonth() + 1).padStart(2, '0')}-${String(arg.getDate()).padStart(2, '0')}`
}

/**
 * Editor de horarios especiales de apertura (ej. días de partido).
 * Cada fila = un día puntual en que el RETIRO EN LOCAL (takeaway) abre antes.
 * La web pública lee estas filas; al pasar la fecha, vuelve solo al horario normal.
 */
export default function HorariosConfig() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)         // { tipo: 'ok'|'error', texto }

  // alta
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('13:00')
  const [nota, setNota] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const { data } = await fetchAperturas({ soloActivas: false })
    setRows(data)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const flash = (tipo, texto) => {
    setMsg({ tipo, texto })
    if (tipo === 'ok') setTimeout(() => setMsg(null), 2200)
  }

  const handleAgregar = async () => {
    if (!fecha) { flash('error', 'Elegí la fecha.'); return }
    const min = timeToMin(hora)
    if (min == null) { flash('error', 'Poné una hora válida (HH:MM).'); return }
    setAddBusy(true); setMsg(null)
    const { error } = await crearApertura({ fecha, canal: 'takeaway', apertura_min: min, nota })
    setAddBusy(false)
    if (error) {
      const dup = /duplicate|unique/i.test(error.message || '')
      flash('error', dup ? 'Ya hay un horario especial para esa fecha.' : (error.message || 'No se pudo guardar.'))
      return
    }
    setFecha(''); setHora('13:00'); setNota('')
    flash('ok', 'Horario especial agregado.')
    cargar()
  }

  const handleHora = async (row, nuevaHora) => {
    const min = timeToMin(nuevaHora)
    if (min == null) return
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, apertura_min: min } : r))
    const { error } = await actualizarApertura(row.id, { apertura_min: min })
    if (error) { flash('error', 'No se pudo actualizar la hora.'); cargar() }
  }

  const handleToggle = async (row) => {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, activo: !r.activo } : r))
    const { error } = await actualizarApertura(row.id, { activo: !row.activo })
    if (error) { flash('error', 'No se pudo cambiar el estado.'); cargar() }
  }

  const handleEliminar = async (row) => {
    if (!window.confirm(`¿Eliminar el horario especial del ${fechaLabel(row.fecha)}?`)) return
    setRows(rs => rs.filter(r => r.id !== row.id))
    const { error } = await eliminarApertura(row.id)
    if (error) { flash('error', 'No se pudo eliminar.'); cargar() }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent)' }}
        >
          <Clock size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Horarios especiales
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Días puntuales (ej. partidos) en que el <b>retiro en local</b> abre antes de las 19:30.
            El delivery no cambia. Al pasar la fecha, vuelve solo al horario normal.
          </p>
        </div>
      </div>

      {msg && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
          style={msg.tipo === 'ok'
            ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }
            : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
        >
          {msg.tipo === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {msg.texto}
        </div>
      )}

      {/* Alta */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          Agregar día especial
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--text-muted)' }}>Fecha</label>
            <input
              type="date" value={fecha} min={hoyArg()}
              onChange={e => setFecha(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none" style={FIELD_STYLE}
            />
          </div>
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--text-muted)' }}>Abre (retiro)</label>
            <input
              type="time" value={hora}
              onChange={e => setHora(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none" style={FIELD_STYLE}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[11px] block mb-1" style={{ color: 'var(--text-muted)' }}>Nota (opcional)</label>
            <input
              type="text" value={nota} placeholder="Ej: Partido Argentina"
              onChange={e => setNota(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={FIELD_STYLE}
            />
          </div>
          <button
            type="button" onClick={handleAgregar} disabled={addBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }}
          >
            {addBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Agregar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            No hay horarios especiales cargados.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(row => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  opacity: row.activo ? 1 : 0.55,
                }}
              >
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {fechaLabel(row.fecha)}
                  </p>
                  {row.nota && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.nota}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Retiro abre</span>
                  <input
                    type="time"
                    defaultValue={minToTime(row.apertura_min)}
                    onBlur={e => handleHora(row, e.target.value)}
                    className="rounded-lg px-2.5 py-1.5 text-sm outline-none" style={FIELD_STYLE}
                  />
                </div>

                <button
                  type="button" onClick={() => handleToggle(row)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={row.activo
                    ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }
                    : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  title={row.activo ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}
                >
                  <Power size={12} /> {row.activo ? 'Activo' : 'Inactivo'}
                </button>

                <button
                  type="button" onClick={() => handleEliminar(row)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: 'var(--bg-input)', color: '#f87171', border: '1px solid var(--border)' }}
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
