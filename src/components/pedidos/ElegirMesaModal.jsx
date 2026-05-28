import { useState, useMemo, useEffect } from 'react'
import { X, Users, Loader2 } from 'lucide-react'
import { useSalones } from '../../hooks/useSalones'
import { useMesas } from '../../hooks/useMesas'
import { supabase } from '../../lib/supabase'
import AbrirMesaModal from '../mesas/AbrirMesaModal'

/**
 * Modal para "Nueva Orden · Para Comer Aquí" desde la página de Pedidos.
 *
 * Paso 1: muestra las mesas libres del salón activo.
 * Paso 2: al elegir una mesa, abre AbrirMesaModal con los datos del cliente.
 * Paso 3: si el usuario confirma, llama al RPC abrir_mesa.
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

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />

        <div
          className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[90vh] overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
        >
          <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Para Comer Aquí · Elegir mesa</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Tocá una mesa libre para abrirla con datos del cliente.
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </header>

          {salones.length > 1 && (
            <div className="px-5 py-3 flex gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
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

          <div className="flex-1 overflow-y-auto p-5">
            {(loadingSalones || loadingMesas) ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
              </div>
            ) : mesasLibres.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  No hay mesas libres en este salón
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Esperá a que se libere una o probá otro salón.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {mesasLibres.map(mesa => (
                  <button
                    key={mesa.id}
                    type="button"
                    onClick={() => setMesaParaAbrir(mesa)}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl p-4 transition-transform hover:scale-[1.02]"
                    style={{
                      background: 'var(--accent-soft)',
                      border: '1px solid var(--accent-border)',
                      color: 'var(--accent-lift)',
                      minHeight: 88,
                    }}
                  >
                    <span className="text-2xl font-bold">{mesa.numero}</span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <Users size={10} />
                      {mesa.capacidad || '?'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AbrirMesaModal
        open={Boolean(mesaParaAbrir)}
        mesa={mesaParaAbrir}
        onClose={() => !submitting && setMesaParaAbrir(null)}
        onAbrir={handleAbrirMesa}
      />
    </>
  )
}
