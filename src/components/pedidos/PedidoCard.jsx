import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight, X, UtensilsCrossed, Truck, MessageCircle, Clock } from 'lucide-react'
import { ESTADO_SIGUIENTE } from '../../hooks/usePedidos'

const CANAL_CONFIG = {
  salon:     { label: 'Salón',      color: '#E8673A', bg: 'rgba(232,103,58,0.12)'  },
  delivery:  { label: 'Delivery',   color: '#4f8ef7', bg: 'rgba(79,142,247,0.12)'  },
  whatsapp:  { label: 'WhatsApp',   color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  pedidosya: { label: 'PedidosYa',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  rappi:     { label: 'Rappi',      color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
}

const BTN_LABEL = {
  pendiente:  'Enviar a cocina',
  preparando: 'Marcar listo',
  listo:      'Entregar',
}

export default function PedidoCard({ pedido, onAvanzar, onCancelar }) {
  const canal    = CANAL_CONFIG[pedido.canal] || CANAL_CONFIG.salon
  const siguiente = ESTADO_SIGUIENTE[pedido.estado]
  const shortId  = pedido.id.slice(-4).toUpperCase()
  const elapsed  = formatDistanceToNow(new Date(pedido.created_at), { locale: es, addSuffix: false })
  const items    = pedido.pedido_items || []
  const urgente  = pedido.estado === 'pendiente' &&
    (Date.now() - new Date(pedido.created_at).getTime()) > 10 * 60 * 1000 // > 10 min

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: '#1c1c1f',
        border: `1px solid ${urgente ? 'rgba(239,68,68,0.4)' : '#2a2a2e'}`,
        boxShadow: urgente ? '0 0 12px rgba(239,68,68,0.1)' : 'none',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #2a2a2e', background: '#161618' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-white/60">#{shortId}</span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: canal.bg, color: canal.color }}
          >
            {canal.label}
          </span>
          {pedido.mesa && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: '#2a2a2e', color: '#a1a1aa' }}>
              Mesa {pedido.mesa}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" style={{ color: urgente ? '#f87171' : '#52525b' }}>
          <Clock size={10} />
          <span className="text-[10px]">{elapsed}</span>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs italic" style={{ color: '#3f3f46' }}>Sin ítems cargados</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-start justify-between gap-2">
              <span className="text-xs text-white/80 leading-snug">
                <span className="font-semibold" style={{ color: '#E8673A' }}>{item.cantidad}×</span> {item.nombre}
              </span>
              {item.notas && (
                <span className="text-[10px] italic flex-shrink-0" style={{ color: '#52525b' }}>
                  {item.notas}
                </span>
              )}
            </div>
          ))
        )}

        {pedido.notas && (
          <p className="text-[10px] mt-2 pt-2 italic" style={{ color: '#52525b', borderTop: '1px solid #2a2a2e' }}>
            📝 {pedido.notas}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #2a2a2e' }}>
        <span className="text-sm font-bold" style={{ color: '#E8673A' }}>
          ${Number(pedido.total).toLocaleString('es-AR')}
        </span>

        <div className="flex items-center gap-1">
          {/* Cancel */}
          <button
            onClick={() => onCancelar(pedido.id)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
            style={{ color: '#52525b' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = '#52525b'}
            title="Cancelar pedido"
          >
            <X size={13} />
          </button>

          {/* Advance state */}
          {siguiente && (
            <button
              onClick={() => onAvanzar(pedido.id, pedido.estado)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #E8673A, #C4501F)' }}
            >
              {BTN_LABEL[pedido.estado]}
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
