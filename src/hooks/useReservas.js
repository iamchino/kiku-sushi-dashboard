import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { addDays } from 'date-fns'
import { localDateISO } from '../lib/finanzas'

export const RESERVA_ESTADOS = ['pendiente', 'confirmada', 'sentada', 'no_show', 'cancelada']

export const RESERVA_ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmada: 'Confirmada',
  sentada:    'Sentada',
  no_show:    'No-show',
  cancelada:  'Cancelada',
}

export const RESERVA_ESTADO_COLOR = {
  pendiente:  { bg: 'rgba(251,191,36,0.10)',  color: '#fbbf24' },
  confirmada: { bg: 'rgba(79,142,247,0.10)',  color: '#4f8ef7' },
  sentada:    { bg: 'rgba(52,211,153,0.10)',  color: '#34d399' },
  no_show:    { bg: 'rgba(113,113,122,0.10)', color: '#a1a1aa' },
  cancelada:  { bg: 'rgba(239,68,68,0.10)',   color: '#f87171' },
}

// ─── Tipos de experiencia (deben coincidir con check de DB) ───────────────
export const TIPO_EXPERIENCIA_OPCIONES = [
  { id: 'carta_abierta',        label: 'Carta abierta',         short: 'Carta',         color: '#9b8faa' },
  { id: 'omakase',              label: 'Omakase',               short: 'Omakase',       color: '#E8D4A2' },
  { id: 'kiku_libre',           label: 'Kiku Libre',            short: 'Kiku Libre',    color: '#FF4FBE' },
  { id: 'umami_del_sur',        label: 'Umami del Sur',         short: 'Umami',         color: '#7B3FBE' },
  { id: 'pacifico_y_patagonia', label: 'Pacífico y Patagonia',  short: 'Pacífico',      color: '#4f8ef7' },
]

export const TIPO_EXPERIENCIA_LABEL = Object.fromEntries(
  TIPO_EXPERIENCIA_OPCIONES.map(o => [o.id, o.label])
)
export const TIPO_EXPERIENCIA_COLOR = Object.fromEntries(
  TIPO_EXPERIENCIA_OPCIONES.map(o => [o.id, o.color])
)

/**
 * Hook con realtime para reservas.
 *
 * Modos:
 *  - mode: 'today'  → solo reservas de hoy
 *  - mode: 'range'  → desde/hasta (default: hoy + 14 días)
 */
export function useReservas(options = {}) {
  const {
    mode     = 'range',
    dateFrom = null,
    dateTo   = null,
  } = options

  const [reservas, setReservas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const fetchReservas = useCallback(async () => {
    let query = supabase
      .from('reservas')
      .select('*')
      .order('fecha', { ascending: true })
      .order('hora',  { ascending: true })

    if (mode === 'today') {
      const today = localDateISO()
      query = query.eq('fecha', today)
    } else {
      // dateFrom/dateTo ya son 'YYYY-MM-DD' (los arma Reservas.jsx en hora local).
      // Se usan tal cual contra la columna date: reconvertirlos por new Date()
      // los interpreta en UTC y corre el rango un día en zonas como Argentina.
      const from = dateFrom || localDateISO()
      const to   = dateTo   || localDateISO(addDays(new Date(), 14))
      query = query.gte('fecha', from).lte('fecha', to)
    }

    const { data, error: qErr } = await query
    if (qErr) setError(qErr.message)
    else { setError(null); setReservas(data || []) }
    setLoading(false)
  }, [mode, dateFrom, dateTo])

  useEffect(() => {
    fetchReservas()
    const channel = supabase
      .channel(`reservas-${mode}-${dateFrom || 'def'}-${dateTo || 'def'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, fetchReservas)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchReservas, mode, dateFrom, dateTo])

  const stats = useMemo(() => {
    const acc = { total: reservas.length, pendiente: 0, confirmada: 0, sentada: 0, no_show: 0, cancelada: 0 }
    for (const r of reservas) {
      if (acc[r.estado] !== undefined) acc[r.estado]++
    }
    return acc
  }, [reservas])

  // ── CRUD ─────────────────────────────────────────────────────────────
  const crearReserva = async (payload) => {
    const { error: rpcErr, data } = await supabase.rpc('crear_reserva', {
      p_fecha:            payload.fecha,
      p_hora:             payload.hora,
      p_personas:         payload.personas,
      p_cliente_nombre:   payload.cliente_nombre,
      p_cliente_telefono: payload.cliente_telefono || null,
      p_cliente_email:    payload.cliente_email    || null,
      p_notas:            payload.notas            || null,
      p_origen:           payload.origen           || 'dashboard',
      p_duracion_min:     payload.duracion_min     || 90,
      p_auto_confirmar:   payload.auto_confirmar !== false,
      p_restricciones:    payload.restricciones    || null,
      p_accesibilidad:    payload.accesibilidad    || null,
      p_tipo_experiencia: payload.tipo_experiencia || null,
    })
    if (!rpcErr) fetchReservas()
    return { reservaId: data, error: rpcErr }
  }

  const actualizarEstado = async (id, estado) => {
    const { error: rpcErr } = await supabase.rpc('actualizar_estado_reserva', {
      p_reserva_id: id,
      p_estado:     estado,
    })
    if (!rpcErr) fetchReservas()
    return { error: rpcErr }
  }

  /**
   * Sienta la reserva en una mesa específica. Abre la mesa con los datos
   * de la reserva (personas + cliente). Devuelve el pedido_id.
   */
  const sentarReserva = async (reservaId, mesaId, mozoId = null) => {
    const { data, error: rpcErr } = await supabase.rpc('sentar_reserva', {
      p_reserva_id: reservaId,
      p_mesa_id:    mesaId,
      p_mozo_id:    mozoId,
    })
    if (!rpcErr) fetchReservas()
    return { pedidoId: data, error: rpcErr }
  }

  /**
   * Restablece una reserva cancelada (o no-show) por accidente: la vuelve a
   * 'confirmada'. El backend revalida el cupo del día y rechaza si ya no hay lugar.
   */
  const reactivarReserva = async (id) => {
    const { error: rpcErr } = await supabase.rpc('reactivar_reserva', {
      p_reserva_id: id,
    })
    if (!rpcErr) fetchReservas()
    return { error: rpcErr }
  }

  const eliminarReserva = async (id) => {
    const { error: delErr } = await supabase.from('reservas').delete().eq('id', id)
    if (!delErr) fetchReservas()
    return { error: delErr }
  }

  const updateReserva = async (id, patch) => {
    const { error: updErr } = await supabase
      .from('reservas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!updErr) fetchReservas()
    return { error: updErr }
  }

  return {
    reservas, stats,
    loading, error,
    refetch: fetchReservas,
    crearReserva, actualizarEstado, sentarReserva, reactivarReserva, eliminarReserva, updateReserva,
  }
}
