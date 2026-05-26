import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Presentación visual por tipo ──────────────────────────────────────────
// Los iconos/colores se derivan del campo `tipo` para que la UI quede
// desacoplada del payload de DB.
const TIPO_META = {
  reserva_nueva:    { color: '#4f8ef7' },
  pedido_nuevo:     { color: 'var(--accent-lift)' },
  // Transitorias (no persistidas):
  pedido_listo:     { color: '#34d399' },
  pedido_cancelado: { color: '#f87171' },
  pedido_preparando:{ color: '#fbbf24' },
  pedido_entregado: { color: '#52525b' },
  stock_bajo:       { color: '#fbbf24' },
}

const LIMIT_INICIAL = 30
const LIMIT_MAX     = 100

/**
 * Hook unificado de notificaciones del dashboard.
 *
 * Fuentes:
 *   - Persistidas: tabla `notificaciones` (INSERT en reservas y pedidos vía
 *     triggers SQL). Cargadas al montar + suscripción realtime.
 *   - Transitorias: UPDATE de pedidos (cambio de estado) y stock bajo.
 *     Viven solo en memoria; no quedan en historial.
 */
export function useNotificaciones() {
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const audioCtx = useRef(null)

  // ─── Beep simple (pedidos / stock) ────────────────────────────────────
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
    } catch { /* navegador bloqueó audio */ }
  }, [])

  // ─── Doble beep (reservas) ────────────────────────────────────────────
  const playReservaBeep = useCallback(() => {
    try {
      if (!audioCtx.current)
        audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtx.current
      const playTone = (freq, delay, dur = 0.25) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur)
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + dur)
      }
      playTone(660, 0)
      playTone(990, 0.18)
    } catch { /* ignore */ }
  }, [])

  // ─── Mapper: fila de tabla → shape de UI ──────────────────────────────
  const toNotifShape = useCallback((row) => {
    const meta = TIPO_META[row.tipo] || { color: '#a1a1aa' }
    return {
      id:              row.id,
      _persisted:      true,
      tipo:            row.tipo,
      titulo:          row.titulo,
      mensaje:         row.mensaje,
      color:           meta.color,
      referenciaId:    row.referencia_id,
      referenciaTabla: row.referencia_tabla,
      metadata:        row.metadata || {},
      leida:           row.leida,
      ts:              new Date(row.created_at),
    }
  }, [])

  // ─── Fetch inicial desde DB ──────────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIMIT_INICIAL)
    if (error) {
      console.error('[notif] fetch inicial:', error)
      return
    }
    const items = (data || []).map(toNotifShape)
    setNotifs(items)
    setUnread(items.filter(n => !n.leida).length)
  }, [toNotifShape])

  useEffect(() => {
    fetchInitial()
  }, [fetchInitial])

  // Refs para que el listener nunca tenga closures viejos
  const handlersRef = useRef({ toNotifShape, playBeep, playReservaBeep })
  useEffect(() => {
    handlersRef.current = { toNotifShape, playBeep, playReservaBeep }
  }, [toNotifShape, playBeep, playReservaBeep])

  // ─── Realtime listener ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const addTransitoria = (notif) => {
      setNotifs(prev => [notif, ...prev].slice(0, LIMIT_MAX))
      setUnread(u => u + 1)
    }

    const channel = supabase
      .channel('notif-dashboard-v2')
      // Persistidas: INSERT en notificaciones
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        ({ new: row }) => {
          const { toNotifShape, playBeep, playReservaBeep } = handlersRef.current
          const n = toNotifShape(row)
          console.log('[notif] persistida recibida:', n.tipo, n.mensaje)

          setNotifs(prev => {
            // Evitar duplicado si ya está (improbable pero protege contra
            // doble suscripción en hot-reload).
            if (prev.some(x => x.id === n.id)) return prev
            return [n, ...prev].slice(0, LIMIT_MAX)
          })
          if (!n.leida) setUnread(u => u + 1)

          // Sonido por tipo
          if (n.tipo === 'reserva_nueva') playReservaBeep()
          else                            playBeep()

          // Notificación nativa del navegador
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(n.titulo, {
                body: n.mensaje,
                icon: '/favicon.ico',
                tag:  'kiku-notif-' + n.id,
              })
            } catch { /* ignorar */ }
          }
        }
      )
      // Transitorias: UPDATE de pedidos (cambio de estado)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        ({ new: p, old: o }) => {
          if (p.estado === o.estado) return
          const tipo = `pedido_${p.estado}`
          const meta = TIPO_META[tipo] || { color: '#a1a1aa' }
          const shortId = (p.id || '').slice(-4).toUpperCase()
          addTransitoria({
            id:              crypto.randomUUID(),
            _persisted:      false,
            tipo,
            titulo:          `Pedido ${p.estado}`,
            mensaje:         `#${shortId}${p.canal ? ' · ' + p.canal : ''}`,
            color:           meta.color,
            referenciaId:    p.id,
            referenciaTabla: 'pedidos',
            metadata:        p,
            leida:           false,
            ts:              new Date(),
          })
          if (['listo', 'cancelado'].includes(p.estado)) handlersRef.current.playBeep()
        }
      )
      // Transitorias: UPDATE de stock (alerta bajo mínimo)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock' },
        ({ new: s, old: o }) => {
          if (parseFloat(s.stock_actual) < parseFloat(o.stock_actual) &&
              parseFloat(s.stock_actual) <= parseFloat(s.stock_minimo)) {
            const meta = TIPO_META.stock_bajo
            addTransitoria({
              id:           crypto.randomUUID(),
              _persisted:   false,
              tipo:         'stock_bajo',
              titulo:       '📦 Stock bajo',
              mensaje:      `${s.nombre || 'Item'} · ${s.stock_actual} ${s.unidad || ''}`,
              color:        meta.color,
              referenciaId: s.id,
              referenciaTabla: 'stock',
              metadata:     s,
              leida:        false,
              ts:           new Date(),
            })
            handlersRef.current.playBeep()
          }
        }
      )
      .subscribe((status, err) => {
        // Esperado: 'SUBSCRIBED'. Si ves CHANNEL_ERROR o TIMED_OUT:
        // verificar que las tablas estén en publication supabase_realtime.
        console.log('[notif] channel status:', status, err || '')
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ─── Actions ────────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    let target
    setNotifs(prev => {
      target = prev.find(n => n.id === id)
      if (!target || target.leida) return prev
      return prev.map(n => n.id === id ? { ...n, leida: true } : n)
    })
    if (target && !target.leida) {
      setUnread(u => Math.max(0, u - 1))
      if (target._persisted) {
        await supabase.rpc('marcar_notificacion_leida', { p_id: id })
      }
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
    setUnread(0)
    await supabase.rpc('marcar_todas_notificaciones_leidas')
  }, [])

  const deleteOne = useCallback(async (id) => {
    let target
    setNotifs(prev => {
      target = prev.find(n => n.id === id)
      return prev.filter(n => n.id !== id)
    })
    if (target && !target.leida) setUnread(u => Math.max(0, u - 1))
    if (target?._persisted) {
      await supabase.rpc('eliminar_notificacion', { p_id: id })
    }
  }, [])

  const clearAll = useCallback(() => {
    // Solo limpia la vista local; el historial persiste en DB.
    setNotifs(prev => prev.filter(n => n._persisted === false ? false : false))
    setUnread(0)
  }, [])

  const refresh = fetchInitial

  return { notifs, unread, markRead, markAllRead, deleteOne, clearAll, refresh }
}

/**
 * Hook auxiliar para listar/paginar el historial completo en /notificaciones.
 * Devuelve raw rows ordenadas por fecha desc con filtros opcionales.
 */
export function useHistorialNotificaciones() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtros, setFiltros] = useState({ tipo: 'todos', leida: 'todos' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(500)
    if (filtros.tipo !== 'todos')  q = q.eq('tipo', filtros.tipo)
    if (filtros.leida === 'si')    q = q.eq('leida', true)
    if (filtros.leida === 'no')    q = q.eq('leida', false)
    const { data, error } = await q
    if (error) console.error('[notif historial]', error)
    setItems(data || [])
    setLoading(false)
  }, [filtros])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Refresca al recibir nuevas (realtime simple)
  useEffect(() => {
    const channel = supabase
      .channel('notif-historial')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchItems])

  const marcarLeida   = (id) => supabase.rpc('marcar_notificacion_leida', { p_id: id }).then(fetchItems)
  const marcarTodas   = ()    => supabase.rpc('marcar_todas_notificaciones_leidas').then(fetchItems)
  const eliminarOne   = (id) => supabase.rpc('eliminar_notificacion', { p_id: id }).then(fetchItems)

  return { items, loading, filtros, setFiltros, refresh: fetchItems, marcarLeida, marcarTodas, eliminarOne }
}
