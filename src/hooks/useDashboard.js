import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'

export function useDashboard() {
  const [kpis, setKpis] = useState(null)
  const [kpisAyer, setKpisAyer] = useState(null)
  const [platosTop, setPlatosTop] = useState([])
  const [pedidosPorHora, setPedidosPorHora] = useState([])
  const [alertasStock, setAlertasStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchKpisHoy = useCallback(async () => {
    const { data, error } = await supabase.from('v_kpis_dia').select('*').single()
    if (error) throw error
    return data
  }, [])

  const fetchKpisAyer = useCallback(async () => {
    const ayer = subDays(new Date(), 1)
    const { data, error } = await supabase
      .from('pedidos')
      .select('total, canal')
      .gte('created_at', startOfDay(ayer).toISOString())
      .lte('created_at', endOfDay(ayer).toISOString())
      .neq('estado', 'cancelado')
    if (error) throw error
    const ventas = data.reduce((acc, p) => acc + Number(p.total || 0), 0)
    const ticket = data.length > 0 ? ventas / data.length : 0
    return {
      pedidos_total: data.length,
      pedidos_salon: data.filter(p => p.canal === 'salon').length,
      pedidos_delivery: data.filter(p => p.canal === 'delivery').length,
      ventas_total: ventas,
      ticket_promedio: ticket,
    }
  }, [])

  const fetchPlatosTop = useCallback(async () => {
    const hoy = new Date()

    // Paso 1: IDs de pedidos de hoy no cancelados
    const { data: pedidosHoy, error: eP } = await supabase
      .from('pedidos')
      .select('id')
      .gte('created_at', startOfDay(hoy).toISOString())
      .neq('estado', 'cancelado')
    if (eP) throw eP
    if (!pedidosHoy?.length) return []

    const ids = pedidosHoy.map(p => p.id)

    // Paso 2: items de esos pedidos — usa 'nombre' (snapshot directo en pedido_items)
    const { data, error } = await supabase
      .from('pedido_items')
      .select('nombre, cantidad')
      .in('pedido_id', ids)
    if (error) throw error

    // Agrupar y ordenar
    const mapa = {}
    data.forEach(item => {
      if (!item.nombre) return
      mapa[item.nombre] = (mapa[item.nombre] || 0) + (item.cantidad || 1)
    })
    return Object.entries(mapa)
      .map(([nombre, unidades]) => ({ nombre, unidades }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 5)
  }, [])


  const fetchPedidosPorHora = useCallback(async () => {
    const desde = subDays(new Date(), 6)
    const { data, error } = await supabase
      .from('pedidos')
      .select('created_at')
      .gte('created_at', startOfDay(desde).toISOString())
      .neq('estado', 'cancelado')
    if (error) throw error
    const matriz = {}
    data.forEach(p => {
      const fecha = new Date(p.created_at)
      const dia = format(fecha, 'EEE')
      const hora = fecha.getHours()
      const key = `${dia}-${hora}`
      matriz[key] = (matriz[key] || 0) + 1
    })
    return matriz
  }, [])

  const fetchAlertasStock = useCallback(async () => {
    const { data, error } = await supabase.from('v_alertas_stock').select('*')
    if (error) throw error
    return data
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const [hoy, ayer, platos, porHora, alertas] = await Promise.all([
        fetchKpisHoy(),
        fetchKpisAyer(),
        fetchPlatosTop(),
        fetchPedidosPorHora(),
        fetchAlertasStock(),
      ])
      setKpis(hoy)
      setKpisAyer(ayer)
      setPlatosTop(platos)
      setPedidosPorHora(porHora)
      setAlertasStock(alertas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchKpisHoy, fetchKpisAyer, fetchPlatosTop, fetchPedidosPorHora, fetchAlertasStock])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' }, () => fetchAll())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  const delta = (campoHoy, campoAyer) => {
    const hoy = Number(kpis?.[campoHoy] || 0)
    const ayer = Number(kpisAyer?.[campoAyer] || 0)
    if (ayer === 0) return null
    return Math.round(((hoy - ayer) / ayer) * 100)
  }

  return { kpis, kpisAyer, platosTop, pedidosPorHora, alertasStock, loading, error, refetch: fetchAll, delta }
}