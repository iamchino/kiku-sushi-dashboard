import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ESTADO_LABELS = {
  pendiente:  { label: 'Nuevo pedido',        emoji: '🔔', color: '#E8673A' },
  preparando: { label: 'En preparación',       emoji: '👨‍🍳', color: '#4f8ef7' },
  listo:      { label: 'Listo para entregar',  emoji: '✅', color: '#34d399' },
  entregado:  { label: 'Entregado',            emoji: '🎉', color: '#52525b' },
  cancelado:  { label: 'Cancelado',            emoji: '❌', color: '#f87171' },
}

export function useNotificaciones() {
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const audioCtx = useRef(null)

  // Tono de notificación via Web Audio API (sin archivos externos)
  const playBeep = useCallback((tipo = 'nuevo') => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtx.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = tipo === 'nuevo' ? 880 : 660
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch { /* ignorar si el browser bloquea audio */ }
  }, [])

  // Push notification nativa del browser
  const pushNativa = useCallback((titulo, cuerpo) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(titulo, {
        body: cuerpo,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'kiku-pedido',
      })
    }
  }, [])

  const addNotif = useCallback((pedido, estadoNuevo) => {
    const cfg = ESTADO_LABELS[estadoNuevo] || { label: estadoNuevo, emoji: '📋', color: '#a1a1aa' }
    const n = {
      id:       crypto.randomUUID(),
      pedidoId: pedido.id,
      shortId:  pedido.id.slice(-4).toUpperCase(),
      canal:    pedido.canal,
      mesa:     pedido.mesa,
      estado:   estadoNuevo,
      ...cfg,
      ts:       new Date(),
      read:     false,
    }
    setNotifs(prev => [n, ...prev].slice(0, 30)) // máximo 30
    setUnread(u => u + 1)

    // Solo beep + notificación nativa para eventos importantes
    if (['pendiente', 'listo', 'cancelado'].includes(estadoNuevo)) {
      playBeep(estadoNuevo === 'pendiente' ? 'nuevo' : 'alerta')
      pushNativa(
        `${cfg.emoji} ${cfg.label}`,
        `Pedido #${n.shortId}${pedido.mesa ? ` · Mesa ${pedido.mesa}` : ` · ${pedido.canal}`}`
      )
    }
  }, [playBeep, pushNativa])

  useEffect(() => {
    // Pedir permiso para notificaciones nativas (solo si el browser lo soporta)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    // Suscribirse a cambios de pedidos
    const channel = supabase
      .channel('notif-pedidos')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        ({ new: p }) => addNotif(p, p.estado || 'pendiente')
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        ({ new: p, old: o }) => {
          if (p.estado !== o.estado) addNotif(p, p.estado)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [addNotif])

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
