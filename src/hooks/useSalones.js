import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSalones({ onlyActive = true } = {}) {
  const [salones, setSalones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 10))

  const fetchSalones = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('salones')
      .select('*')
      .order('orden', { ascending: true })
      .order('nombre',  { ascending: true })

    if (onlyActive) query = query.eq('activo', true)

    const { data, error: qErr } = await query
    if (qErr) setError(qErr.message)
    else setError(null)
    setSalones(data || [])
    setLoading(false)
  }, [onlyActive])

  useEffect(() => {
    fetchSalones()
    const channel = supabase
      .channel(`salones-realtime-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salones' }, fetchSalones)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSalones])

  const createSalon = async ({ nombre, ancho = 1200, alto = 800 }) => {
    const trimmed = String(nombre || '').trim()
    if (!trimmed) return { error: new Error('Nombre requerido') }
    const maxOrden = salones.reduce((max, s) => Math.max(max, s.orden || 0), -1)
    const { data, error: insErr } = await supabase
      .from('salones')
      .insert({ nombre: trimmed, ancho, alto, orden: maxOrden + 1 })
      .select()
      .single()
    if (!insErr) fetchSalones()
    return { data, error: insErr }
  }

  const updateSalon = async (id, patch) => {
    const { error: updErr } = await supabase
      .from('salones')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!updErr) fetchSalones()
    return { error: updErr }
  }

  const desactivarSalon = (id) => updateSalon(id, { activo: false })

  return {
    salones, loading, error,
    refetch: fetchSalones,
    createSalon, updateSalon, desactivarSalon,
  }
}
