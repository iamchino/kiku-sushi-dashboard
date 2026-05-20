import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { startOfDay } from 'date-fns'

export const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado']

export const ESTADO_SIGUIENTE = {
  pendiente:  'preparando',
  preparando: 'listo',
  listo:      'entregado',
}

/**
 * Aplana recursivamente una receta hasta ingredientes crudos de stock.
 * Reutiliza la misma lógica del módulo de producción.
 */
function calcularIngredientesCrudos(receta, cantidadPorciones, allRecetas, visited = new Set()) {
  if (!receta || visited.has(receta.id)) return []
  const newVisited = new Set(visited)
  newVisited.add(receta.id)

  const porciones = parseInt(receta.porciones) || 1
  const factor = cantidadPorciones / porciones
  const result = []

  for (const ri of (receta.receta_ingredientes || [])) {
    const cant = parseFloat(ri.cantidad) || 0

    if (ri.stock_id && ri.stock) {
      result.push({
        stock_id: ri.stock_id,
        nombre: ri.stock.nombre,
        unidad: ri.stock.unidad,
        cantidad: cant * factor,
      })
    } else if (ri.subreceta_id) {
      const sub = allRecetas.find(r => r.id === ri.subreceta_id)
      if (sub) {
        const subResults = calcularIngredientesCrudos(sub, cant * factor, allRecetas, newVisited)
        result.push(...subResults)
      }
    }
  }
  return result
}

/**
 * Agrupa ingredientes duplicados sumando cantidades.
 */
function mergeIngredientes(ingredientes) {
  const map = {}
  for (const ing of ingredientes) {
    if (map[ing.stock_id]) {
      map[ing.stock_id].cantidad += ing.cantidad
    } else {
      map[ing.stock_id] = { ...ing }
    }
  }
  return Object.values(map)
}

export function usePedidos() {
  const [pedidos, setPedidos]   = useState([])
  const [recetas, setRecetas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  const fetchPedidos = useCallback(async () => {
    const [resPedidos, resRecetas] = await Promise.all([
      supabase
        .from('pedidos')
        .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas, menu_item_id, variante_id)')
        .gte('created_at', startOfDay(new Date()).toISOString())
        .neq('estado', 'cancelado')
        .order('created_at', { ascending: false }),
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, stock_actual, precio_unitario, rendimiento, tipo_stock, receta_id))')
        .order('nombre'),
    ])

    if (resPedidos.error) setError(resPedidos.error.message)
    else setPedidos(resPedidos.data || [])

    if (!resRecetas.error) setRecetas(resRecetas.data || [])

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
    const { error } = await supabase.rpc('crear_pedido_con_items', {
      p_canal: canal,
      p_mesa: mesa ? String(mesa) : null,
      p_notas: notas || null,
      p_items: items.map(i => ({
        nombre:          i.nombre,
        precio_unitario: parseFloat(i.precio_unitario || 0),
        cantidad:        i.cantidad,
        notas:           i.notas || null,
        menu_item_id:    i.menu_item_id || null,
        variante_id:     i.variante_id || null,
      })),
    })

    if (error) return error

    fetchPedidos()
    return null
  }

  /**
   * Descuenta stock automáticamente cuando un pedido se entrega.
   * Para cada item del pedido:
   *   1. Busca la receta vinculada al menu_item
   *   2. Si tiene variante, usa el campo "piezas" como multiplicador
   *   3. Aplana recursivamente hasta ingredientes crudos
   *   4. Descuenta de stock vía RPC atómica
   */
  const descontarStockPedido = async (pedidoId) => {
    const pedido = pedidos.find(p => p.id === pedidoId)
    if (!pedido || pedido.stock_descontado) return // ya descontado o no existe

    const items = pedido.pedido_items || []
    const descuentoTotal = []

    for (const item of items) {
      if (!item.menu_item_id) continue

      // Buscar la receta vinculada a este producto del menú
      const receta = recetas.find(r => r.menu_item_id === item.menu_item_id)
      if (!receta) continue

      // Determinar cuántas porciones de la receta consume este item
      let piezasPorUnidad = 1

      if (item.variante_id) {
        // Buscar la variante para obtener el campo "piezas"
        const { data: variante } = await supabase
          .from('menu_item_variantes')
          .select('piezas')
          .eq('id', item.variante_id)
          .single()

        if (variante) {
          piezasPorUnidad = parseFloat(variante.piezas) || 1
        }
      }

      // Total de porciones = piezas_por_variante × cantidad_pedida
      const totalPorciones = piezasPorUnidad * (item.cantidad || 1)

      // Aplanar a ingredientes crudos
      const ingredientes = mergeIngredientes(
        calcularIngredientesCrudos(receta, totalPorciones, recetas)
      )

      // Descontar cada ingrediente
      for (const ing of ingredientes) {
        if (ing.cantidad <= 0) continue
        const { error: rpcErr } = await supabase.rpc('descontar_stock_produccion', {
          p_stock_id: ing.stock_id,
          p_cantidad: ing.cantidad,
          p_notas: `Pedido #${pedidoId.slice(-4).toUpperCase()}: ${item.cantidad}× ${item.nombre}`,
        })
        if (rpcErr) return rpcErr
        descuentoTotal.push({
          stock_id: ing.stock_id,
          nombre: ing.nombre,
          unidad: ing.unidad,
          cantidad: ing.cantidad,
          item: item.nombre,
        })
      }
    }

    // Marcar pedido como stock descontado
    if (descuentoTotal.length > 0) {
      const { error } = await supabase.from('pedidos').update({
        stock_descontado: true,
        descuento_detalle: descuentoTotal,
      }).eq('id', pedidoId)
      if (error) return error
    }

    return null
  }

  /**
   * Revierte el descuento de stock de un pedido (ej. cancelación post-entrega).
   */
  const revertirStockPedido = async (pedidoId) => {
    const pedido = pedidos.find(p => p.id === pedidoId)
    if (!pedido?.stock_descontado || !pedido.descuento_detalle) return

    for (const det of pedido.descuento_detalle) {
      const { error } = await supabase.rpc('revertir_stock_produccion', {
        p_stock_id: det.stock_id,
        p_cantidad: det.cantidad,
        p_notas: `Revertido pedido #${pedidoId.slice(-4).toUpperCase()}: ${det.item || det.nombre}`,
      })
      if (error) return error
    }

    const { error } = await supabase.from('pedidos').update({
      stock_descontado: false,
      descuento_detalle: null,
    }).eq('id', pedidoId)
    return error
  }

  const avanzarEstado = async (id, estadoActual) => {
    const siguiente = ESTADO_SIGUIENTE[estadoActual]
    if (!siguiente) return

    // Si el pedido acaba de pasar a "entregado", descontar stock
    if (siguiente === 'entregado') {
      const stockError = await descontarStockPedido(id)
      if (stockError) return stockError
    }

    const { error } = await supabase.rpc('avanzar_estado_pedido', {
      p_pedido_id: id,
      p_estado_actual: estadoActual,
    })
    if (error) return error

    fetchPedidos()
    return null
  }

  const cancelarPedido = async (id) => {
    const pedido = pedidos.find(p => p.id === id)

    // Si ya estaba entregado y tenía stock descontado, revertir
    if (pedido?.stock_descontado) {
      const stockError = await revertirStockPedido(id)
      if (stockError) return stockError
    }

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
