import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// White-label: la identidad del dashboard sale de acá, no del código.
// Cambiá el nombre y el color y el sistema entero se re-tiñe — es lo que
// permite instalarlo para otro gastronómico sin tocar una línea.
const DEFAULTS = { negocio_nombre: 'KIKU SUSHI', negocio_subtitulo: 'Sistema de gestión', negocio_color: '#2a1d3d', banco_cuenta: '' }

export default function NegocioTab() {
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('web_config')
      .select('negocio_nombre, negocio_subtitulo, negocio_color, banco_cuenta')
      .eq('id', 1).maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) setError(err.message?.includes('column')
          ? 'Falta correr la migración de dominios en Supabase (SQL_EDITOR_DOMINIOS.sql).'
          : err.message)
        else if (data) setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) }))
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const colorValido = /^#[0-9a-fA-F]{6}$/.test(form.negocio_color)
  const valido = form.negocio_nombre.trim().length > 0 && colorValido

  const guardar = async () => {
    setSaveState('saving'); setError(null)
    const { error: err } = await supabase.from('web_config').upsert({
      id: 1,
      negocio_nombre: form.negocio_nombre.trim(),
      negocio_subtitulo: form.negocio_subtitulo.trim(),
      negocio_color: form.negocio_color.toLowerCase(),
      banco_cuenta: form.banco_cuenta.trim() || null,
      updated_at: new Date().toISOString(),
    })
    if (err) { setSaveState('error'); setError(err.message); return }
    setSaveState('ok')
    setTimeout(() => window.location.reload(), 900)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <p><strong style={{ color: 'var(--text-primary)' }}>Identidad del negocio.</strong> El nombre aparece en
        la barra lateral y el color tiñe los botones y acentos de todo el dashboard. Al guardar, la página se
        recarga para aplicar el tema.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Nombre</label>
          <input value={form.negocio_nombre} onChange={set('negocio_nombre')}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            La última palabra va con el color de acento (KIKU <span style={{ color: 'var(--accent-lift)' }}>SUSHI</span>).
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Subtítulo</label>
          <input value={form.negocio_subtitulo} onChange={set('negocio_subtitulo')}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Cuenta bancaria</label>
          <input value={form.banco_cuenta} onChange={set('banco_cuenta')} placeholder="Ej: Kiku SAS — Galicia"
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
            De esta cuenta salen las transferencias del negocio. Aparece al registrar un pago por transferencia.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Color de acento</label>
          <div className="mt-1.5 flex items-center gap-3">
            <input type="color" value={colorValido ? form.negocio_color : '#2a1d3d'}
              onChange={set('negocio_color')}
              className="w-10 h-10 rounded-lg cursor-pointer" style={{ border: '1px solid var(--border)', background: 'transparent' }} />
            <input value={form.negocio_color} onChange={set('negocio_color')} placeholder="#2a1d3d"
              className="w-32 rounded-lg px-3 py-2 text-sm outline-none font-mono"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            {!colorValido && <span className="text-xs" style={{ color: '#f59e0b' }}>Formato: #rrggbb</span>}
          </div>
        </div>
      </div>

      <button onClick={guardar} disabled={saveState === 'saving' || !valido}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
        {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" />
          : saveState === 'ok' ? <CheckCircle2 size={14} /> : <Save size={14} />}
        {saveState === 'saving' ? 'Guardando…' : saveState === 'ok' ? 'Guardado, recargando…' : 'Guardar identidad'}
      </button>
    </div>
  )
}
