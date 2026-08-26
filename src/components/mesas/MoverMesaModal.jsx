import { useEffect, useMemo, useState } from 'react'
import { X, ArrowRightLeft, Loader2, AlertCircle, Users, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Elegir a qué mesa se muda el pedido abierto.
 *
 * Se listan SOLO las mesas libres (una mesa no puede tener dos pedidos
 * abiertos), de todos los salones y agrupadas por salón: a veces el cambio es
 * de adentro a la vereda, no dentro del mismo salón.
 *
 * Las mesas se leen acá directamente porque el panel solo conoce las del
 * salón que se está mirando.
 */
export default function MoverMesaModal({ open, mesaActual, personas, onClose, onMover }) {
  const [mesas, setMesas]   = useState([])
  const [cargando, setCargando] = useState(false)
  const [destino, setDestino]   = useState(null)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!open) { setDestino(null); setError(null); setBusy(false); return }
    let vivo = true
    setCargando(true)
    ;(async () => {
      // v_mesas_estado ya trae el estado calculado (libre / ocupada / …) y el
      // nombre del salón. mesa_grupo_id no viene en la vista: se pide aparte
      // para no ofrecer una mesa que está unida a otra.
      const [vista, crudas] = await Promise.all([
        supabase.from('v_mesas_estado').select('*').order('numero', { ascending: true }),
        supabase.from('mesas').select('id, mesa_grupo_id'),
      ])
      if (!vivo) return
      setCargando(false)
      if (vista.error) { setError(vista.error.message); return }
      const grupoPorId = new Map((crudas.data || []).map(m => [m.id, m.mesa_grupo_id]))
      const lideres = new Set((crudas.data || []).map(m => m.mesa_grupo_id).filter(Boolean))
      setMesas((vista.data || []).filter(m =>
        m.id !== mesaActual?.id &&
        m.activa &&
        m.estado_mesa === 'libre' &&
        !grupoPorId.get(m.id) &&   // no es miembro de un grupo
        !lideres.has(m.id)         // ni líder de uno
      ))
    })()
    return () => { vivo = false }
  }, [open, mesaActual?.id])

  const porSalon = useMemo(() => {
    const mapa = new Map()
    for (const m of mesas) {
      const key = m.salon_nombre || 'Salón'
      if (!mapa.has(key)) mapa.set(key, [])
      mapa.get(key).push(m)
    }
    return [...mapa.entries()]
  }, [mesas])

  if (!open || !mesaActual) return null

  const elegida = mesas.find(m => m.id === destino) || null
  const quedaChica = elegida && personas > 0 && elegida.capacidad < personas

  const handleConfirm = async () => {
    if (!destino) return
    setBusy(true); setError(null)
    const { error: err } = await onMover?.(destino) || {}
    setBusy(false)
    if (err) { setError(err.message || 'No se pudo mover la mesa'); return }
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="flex flex-col w-full md:max-w-lg max-h-[92dvh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent-soft)' }}>
              <ArrowRightLeft size={17} style={{ color: 'var(--accent-lift)' }} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Mover la mesa</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Todo lo que consumió la mesa {mesaActual.numero} pasa a la mesa que elijas
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cargando ? (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          ) : mesas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <AlertCircle size={22} style={{ color: 'var(--text-xmuted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                No hay ninguna mesa libre
              </p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--text-xmuted)' }}>
                Solo se puede mudar a una mesa libre: una mesa no puede tener dos
                pedidos abiertos a la vez.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {porSalon.map(([salon, lista]) => (
                <div key={salon}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: 'var(--text-muted)' }}>{salon}</p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {lista.map(m => {
                      const sel = destino === m.id
                      return (
                        <button key={m.id} type="button" onClick={() => setDestino(sel ? null : m.id)}
                          className="relative flex flex-col items-center justify-center rounded-xl py-2.5 gap-0.5 transition-all"
                          style={{
                            background: sel ? 'var(--accent-soft)' : 'var(--bg-input)',
                            border: `1.5px solid ${sel ? 'var(--accent-lift)' : 'var(--border)'}`,
                          }}>
                          {sel && (
                            <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: 'var(--accent-lift)' }}>
                              <Check size={10} color="#fff" />
                            </span>
                          )}
                          <span className="text-base font-bold leading-none"
                            style={{ color: sel ? 'var(--accent-lift)' : 'var(--text-primary)' }}>
                            {m.numero}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                            <Users size={9} /> {m.capacidad}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {quedaChica && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] px-3 py-2 rounded-lg"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
              <AlertCircle size={12} className="flex-shrink-0 mt-px" />
              La mesa {elegida.numero} es para {elegida.capacidad} personas y en esta
              mesa hay {personas}. Se puede mover igual.
            </p>
          )}

          {error && (
            <p className="mt-3 flex items-start gap-1.5 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              <AlertCircle size={12} className="flex-shrink-0 mt-px" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={!destino || busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            {busy
              ? <><Loader2 size={15} className="animate-spin" /> Moviendo…</>
              : <><ArrowRightLeft size={15} /> {elegida ? `Mover a la mesa ${elegida.numero}` : 'Elegí una mesa'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
