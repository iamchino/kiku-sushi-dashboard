import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, Save, Loader2, CheckCircle2, AlertTriangle,
  Sun, Moon, Plus, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Configuración de los horarios de reserva de la web.
 *
 * Dos tablas (lectura pública, escritura admin):
 *   • reservas_dias   (7 filas dow 0..6): qué franjas abre cada día
 *                      (mediodía / noche). El día "abre" si alguna es true.
 *   • reservas_config (fila única id=1): los turnos (slots) de cada franja.
 *
 * El form de reservas de la web lee exactamente esto. Un día sin franjas no
 * toma reservas; un turno que se saca de acá desaparece del form.
 */

// dow 0=Dom .. 6=Sáb. Los ordenamos Lun→Dom para que se lea natural.
const DIAS = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' },
]

// "HH:MM" válido (00:00–23:59)
const ES_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const ordenarSlots = (arr) =>
  [...new Set(arr)].filter(s => ES_HHMM.test(s)).sort()

export default function ReservasConfig() {
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState([])          // [{dow, mediodia, noche}]
  const [cfg, setCfg] = useState({ mediodia_slots: [], noche_slots: [], orden_llegada_slots: [] })
  const [saveState, setSaveState] = useState('idle')  // idle|saving|ok|error
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [d, c] = await Promise.all([
        supabase.from('reservas_dias').select('*'),
        supabase.from('reservas_config').select('*').eq('id', 1).maybeSingle(),
      ])
      if (!alive) return
      if (d.error) setError(d.error.message)
      if (c.error) setError(c.error.message)

      // Aseguramos las 7 filas aunque la tabla venga incompleta.
      const porDow = new Map((d.data || []).map(r => [r.dow, r]))
      setDias(DIAS.map(({ dow }) => ({
        dow,
        mediodia: Boolean(porDow.get(dow)?.mediodia),
        noche: Boolean(porDow.get(dow)?.noche),
      })))

      setCfg({
        mediodia_slots: c.data?.mediodia_slots || [],
        noche_slots: c.data?.noche_slots || [],
        orden_llegada_slots: c.data?.orden_llegada_slots || [],
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const setDia = (dow, franja, val) =>
    setDias(ds => ds.map(d => (d.dow === dow ? { ...d, [franja]: val } : d)))

  const addSlot = (key, hhmm) => {
    if (!ES_HHMM.test(hhmm)) { setError(`"${hhmm}" no es una hora válida (HH:MM, 24 h).`); return }
    setError(null)
    setCfg(c => ({ ...c, [key]: ordenarSlots([...c[key], hhmm]) }))
  }
  const removeSlot = (key, hhmm) =>
    setCfg(c => ({ ...c, [key]: c[key].filter(s => s !== hhmm) }))

  // Avisos de coherencia (no bloquean, solo orientan).
  const avisos = useMemo(() => {
    const out = []
    const algunMediodia = dias.some(d => d.mediodia)
    const algunaNoche = dias.some(d => d.noche)
    if (algunMediodia && cfg.mediodia_slots.length === 0)
      out.push('Tenés días con mediodía habilitado pero no cargaste ningún turno de mediodía: esos días no van a mostrar horarios.')
    if (algunaNoche && cfg.noche_slots.length === 0 && cfg.orden_llegada_slots.length === 0)
      out.push('Tenés noches habilitadas pero sin turnos de noche cargados.')
    return out
  }, [dias, cfg])

  const guardar = async () => {
    setSaveState('saving'); setError(null)
    try {
      const upDias = supabase.from('reservas_dias').upsert(
        dias.map(d => ({ dow: d.dow, mediodia: d.mediodia, noche: d.noche })),
        { onConflict: 'dow' },
      )
      const upCfg = supabase.from('reservas_config').upsert({
        id: 1,
        mediodia_slots: ordenarSlots(cfg.mediodia_slots),
        noche_slots: ordenarSlots(cfg.noche_slots),
        orden_llegada_slots: ordenarSlots(cfg.orden_llegada_slots),
        updated_at: new Date().toISOString(),
      })
      const [rd, rc] = await Promise.all([upDias, upCfg])
      if (rd.error) throw rd.error
      if (rc.error) throw rc.error
      setSaveState('ok')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (err) {
      setSaveState('error')
      setError(err.message || 'No se pudo guardar.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)' }

  return (
    <div className="space-y-5">
      {/* Explicación */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ ...card, color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Horarios de reserva.</strong> Elegí qué días
          abren para reservar y en qué franja: <strong>mediodía</strong>, <strong>noche</strong>, o las dos.
          Los turnos (horas puntuales) de cada franja se editan más abajo y valen para todos los días
          que tengan esa franja. Un día sin franjas no toma reservas.
        </p>
      </div>

      {/* Días */}
      <div className="rounded-xl p-4 space-y-1" style={card}>
        <div className="flex items-center gap-2 mb-2">
          <CalendarClock size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Franjas por día
          </p>
        </div>
        {/* Encabezado */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 pb-1">
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-center w-20" style={{ color: 'var(--text-xmuted)' }}>Mediodía</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-center w-20" style={{ color: 'var(--text-xmuted)' }}>Noche</span>
        </div>
        {dias.map(d => {
          const cerrado = !d.mediodia && !d.noche
          return (
            <div key={d.dow} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5 rounded-lg"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: cerrado ? 'var(--text-xmuted)' : 'var(--text-primary)' }}>
                  {DIAS.find(x => x.dow === d.dow)?.label}
                </span>
                {cerrado && <span className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>cerrado</span>}
              </div>
              <div className="w-20 flex justify-center">
                <Toggle on={d.mediodia} onClick={() => setDia(d.dow, 'mediodia', !d.mediodia)} icon={Sun} />
              </div>
              <div className="w-20 flex justify-center">
                <Toggle on={d.noche} onClick={() => setDia(d.dow, 'noche', !d.noche)} icon={Moon} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Turnos de cada franja */}
      <div className="grid md:grid-cols-2 gap-4">
        <SlotEditor
          titulo="Turnos de mediodía" icon={Sun}
          slots={cfg.mediodia_slots}
          onAdd={h => addSlot('mediodia_slots', h)}
          onRemove={h => removeSlot('mediodia_slots', h)}
          placeholder="13:00"
        />
        <SlotEditor
          titulo="Turnos de noche" icon={Moon}
          slots={cfg.noche_slots}
          onAdd={h => addSlot('noche_slots', h)}
          onRemove={h => removeSlot('noche_slots', h)}
          placeholder="20:30"
        />
      </div>

      {/* Orden de llegada (noche) */}
      <SlotEditor
        titulo="Noche · por orden de llegada (sin mesa fija)" icon={Moon}
        slots={cfg.orden_llegada_slots}
        onAdd={h => addSlot('orden_llegada_slots', h)}
        onRemove={h => removeSlot('orden_llegada_slots', h)}
        placeholder="22:30"
        hint="Estos horarios se pueden reservar pero quedan como orden de llegada, sin mesa asignada."
      />

      {avisos.map((a, i) => (
        <div key={i} className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#f59e0b' }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {a}
        </div>
      ))}

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
        <button type="button" onClick={guardar} disabled={saveState === 'saving'}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}

function Toggle({ on, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="relative w-12 h-7 rounded-full transition-colors shrink-0"
      style={{ background: on ? 'var(--accent)' : 'var(--bg-input)', border: '1px solid var(--border)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all flex items-center justify-center"
        style={{ left: on ? '24px' : '4px' }}>
        {Icon && <Icon size={11} style={{ color: on ? 'var(--accent)' : 'var(--text-xmuted)' }} />}
      </span>
    </button>
  )
}

function SlotEditor({ titulo, icon: Icon, slots, onAdd, onRemove, placeholder, hint }) {
  const [nuevo, setNuevo] = useState('')
  const confirmar = () => {
    const v = nuevo.trim()
    if (!v) return
    onAdd(v)
    setNuevo('')
  }
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} style={{ color: 'var(--accent)' }} />}
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{titulo}</p>
      </div>
      {hint && <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>{hint}</p>}

      {slots.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>Sin turnos cargados.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {slots.map(s => (
            <span key={s} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs tabular-nums"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {s}
              <button type="button" onClick={() => onRemove(s)} aria-label={`Quitar ${s}`}
                className="p-0.5 rounded transition-colors" style={{ color: 'var(--text-muted)' }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="time"
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
          placeholder={placeholder}
          className="px-3 py-2 rounded-lg text-sm outline-none tabular-nums"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <button type="button" onClick={confirmar}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
          <Plus size={13} /> Agregar
        </button>
      </div>
    </div>
  )
}
