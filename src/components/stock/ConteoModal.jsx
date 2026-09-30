import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, ClipboardCheck, Search } from 'lucide-react'
import { normalizeSearch } from '../../utils/normalize'

const fmt = (n) => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

// Conteo físico: al cierre del servicio (rolls que sobraron) o de inventario.
// Se carga solo lo que se contó; lo que queda vacío no se toca. La base deja
// cada ítem en lo contado y registra la diferencia como ajuste.
export default function ConteoModal({ open, onClose, items = [], titulo, notaDefault, onConfirm }) {
  const [contados, setContados] = useState({})
  const [nota, setNota] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (!open) return
    setContados({})
    setNota(notaDefault || 'Conteo')
    setSearch('')
    setError(null)
    setResultado(null)
  }, [open, notaDefault])

  const visibles = useMemo(() => {
    const q = normalizeSearch(search)
    const list = q ? items.filter(i => normalizeSearch(i.nombre).includes(q)) : items
    return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [items, search])

  const cargados = Object.entries(contados).filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (cargados.length === 0) { setError('Cargá al menos un conteo.'); return }
    if (cargados.some(([, v]) => parseFloat(v) < 0)) { setError('El conteo no puede ser negativo.'); return }
    setSaving(true)
    setError(null)
    const res = await onConfirm(
      cargados.map(([stock_id, v]) => ({ stock_id, contado: parseFloat(v) })),
      nota.trim(),
    )
    setSaving(false)
    if (res?.error) { setError(res.error.message || 'No se pudo guardar el conteo.'); return }
    setResultado(res?.data || [])
  }

  const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
  const conDiferencia = (resultado || []).filter(r => Number(r.diferencia) !== 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} style={{ color: 'var(--accent-lift)' }} />
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {resultado ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Conteo guardado: {resultado.length} ítem{resultado.length === 1 ? '' : 's'}.
              {conDiferencia.length === 0 ? ' Todo coincidía con el sistema.' : ` ${conDiferencia.length} con diferencia:`}
            </p>
            {conDiferencia.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {conDiferencia.map(r => {
                  const d = Number(r.diferencia)
                  return (
                    <div key={r.stock_id} className="flex items-center justify-between px-4 py-2 text-xs" style={{ borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{r.nombre}</span>
                      <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        sistema {fmt(r.esperado)} · contado {fmt(r.contado)} ·{' '}
                        <b style={{ color: d < 0 ? '#ef4444' : '#22c55e' }}>{d > 0 ? '+' : ''}{fmt(d)}</b>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
              Negativo = faltó (merma, porciones de más, algo que no se cargó). Positivo = sobró.
            </p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            <div className="px-5 pt-4 space-y-3 flex-shrink-0">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Cargá lo que contaste. Lo que dejes vacío no se modifica.
              </p>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
            </div>

            <div className="px-5 py-3 overflow-y-auto flex-1 space-y-1.5">
              {visibles.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-xmuted)' }}>No hay ítems para contar</p>
              )}
              {visibles.map(i => {
                const v = contados[i.id] ?? ''
                const actual = parseFloat(i.stock_actual) || 0
                const dif = v !== '' && !isNaN(parseFloat(v)) ? parseFloat(v) - actual : null
                return (
                  <div key={i.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{i.nombre}</p>
                      <p className="text-[10px] tabular-nums" style={{ color: actual < 0 ? '#ef4444' : 'var(--text-xmuted)' }}>
                        Sistema: {fmt(actual)} {i.unidad}
                      </p>
                    </div>
                    {dif !== null && dif !== 0 && (
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: dif < 0 ? '#ef4444' : '#22c55e' }}>
                        {dif > 0 ? '+' : ''}{fmt(dif)}
                      </span>
                    )}
                    <input type="number" inputMode="decimal" step="any" min="0" value={v}
                      onChange={e => setContados(c => ({ ...c, [i.id]: e.target.value }))}
                      placeholder="—"
                      className="w-20 px-2 py-1.5 rounded text-sm text-right outline-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                )
              })}
            </div>

            <div className="px-5 pb-5 pt-3 space-y-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota del conteo"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
              {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancelar</button>
                <button type="submit" disabled={saving || cargados.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
                  {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : `Guardar conteo (${cargados.length})`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
