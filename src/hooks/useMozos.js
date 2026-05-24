import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_COLOR = '#9a86bf'

export function useMozos({ onlyActive = true } = {}) {
  const [mozos,   setMozos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 10))

  const fetchMozos = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('mozos').select('*').order('nombre')
    if (onlyActive) query = query.eq('activo', true)
    const { data, error: qErr } = await query
    if (qErr) setError(qErr.message)
    else setError(null)
    setMozos(data || [])
    setLoading(false)
  }, [onlyActive])

  useEffect(() => {
    fetchMozos()
    const channel = supabase
      .channel(`mozos-realtime-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mozos' }, fetchMozos)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchMozos])

  const createMozo = async ({ nombre, color }) => {
    const trimmed = String(nombre || '').trim()
    if (!trimmed) return { error: new Error('Nombre requerido') }
    const { data, error: insErr } = await supabase
      .from('mozos')
      .insert({ nombre: trimmed, color: color || DEFAULT_COLOR })
      .select()
      .single()
    if (!insErr) fetchMozos()
    return { data, error: insErr }
  }

  const updateMozo = async (id, patch) => {
    const { error: updErr } = await supabase
      .from('mozos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!updErr) fetchMozos()
    return { error: updErr }
  }

  const desactivarMozo = (id) => updateMozo(id, { activo: false })
  const activarMozo    = (id) => updateMozo(id, { activo: true })

  return {
    mozos, loading, error,
    refetch: fetchMozos,
    createMozo, updateMozo, desactivarMozo, activarMozo,
  }
}
