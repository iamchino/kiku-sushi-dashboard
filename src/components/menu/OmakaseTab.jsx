import { useEffect, useState } from 'react'
import { Utensils, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Editor del precio del Omakase de la web pública.
 * Tabla web_config (fila única id=1): columna omakase_precio (entero, en pesos).
 * El dueño cambia el precio por persona desde /menu → tab "Omakase".
 * La web lo muestra en /omakase, el showcase del home y el selector de reserva.
 */
const DEFAULT_PRECIO = 70000

// 70000 → "70.000" (formato argentino)
const fmt = (n) => Number(n || 0).toLocaleString('es-AR')

export default function OmakaseTab() {
  const [loading, setLoading] = useState(true)
  const [precio, setPrecio] = useState(DEFAULT_PRECIO)
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('web_config')
      .select('omakase_precio')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message)
        if (data?.omakase_precio != null) setPrecio(Number(data.omakase_precio))
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const valido = Number.isFinite(precio) && precio > 0

  const guardar = async () => {
    if (!valido) {
      setError('Ingresá un precio válido (mayor a 0).')
      setSaveState('error')
      return
    }
    setSaveState('saving'); setError(null)
    const { error: err } = await supabase
      .from('web_config')
      .upsert({ id: 1, omakase_precio: Math.round(precio), updated_at: new Date().toISOString() })
    if (err) {
      setSaveState('error')
      setError(err.message || 'No se pudo guardar.')
      return
    }
    setSaveState('ok')
    setTimeout(() => setSaveState('idle'), 1800)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" />
        Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Explicación */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Precio del Omakase.</strong> Es el precio por persona
          que muestra la web pública: en la página del Omakase, en la sección destacada del inicio y en el
          selector de reservas. Cambialo acá y se actualiza en todos lados.
        </p>
      </div>

      {/* Precio */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Utensils size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Precio por persona
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            min="0"
            step="500"
            value={Number.isFinite(precio) ? precio : ''}
            onChange={e => setPrecio(e.target.value === '' ? NaN : Number(e.target.value))}
            placeholder="70000"
            className="w-40 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>por persona</span>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Escribí el número sin puntos ni símbolos (ej. 70000).
        </p>
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Vista previa</p>
        <div
          className="rounded-lg px-4 py-3 text-center"
          style={{ background: '#e7c98f', color: '#2a1d0e' }}
        >
          <span className="text-lg font-semibold">${valido ? fmt(precio) : '—'}</span>
          <span className="text-[12px]"> por persona</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={saveState === 'saving' || !valido}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </div>
    </div>
  )
}
