import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ESTADO_LABELS = {
  pendiente:  { label: 'Nuevo pedido',       emoji: '🔔', color: '#E8673A' },
  preparando: { label: 'En preparación',      emoji: '👨‍🍳', color: '#4f8ef7' },
  listo:      { label: 'Listo para entregar', emoji: '✅', color: '#34d399' },
  entregado:  { label: 'Entregado',           emoji: '🎉', color: '#52525b' },
  cancelado:  { label: 'Cancelado',           emoji: '❌', color: '#f87171' },
}

export function useNotificaciones() {
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const audioCtx = useRef(null)

  const playBeep = useCallback(() => {
    try {
      if (!audioCtx.current)
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtx.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880; osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    } catch { /* ignorar si el browser bloquea audio */ }
  }, [])

  // Ref para acceder a las últimas funciones dentro del callback de realtime
  // sin que el effect se re-ejecute (evita el bug "cannot add callbacks after subscribe")
  const handlersRef = useRef({ setNotifs, setUnread, playBeep })
  useEffect(() => { handlersRef.current = { setNotifs, setUnread, playBeep } })

  useEffect(() => {
    // Permiso notificaciones nativas
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const addNotif = (pedido, estado) => {
      const { setNotifs, setUnread, playBeep } = handlersRef.current
      const cfg = ESTADO_LABELS[estado] || { label: estado, emoji: '📋', color: '#a1a1aa' }
      const n = {
        id:       crypto.randomUUID(),
        pedidoId: pedido.id,
        shortId:  (pedido.id || '').slice(-4).toUpperCase() || '----',
        canal:    pedido.canal || '',
        mesa:     pedido.mesa  || null,
        estado,
        ...cfg,
        ts:   new Date(),
        read: false,
      }
      setNotifs(prev => [n, ...prev].slice(0, 30))
      setUnread(u => u + 1)

      if (['pendiente', 'listo', 'cancelado'].includes(estado)) {
        playBeep()
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(`${cfg.emoji} ${cfg.label}`, {
              body: `Pedido #${n.shortId}${n.mesa ? ` · Mesa ${n.mesa}` : n.canal ? ` · ${n.canal}` : ''}`,
              icon: '/favicon.ico',
              tag:  'kiku-pedido',
            })
          } catch { /* ignorar */ }
        }
      }
    }

    // Canal único — se crea UNA SOLA VEZ (deps: [])
    const channel = supabase
      .channel('notif-pedidos')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        ({ new: p }) => addNotif(p, p.estado || 'pendiente')
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        ({ new: p, old: o }) => { if (p.estado !== o.estado) addNotif(p, p.estado) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // ← deps vacío: el canal se crea y destruye una sola vez

  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }, [])

  const clearAll = useCallback(() => {
    setNotifs([])
    setUnread(0)
  }, [])

  return { notifs, unread, markAllRead, clearAll }
}
