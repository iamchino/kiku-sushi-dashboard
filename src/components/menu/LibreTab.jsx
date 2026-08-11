import { useEffect, useState } from 'react'
import { Infinity as InfinityIcon, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Editor del Kiku Libre y el servicio de mesa de la web pública.
 * Tabla web_config (fila única id=1). Antes estos valores estaban hardcodeados
 * en el código de la web; ahora se cambian acá y la web los toma sola.
 *
 * Dónde aparece cada cosa:
 *  · precio         → /sushi-libre (hero), showcase del inicio, form de reservas
 *  · seña           → /sushi-libre (info + CTA), form de reservas
 *  · multa          → /sushi-libre (política anti-desperdicio)
 *  · nota de pago   → /sushi-libre (bajo el precio)
 *  · cubierto       → carta online, especiales, form de reservas
 *  · texto del agua → pie legal de carta, especiales y /sushi-libre
 */
const DEFAULTS = {
  libre_precio: 53500,
  libre_sena: 20000,
  libre_multa_pieza: 1000,
  libre_pago_nota: 'Efectivo o transferencia · Otro medio de pago consultar',
  cubierto_precio: 3500,
  agua_texto: 'Este establecimiento garantiza a cada comensal un vaso de agua potable de 375 ml sin cargo.',
}

const fmt = (n) => Number(n || 0).toLocaleString('es-AR')

function Money({ label, hint, value, onChange }) {
  return (
    <div className="rounded-xl p-4 space-y-1.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
        <input
          type="number" min="0" step="500" value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-36 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>→ se muestra “${fmt(value)}”</span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>{hint}</p>
    </div>
  )
}

export default function LibreTab() {
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(DEFAULTS)
  const [saveState, setSaveState] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('web_config')
      .select('libre_precio, libre_sena, libre_multa_pieza, libre_pago_nota, cubierto_precio, agua_texto')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) {
          // Columnas inexistentes = migración sin correr. Se avisa claro.
          setError(err.message?.includes('column')
            ? 'Falta correr la migración del Kiku Libre en Supabase (SQL_EDITOR_LIBRE.sql).'
            : err.message)
        } else if (data) {
          setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) }))
        }
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))
  const valido = Number(form.libre_precio) > 0 && Number(form.libre_sena) >= 0
    && Number(form.libre_multa_pieza) >= 0 && Number(form.cubierto_precio) >= 0
    && String(form.agua_texto).trim().length > 0

  const guardar = async () => {
    if (!valido) { setError('Revisá los valores: el precio del Libre tiene que ser mayor a 0 y el texto del agua no puede quedar vacío.'); setSaveState('error'); return }
    setSaveState('saving'); setError(null)
    const { error: err } = await supabase.from('web_config').upsert({
      id: 1,
      libre_precio: Math.round(Number(form.libre_precio)),
      libre_sena: Math.round(Number(form.libre_sena)),
      libre_multa_pieza: Math.round(Number(form.libre_multa_pieza)),
      libre_pago_nota: String(form.libre_pago_nota).trim(),
      cubierto_precio: Math.round(Number(form.cubierto_precio)),
      agua_texto: String(form.agua_texto).trim(),
      updated_at: new Date().toISOString(),
    })
    if (err) { setSaveState('error'); setError(err.message || 'No se pudo guardar.'); return }
    setSaveState('ok')
    setTimeout(() => setSaveState('idle'), 1800)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Kiku Libre y servicio de mesa.</strong> Estos valores
          se muestran en la web pública — el Libre, la carta online, los especiales y el form de reservas —
          siempre desde acá, así quedan iguales en todos lados. Guardá y la web se actualiza sola.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <Money label="Precio del Kiku Libre (por persona)" value={form.libre_precio} onChange={set('libre_precio')}
        hint="Hero de /sushi-libre, sección del inicio y form de reservas. No incluye bebida." />
      <Money label="Seña por persona" value={form.libre_sena} onChange={set('libre_sena')}
        hint="Para reservar el Libre y los menús de precio fijo. No reembolsable si no asisten." />
      <Money label="Multa por pieza sin consumir" value={form.libre_multa_pieza} onChange={set('libre_multa_pieza')}
        hint="Política anti-desperdicio de /sushi-libre." />
      <Money label="Servicio de mesa / cubierto (por persona)" value={form.cubierto_precio} onChange={set('cubierto_precio')}
        hint="Solo a la carta de salón. Carta online, especiales y form de reservas." />

      <div className="rounded-xl p-4 space-y-1.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Nota de pago del Libre</label>
        <input value={form.libre_pago_nota} onChange={e => set('libre_pago_nota')(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>Aparece debajo del precio en /sushi-libre.</p>
      </div>

      <div className="rounded-xl p-4 space-y-1.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Texto legal del vaso de agua</label>
        <textarea rows={2} value={form.agua_texto} onChange={e => set('agua_texto')(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
          Pie legal de la carta, los especiales y el Libre. Es una exigencia normativa: no lo dejes vacío.
        </p>
      </div>

      <button onClick={guardar} disabled={saveState === 'saving' || !valido}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
        {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" />
          : saveState === 'ok' ? <CheckCircle2 size={14} /> : <Save size={14} />}
        {saveState === 'saving' ? 'Guardando…' : saveState === 'ok' ? 'Guardado' : 'Guardar cambios'}
      </button>
      <p className="text-[11px] -mt-2" style={{ color: 'var(--text-xmuted)' }}>
        <InfinityIcon size={11} className="inline mr-1" />
        La web toma los cambios al recargarse; no hace falta deploy.
      </p>
    </div>
  )
}
