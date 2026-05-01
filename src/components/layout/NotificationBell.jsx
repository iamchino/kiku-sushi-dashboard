import { useState, useRef, useEffect } from 'react'
import { Bell, X, CheckCheck, Trash2 } from 'lucide-react'
import { useNotificaciones } from '../../hooks/useNotificaciones'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export function NotificationBell() {
  const [open, setOpen]       = useState(false)
  const panelRef              = useRef(null)
  const { notifs, unread, markAllRead, clearAll } = useNotificaciones()

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!open && unread > 0) markAllRead()
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
        style={{ color: unread > 0 ? '#7c3aed' : '#52525b' }}
        aria-label="Notificaciones"
      >
        <Bell size={15} className={unread > 0 ? 'animate-[wiggle_0.5s_ease-in-out]' : ''} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: '#7c3aed', boxShadow: '0 0 6px rgba(124,58,237,0.5)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute left-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl"
          style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2a2a2e' }}>
            <p className="text-sm font-semibold text-white">Notificaciones</p>
            <div className="flex items-center gap-1">
              {notifs.length > 0 && (
                <>
                  <button onClick={markAllRead} title="Marcar todo leído"
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                    style={{ color: '#52525b' }}>
                    <CheckCheck size={13} />
                  </button>
                  <button onClick={clearAll} title="Limpiar todo"
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors"
                    style={{ color: '#52525b' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={e => e.currentTarget.style.color = '#52525b'}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5"
                style={{ color: '#52525b' }}>
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={24} style={{ color: '#2a2a2e' }} />
                <p className="text-xs" style={{ color: '#3f3f46' }}>Sin notificaciones</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: '1px solid #1e1e22',
                    background: n.read ? 'transparent' : `${n.color}08`,
                  }}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{n.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white">{n.label}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#52525b' }}>
                      {n.estado?.startsWith('stock_')
                        ? n.canal
                        : `#${n.shortId}${n.mesa ? ` · Mesa ${n.mesa}` : n.canal ? ` · ${n.canal}` : ''}`
                      }
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: '#3f3f46' }}>
                      {formatDistanceToNow(n.ts, { locale: es, addSuffix: true })}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: n.color }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wiggle {
          0%,100%{ transform: rotate(0deg) }
          25%{ transform: rotate(-15deg) }
          75%{ transform: rotate(15deg) }
        }
      `}</style>
    </div>
  )
}
