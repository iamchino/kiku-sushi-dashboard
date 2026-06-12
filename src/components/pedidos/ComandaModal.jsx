import { useEffect, useMemo, useState } from 'react'
import { X, Printer, Loader2, CheckCircle2, AlertTriangle, ListChecks } from 'lucide-react'
import { printComanda } from '../../lib/printing'

/**
 * Modal para imprimir una comanda eligiendo QUÉ ítems mandar a cocina.
 * Sirve para reimprimir solo algunos ítems (ej. una "copa dulce" suelta)
 * sin reimprimir todo el pedido.
 *
 * Props:
 *  - open, onClose
 *  - pedido, items   (items = pedido_items)
 *  - tituloRonda     (opcional) etiqueta para la comanda (ej. "RONDA ADICIONAL")
 */
export default function ComandaModal({ open, onClose, pedido, items = [], tituloRonda = '' }) {
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [nota, setNota] = useState('')
  const [printing, setPrinting] = useState(false)
  const [resultado, setResultado] = useState(null)

  // Al abrir: por defecto todos los ítems tildados.
  useEffect(() => {
    if (!open) return
    setSeleccion(new Set(items.map(i => i.id)))
    setNota('')
    setResultado(null)
    setPrinting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pedido?.id])

  const seleccionIds = useMemo(() => [...seleccion], [seleccion])

  if (!open || !pedido) return null

  const toggle = (id) => {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const todos = () => setSeleccion(new Set(items.map(i => i.id)))
  const ninguno = () => setSeleccion(new Set())

  const handleImprimir = async () => {
    const elegidos = items.filter(i => seleccion.has(i.id))
    if (elegidos.length === 0) { setResultado({ tipo: 'error', texto: 'Elegí al menos un ítem.' }); return }
    setPrinting(true); setResultado(null)
    const res = await printComanda({
      ...pedido,
      pedido_items: elegidos.map(i => ({ ...i })),
      notas: nota.trim() || pedido.notas || null,
      _ronda_label: tituloRonda || null,
    })
    setPrinting(false)
    if (!res?.ok) {
      setResultado({ tipo: 'error', texto: 'No se pudo imprimir la comanda. Revisá la impresora.' })
      return
    }
    if (res.via === 'browser' && res.remoteFailed) {
      setResultado({ tipo: 'warn', texto: 'La impresora de red no respondió. Se abrió el diálogo del navegador.' })
      return
    }
    setResultado({ tipo: 'ok', texto: res.via === 'remote' ? 'Comanda enviada a la impresora.' : 'Se abrió el diálogo de impresión.' })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={printing ? undefined : onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Printer size={16} style={{ color: 'var(--accent-lift)' }} />
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Imprimir comanda</p>
          </div>
          <button type="button" onClick={onClose} disabled={printing} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
              Ítems a comandar ({seleccionIds.length}/{items.length})
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={todos} className="text-[11px] font-semibold" style={{ color: 'var(--accent-lift)' }}>Todos</button>
              <button type="button" onClick={ninguno} className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Ninguno</button>
            </div>
          </div>

          <div className="space-y-1 rounded-lg p-1.5 max-h-64 overflow-y-auto" style={{ border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
            {items.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-xmuted)' }}>El pedido no tiene ítems.</p>
            ) : items.map(item => {
              const checked = seleccion.has(item.id)
              return (
                <label key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>
                    {item.cantidad}× {item.nombre}
                    {item.notas && <span className="block text-[10px] italic" style={{ color: 'var(--text-muted)' }}>Nota: {item.notas}</span>}
                  </span>
                  {item.enviado_cocina && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>ya enviado</span>
                  )}
                </label>
              )
            })}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Nota para cocina (opcional)</label>
            <input
              type="text"
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Ej: para la mesa que pidió sin azúcar"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {resultado && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
              style={
                resultado.tipo === 'ok' ? { background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                : resultado.tipo === 'warn' ? { background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }
                : { background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }
              }>
              {resultado.tipo === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              {resultado.texto}
            </div>
          )}
        </div>

        <div className="p-5 pt-0">
          <button
            type="button"
            onClick={handleImprimir}
            disabled={printing || seleccionIds.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {printing ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
            Imprimir comanda ({seleccionIds.length})
          </button>
        </div>
      </div>
    </div>
  )
}
