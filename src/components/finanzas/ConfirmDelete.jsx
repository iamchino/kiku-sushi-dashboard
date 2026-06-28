import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export default function ConfirmDelete({ titulo = 'Eliminar', mensaje, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try { await onConfirm(); onClose() } catch { setLoading(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
          style={{ background: 'rgba(248,113,113,0.1)' }}>
          <Trash2 size={18} style={{ color: '#f87171' }} />
        </div>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{mensaje}</p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Cancelar
          </button>
          <button onClick={handle} disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}
