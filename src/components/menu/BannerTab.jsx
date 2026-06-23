import { useEffect, useState } from 'react'
import { Megaphone, Save, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Editor de la barra de anuncio ("segundo header") de la web pública.
 * Tabla web_config (fila única id=1): anuncio_texto + anuncio_activo.
 * El dueño cambia el texto y decide si se muestra o no, desde /menu.
 */
export default function BannerTab() {
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('web_config')
      .select('anuncio_texto, anuncio_activo')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message)
        setTexto(data?.anuncio_texto || '')
        setActivo(Boolean(data?.anuncio_activo))
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const guardar = async () => {
    setSaveState('saving'); setError(null)
    const { error: err } = await supabase
      .from('web_config')
      .upsert({ id: 1, anuncio_texto: texto.trim(), anuncio_activo: activo, updated_at: new Date().toISOString() })
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
          <strong style={{ color: 'var(--text-primary)' }}>Barra de anuncio.</strong> Es la franja que aparece
          arriba de todo en la web pública. Sirve para promos o avisos
          (ej. “15% de descuento en toda la carta pagando en efectivo”). Podés cambiar el texto
          y prenderla o apagarla cuando quieras.
        </p>
      </div>

      {/* Visibilidad */}
      <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          {activo
            ? <Eye size={16} style={{ color: '#34d399' }} />
            : <EyeOff size={16} style={{ color: 'var(--text-muted)' }} />}
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {activo ? 'Visible en la web' : 'Oculta'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {activo ? 'Los clientes ven la barra ahora mismo.' : 'La barra no se muestra.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActivo(v => !v)}
          className="relative w-12 h-7 rounded-full transition-colors shrink-0"
          style={{ background: activo ? 'var(--accent)' : 'var(--bg-input)', border: '1px solid var(--border)' }}
          aria-pressed={activo}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: activo ? '24px' : '4px' }}
          />
        </button>
      </div>

      {/* Texto */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Megaphone size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Texto del anuncio
          </p>
        </div>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={2}
          maxLength={160}
          placeholder="15% de descuento en toda la carta pagando en efectivo"
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <p className="text-[10px] text-right" style={{ color: 'var(--text-xmuted)' }}>{texto.length}/160</p>
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Vista previa</p>
        <div
          className="rounded-lg px-4 py-2 text-center text-[12px] font-medium tracking-wide"
          style={{ background: '#e7c98f', color: '#2a1d0e', opacity: activo ? 1 : 0.4 }}
        >
          {texto.trim() || 'Tu anuncio aparecerá acá'}
        </div>
        {!activo && (
          <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            (Está apagada: así se vería si la prendés.)
          </p>
        )}
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
          disabled={saveState === 'saving'}
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
