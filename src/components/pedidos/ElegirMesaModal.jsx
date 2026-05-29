import { useState, useMemo, useEffect } from 'react'
import { X, Users, Loader2, ChevronRight } from 'lucide-react'
import { useSalones } from '../../hooks/useSalones'
import { useMesas } from '../../hooks/useMesas'
import { supabase } from '../../lib/supabase'
import AbrirMesaModal from '../mesas/AbrirMesaModal'

/**
 * Modal para "Nueva Orden · Para Comer Aquí" desde la página de Pedidos.
 *
 * Paso 1: lista vertical de las mesas libres del salón activo (con filtro por salón).
 * Paso 2: al elegir una mesa, ocultamos el selector y abrimos AbrirMesaModal.
 * Paso 3: si el usuario confirma, llama al RPC abrir_mesa.
 *
 * Mostramos UN modal por vez (no se solapan) para evitar problemas de z-index.
 */
export default function ElegirMesaModal({ open, onClose, onPedidoCreado }) {
  const { salones, loading: loadingSalones } = useSalones({ onlyActive: true })
  const [activeSalonId, setActiveSalonId] = useState(null)

  useEffect(() => {
    if (!open) return
    if (salones.length && !activeSalonId) {
      setActiveSalonId(salones[0].id)
    }
  }, [open, salones, activeSalonId])

  const { mesas, loading: loadingMesas, refetch } = useMesas({ salonId: activeSalonId })
  const [mesaParaAbrir, setMesaParaAbrir] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const mesasLibres = useMemo(
    () => mesas.filter(m => m.estado_mesa === 'libre' && m.activa && !m.mesa_grupo_id),
    [mesas]
  )

  useEffect(() => {
    if (!open) {
      setMesaParaAbrir(null)
      setSubmitting(false)
    }
  }, [open])

  const handleAbrirMesa = async (form) => {
    if (!mesaParaAbrir?.id) return { error: new Error('Mesa no seleccionada') }
    setSubmitting(true)
    const personas = Math.max(1, parseInt(form.personas) || 1)
    const { error } = await supabase.rpc('abrir_mesa', {
      p_mesa_id:          mesaParaAbrir.id,
      p_personas:         personas,
      p_mozo_id:          form.mozoId || null,
      p_cliente_nombre:   form.clienteNombre?.trim()   || null,
      p_cliente_telefono: form.clienteTelefono?.trim() || null,
    })
    setSubmitting(false)
    if (error) return { error }
    await refetch()
    onPedidoCreado?.()
    setMesaParaAbrir(null)
    onClose?.()
    return { error: null }
  }

  if (!open) return null

  // Si ya hay mesa seleccionada, mostramos SOLO el AbrirMesaModal (oculta el selector)
  // así no se pisan los z-indexes.
  if (mesaParaAbrir) {
    return (
      <AbrirMesaModal
        open={true}
        mesa={mesaParaAbrir}
        onClose={() => !submitting && setMesaParaAbrir(null)}
        onAbrir={handleAbrirMesa}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-lg rounded-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <header className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Para Comer Aquí</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Elegí la mesa para abrir el pedido
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </header>

        {salones.length > 1 && (
          <div className="px-5 py-3 flex gap-2 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {salones.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSalonId(s.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                style={activeSalonId === s.id
                  ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {(loadingSalones || loadingMesas) ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
            </div>
          ) : mesasLibres.length === 0 ? (
            <div className="text-center py-16 px-5">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                No hay mesas libres en este salón
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Esperá a que se libere una, o probá otro salón.
              </p>
            </div>
          ) : (
            <ul>
              {mesasLibres.map(mesa => (
                <li key={mesa.id}>
                  <button
                    type="button"
                    onClick={() => setMesaParaAbrir(mesa)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left transition-colors"
                    style={{ borderBottom: '1px solid var(--border)', background: 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shrink-0"
                        style={{
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-lift)',
                          border: '1px solid var(--accent-border)',
                        }}
                      >
                        {mesa.numero}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          Mesa {mesa.numero}
                        </p>
                        <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          <Users size={11} />
                          Capacidad: {mesa.capacidad || '?'} personas
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
