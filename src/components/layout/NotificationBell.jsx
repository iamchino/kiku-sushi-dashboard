import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell, X, CheckCheck, Trash2, ArrowRight } from 'lucide-react'
import { useNotificaciones } from '../../hooks/useNotificaciones'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const panelRef  = useRef(null)
  const { notifs, unread, markAllRead, clearAll } = useNotificaciones()

  const updateCoords = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const panelWidth = 320
    const viewportW  = window.innerWidth
    let left = rect.left
    if (left + panelWidth + 8 > viewportW) {
      left = Math.max(8, viewportW - panelWidth - 8)
    }
    setCoords({ top: rect.bottom + 6, left })
  }, [])

  useEffect(() => {
    if (!open) return
    updateCoords()
    window.addEventListener('scroll',  updateCoords, true)
    window.addEventListener('resize',  updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!open && unread > 0) markAllRead()
  }

  // Vista resumida: últimas 20 (mix de persistidas + transitorias)
  const visibles = notifs.slice(0, 20)

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
        style={{ color: unread > 0 ? 'var(--accent-lift)' : '#52525b' }}
        aria-label="Notificaciones"
      >
        <Bell size={15} className={unread > 0 ? 'animate-[wiggle_0.5s_ease-in-out]' : ''} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--accent-rgb),0.5)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed w-80 max-w-[calc(100vw-1rem)] rounded-xl overflow-hidden shadow-2xl"
          style={{
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            background: '#1c1c1f',
            border: '1px solid #2a2a2e',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          }}
        >
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
                  <button onClick={clearAll} title="Ocultar de la vista (no borra el historial)"
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

          <div className="max-h-80 overflow-y-auto">
            {visibles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={24} style={{ color: '#2a2a2e' }} />
                <p className="text-xs" style={{ color: '#3f3f46' }}>Sin notificaciones</p>
              </div>
            ) : (
              visibles.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: '1px solid #1e1e22',
                    background: n.leida ? 'transparent' : `${n.color}10`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{n.titulo}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#a1a1aa' }}>
                      {n.mensaje}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: '#3f3f46' }}>
                      {formatDistanceToNow(n.ts, { locale: es, addSuffix: true })}
                    </p>
                  </div>
                  {!n.leida && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: n.color }} />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer: link a la página completa */}
          <Link
            to="/notificaciones"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] font-medium hover:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid #2a2a2e', color: 'var(--accent-lift)' }}
          >
            Ver historial completo <ArrowRight size={12} />
          </Link>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes wiggle {
          0%,100%{ transform: rotate(0deg) }
          25%{ transform: rotate(-15deg) }
          75%{ transform: rotate(15deg) }
        }
      `}</style>
    </>
  )
}
