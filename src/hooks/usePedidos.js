import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { startOfDay } from 'date-fns'

export const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado']

export const ESTADO_SIGUIENTE = {
  pendiente:  'preparando',
  preparando: 'listo',
  listo:      'entregado',
}

export function usePedidos() {
  const [pedidos, setPedidos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  const fetchPedidos = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas)')
      .gte('created_at', startOfDay(new Date()).toISOString())
      .neq('estado', 'cancelado')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setPedidos(data || [])
    setLoading(false)
  }, [])

  // Initial load + Realtime
  useEffect(() => {
    fetchPedidos()
    const channel = supabase
      .channel('pedidos-kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },      fetchPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' }, fetchPedidos)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchPedidos])

  // Group by estado
  const grouped = useMemo(() => {
    const map = {}
    ESTADOS.forEach(e => { map[e] = [] })
    pedidos.forEach(p => { if (map[p.estado]) map[p.estado].push(p) })
    return map
  }, [pedidos])

  // Stats
  const stats = useMemo(() => ({
    total:      pedidos.length,
    pendientes: grouped.pendiente?.length  || 0,
    enCocina:   grouped.preparando?.length || 0,
    listos:     grouped.listo?.length      || 0,
    entregados: grouped.entregado?.length  || 0,
  }), [pedidos, grouped])

  // CRUD
  const createPedido = async ({ canal, mesa, notas, items }) => {
    const total = items.reduce((acc, i) => acc + parseFloat(i.precio_unitario || 0) * i.cantidad, 0)

    const { data: pedido, error: e1 } = await supabase
      .from('pedidos')
      // mesa es TEXT en la BD → convertir a string
      .insert({ canal, mesa: mesa ? String(mesa) : null, notas: notas || null, total })
      .select().single()

    if (e1) return e1

    if (items.length > 0) {
      const { error: e2 } = await supabase.from('pedido_items').insert(
        items.map(i => ({
          pedido_id:       pedido.id,
          // producto_id referencia 'productos' (otra tabla) → no lo enviamos
          nombre:          i.nombre,
          precio_unitario: parseFloat(i.precio_unitario || 0),
          cantidad:        i.cantidad,
          notas:           i.notas || null,
        }))
      )
      if (e2) return e2
    }

    fetchPedidos()
    return null
  }

  const avanzarEstado = async (id, estadoActual) => {
    const siguiente = ESTADO_SIGUIENTE[estadoActual]
    if (!siguiente) return
    const { error } = await supabase.from('pedidos').update({ estado: siguiente }).eq('id', id)
    if (!error) fetchPedidos()
    return error
  }

  const cancelarPedido = async (id) => {
    const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', id)
    if (!error) fetchPedidos()
    return error
  }

  return {
    pedidos, grouped, stats,
    loading, error,
    createPedido, avanzarEstado, cancelarPedido,
    refetch: fetchPedidos,
  }
}
