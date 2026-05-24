import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook de mesas con realtime para un salón específico.
 * Lee de la vista `v_mesas_estado` que ya trae el estado derivado del pedido abierto.
 * Channel name único por instancia para evitar choques con otros consumidores.
 */
export function useMesas({ salonId } = {}) {
  const [mesas,   setMesas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 10))

  const fetchMesas = useCallback(async () => {
    if (!salonId) {
      setMesas([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: qErr } = await supabase
      .from('v_mesas_estado')
      .select('*')
      .eq('salon_id', salonId)
      .eq('activa', true)
      .order('numero', { ascending: true })

    if (qErr) setError(qErr.message)
    else setError(null)
    setMesas(data || [])
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    fetchMesas()
    if (!salonId) return

    const channel = supabase
      .channel(`mesas-realtime-${salonId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' },                  fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },                fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' },           fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes_fiscales' },  fetchMesas)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [salonId, fetchMesas])

  const stats = useMemo(() => {
    const total = mesas.length
    const libres = mesas.filter(m => m.estado_mesa === 'libre').length
    const ocupadas = total - libres
    return { total, libres, ocupadas }
  }, [mesas])

  const createMesa = async ({ numero, capacidad = 4, pos_x = 0, pos_y = 0, ancho = 80, alto = 80, forma = 'rect', nombre = null }) => {
    if (!salonId) return { error: new Error('Salón requerido') }
    const { data, error: insErr } = await supabase
      .from('mesas')
      .insert({ salon_id: salonId, numero, capacidad, pos_x, pos_y, ancho, alto, forma, nombre })
      .select()
      .single()
    if (!insErr) fetchMesas()
    return { data, error: insErr }
  }

  const updateMesa = async (id, patch) => {
    const { error: updErr } = await supabase
      .from('mesas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!updErr) fetchMesas()
    return { error: updErr }
  }

  /** Update masivo de posiciones (cuando se guarda el editor). */
  const updateMesasPositions = async (positions) => {
    const promises = positions.map(p =>
      supabase.from('mesas').update({
        pos_x: p.pos_x,
        pos_y: p.pos_y,
        ...(p.ancho !== undefined ? { ancho: p.ancho } : {}),
        ...(p.alto  !== undefined ? { alto: p.alto }   : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', p.id)
    )
    const results = await Promise.all(promises)
    const firstError = results.find(r => r.error)?.error
    if (!firstError) fetchMesas()
    return { error: firstError }
  }

  const desactivarMesa = (id) => updateMesa(id, { activa: false })

  const eliminarMesa = async (id) => {
    const { error: delErr } = await supabase.from('mesas').delete().eq('id', id)
    if (!delErr) fetchMesas()
    return { error: delErr }
  }

  return {
    mesas, stats, loading, error,
    refetch: fetchMesas,
    createMesa, updateMesa, updateMesasPositions, desactivarMesa, eliminarMesa,
  }
}
