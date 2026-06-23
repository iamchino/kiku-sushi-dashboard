import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export const LISTA_ESPERA_ESTADOS = ['esperando', 'contactado', 'convertida', 'cancelada']

export const LISTA_ESPERA_LABEL = {
  esperando:  'En espera',
  contactado: 'Contactado',
  convertida: 'Convertida',
  cancelada:  'Descartada',
}

export const LISTA_ESPERA_COLOR = {
  esperando:  { bg: 'rgba(251,191,36,0.10)',  color: '#fbbf24' },
  contactado: { bg: 'rgba(79,142,247,0.10)',  color: '#4f8ef7' },
  convertida: { bg: 'rgba(52,211,153,0.10)',  color: '#34d399' },
  cancelada:  { bg: 'rgba(113,113,122,0.10)', color: '#a1a1aa' },
}

/**
 * Hook con realtime para la lista de espera.
 * La web inserta vía RPC crear_lista_espera; acá leemos/gestionamos.
 */
export function useListaEspera() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchItems = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('lista_espera')
      .select('*')
      .order('created_at', { ascending: false })
    if (qErr) setError(qErr.message)
    else { setError(null); setItems(data || []) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel('lista_espera')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lista_espera' }, fetchItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchItems])

  const stats = useMemo(() => {
    const acc = { total: items.length, esperando: 0, contactado: 0, convertida: 0, cancelada: 0 }
    for (const i of items) if (acc[i.estado] !== undefined) acc[i.estado]++
    return acc
  }, [items])

  const actualizarEstado = async (id, estado) => {
    const { error: rpcErr } = await supabase.rpc('actualizar_estado_lista_espera', {
      p_id: id, p_estado: estado,
    })
    if (!rpcErr) fetchItems()
    return { error: rpcErr }
  }

  const eliminar = async (id) => {
    const { error: delErr } = await supabase.from('lista_espera').delete().eq('id', id)
    if (!delErr) fetchItems()
    return { error: delErr }
  }

  return {
    items, stats, loading, error,
    pendientes: stats.esperando,
    actualizarEstado, eliminar,
    refetch: fetchItems,
  }
}
