import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { calculateOrderTotal, clampDiscount, parseCurrencyValue, effectiveDiscountAmount } from '../lib/orders'
import { aplicarDescuentoPedido as aplicarDescLib, quitarDescuentoPedido as quitarDescLib } from '../lib/descuento'
import { getAuthorizedComprobante } from '../lib/fiscal'

export const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado']

const ENABLE_ORDER_STOCK_DISCOUNT = import.meta.env.VITE_ENABLE_ORDER_STOCK_DISCOUNT === 'true'

export const ESTADO_SIGUIENTE = {
  pendiente:  'preparando',
  preparando: 'listo',
  listo:      'entregado',
}

export function getEstadoSimple(pedido) {
  const e = pedido?.estado
  if (e === 'cancelado')  return 'cancelada'
  if (e === 'entregado')  return 'completada'
  return 'activa'
}

export function getTipoPedido(pedido) {
  if (pedido?.mesa_id || pedido?.canal === 'salon') return 'salon'
  if (pedido?.canal === 'delivery')                  return 'delivery'
  return 'llevar'
}

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

function isMissingRpcFunction(error) {
  return error?.code === 'PGRST202'
    || /schema cache/i.test(error?.message || '')
    || /Could not find the function/i.test(error?.message || '')
}

function normalizePedidoItems(items) {
  return items.map(i => ({
    nombre:          i.nombre,
    precio_unitario: parseCurrencyValue(i.precio_unitario),
    cantidad:        i.cantidad,
    notas:           i.notas || null,
    menu_item_id:    i.menu_item_id || null,
    variante_id:     i.variante_id || null,
  }))
}

function normalizePedidoItemsLegacy(items) {
  return items.map(i => ({
    nombre:          i.nombre,
    precio_unitario: parseCurrencyValue(i.precio_unitario),
    cantidad:        i.cantidad,
    notas:           i.notas || null,
    menu_item_id:    i.menu_item_id || null,
  }))
}

export function usePedidos(options = {}) {
  const {
    mode = 'today',
    dateFrom = null,
    dateTo = null,
  } = options

  const [pedidos, setPedidos]   = useState([])
  const [recetas, setRecetas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  const fetchPedidos = useCallback(async () => {
    let query = supabase
      .from('pedidos')
      .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas, menu_item_id, variante_id), comprobantes_fiscales(*)')
      .order('created_at', { ascending: false })

    if (mode === 'today') {
      query = query
        .gte('created_at', startOfDay(new Date()).toISOString())
        .neq('estado', 'cancelado')
    } else {
      // OJO: new Date("2026-05-28") se parsea como UTC midnight, lo que en
      // Argentina (UTC-3) corre el límite y deja afuera pedidos de la noche.
      // Forzamos parseo en hora LOCAL agregando 'T00:00:00'.
      const from = dateFrom
        ? startOfDay(new Date(`${dateFrom}T00:00:00`))
        : startOfDay(subDays(new Date(), 6))
      const to = dateTo
        ? endOfDay(new Date(`${dateTo}T00:00:00`))
        : endOfDay(new Date())
      query = query
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
    }

    const [resPedidos, resRecetas] = await Promise.all([
      query,
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, stock_actual, precio_unitario, rendimiento, tipo_stock, receta_id))')
        .order('nombre'),
    ])

    if (resPedidos.error) setError(resPedidos.error.message)
    else {
      setError(null)
      const list = resPedidos.data || []
      // pedido_items.menu_item_id no tiene FK declarada, así que el embed de
      // PostgREST no trae la imagen. Resolvemos el join acá: buscamos las
      // imágenes de los productos involucrados y las pegamos en cada item.
      const ids = [...new Set(
        list.flatMap(p => (p.pedido_items || [])
          .map(i => i.menu_item_id)
          .filter(Boolean))
      )]
      if (ids.length > 0) {
        const { data: imgs } = await supabase
          .from('menu_items')
          .select('id, imagen_url')
          .in('id', ids)
        const imgMap = Object.fromEntries((imgs || []).map(m => [m.id, m.imagen_url]))
        list.forEach(p => {
          (p.pedido_items || []).forEach(i => {
            i.imagen_url = i.menu_item_id ? (imgMap[i.menu_item_id] || null) : null
          })
        })
      }
      setPedidos(list)
    }

    if (!resRecetas.error) setRecetas(resRecetas.data || [])

    setLoading(false)
  }, [mode, dateFrom, dateTo])

  useEffect(() => {
    fetchPedidos()
    const channel = supabase
      .channel(`pedidos-${mode}-${dateFrom || 'def'}-${dateTo || 'def'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },               fetchPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' },          fetchPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes_fiscales' }, fetchPedidos)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchPedidos, mode, dateFrom, dateTo])

  const grouped = useMemo(() => {
    const map = {}
    ESTADOS.forEach(e => { map[e] = [] })
    pedidos.forEach(p => { if (map[p.estado]) map[p.estado].push(p) })
    return map
  }, [pedidos])

  const stats = useMemo(() => ({
    total:      pedidos.length,
    pendientes: grouped.pendiente?.length  || 0,
    enCocina:   grouped.preparando?.length || 0,
    listos:     grouped.listo?.length      || 0,
    entregados: grouped.entregado?.length  || 0,
  }), [pedidos, grouped])

  const createPedido = async ({
    canal, mesa, notas, items, descuento_porcentaje = 0,
    cliente_nombre = null, cliente_telefono = null, cliente_direccion = null,
    afecta_caja = true, medio_pago = null, fecha = null, cerrar = false,
    costo_envio = 0, envio_zona = null, programado_para = null,
  }) => {
    const normalizedItems = normalizePedidoItems(items)
    const descuento = clampDiscount(descuento_porcentaje)
    const costoEnvio = Math.max(0, Math.round(parseCurrencyValue(costo_envio)))
    const clienteNombre    = cliente_nombre?.trim()    || null
    const clienteTelefono  = cliente_telefono?.trim()  || null
    const clienteDireccion = cliente_direccion?.trim() || null

    // Aplica los "extras" de una orden ya cobrada / que no afecta caja:
    // marca afecta_caja, guarda el medio de pago, setea la fecha real y la deja
    // cerrada (entregada). Tolera que falten las columnas si no se aplicó la
    // migración correspondiente.
    const aplicarExtras = async (pedidoId) => {
      const patch = {}
      if (afecta_caja === false) patch.afecta_caja = false
      if (medio_pago)            patch.medio_pago = medio_pago
      if (fecha)                 patch.created_at = fecha
      if (programado_para)       patch.programado_para = programado_para
      if (cerrar) {
        patch.estado = 'entregado'
        patch.cerrada_at = new Date().toISOString()
      }
      if (Object.keys(patch).length > 0) {
        let { error: pErr } = await supabase.from('pedidos').update(patch).eq('id', pedidoId)
        if (pErr && /afecta_caja|medio_pago|cerrada_at|programado_para/i.test(pErr.message || '')) {
          const safe = { ...patch }
          for (const k of ['afecta_caja', 'medio_pago', 'cerrada_at', 'programado_para']) {
            if (new RegExp(k, 'i').test(pErr.message || '')) delete safe[k]
          }
          if (Object.keys(safe).length > 0) {
            const retry = await supabase.from('pedidos').update(safe).eq('id', pedidoId)
            pErr = retry.error
          } else {
            pErr = null
          }
        }
        if (pErr) return { pedidoId, error: pErr }
      }

      // Costo de envío: lo guardamos y lo SUMAMOS al total ya calculado del
      // pedido (el RPC lo dejó en subtotal - descuento). Leemos el total actual
      // para no depender de cómo lo calculó el backend.
      if (costoEnvio > 0) {
        const { data: cur } = await supabase
          .from('pedidos').select('total').eq('id', pedidoId).single()
        const nuevoTotal = Number(cur?.total || 0) + costoEnvio
        const envioPatch = { costo_envio: costoEnvio, total: nuevoTotal }
        if (envio_zona) envioPatch.envio_zona = envio_zona
        let { error: envErr } = await supabase
          .from('pedidos')
          .update(envioPatch)
          .eq('id', pedidoId)
        // Si falta la columna envio_zona (migración no aplicada), reintentamos sin ella.
        if (envErr && /envio_zona/i.test(envErr.message || '')) {
          const retry = await supabase
            .from('pedidos')
            .update({ costo_envio: costoEnvio, total: nuevoTotal })
            .eq('id', pedidoId)
          envErr = retry.error
        }
        // Si falta la columna costo_envio (migración no aplicada), al menos
        // sumamos el envío al total para no perder el cobro.
        if (envErr && /costo_envio/i.test(envErr.message || '')) {
          await supabase.from('pedidos').update({ total: nuevoTotal }).eq('id', pedidoId)
        } else if (envErr) {
          return { pedidoId, error: envErr }
        }
      }

      fetchPedidos()
      return { pedidoId }
    }
    const { data, error } = await supabase.rpc('crear_pedido_con_items', {
      p_canal: canal,
      p_mesa: mesa ? String(mesa) : null,
      p_notas: notas || null,
      p_items: normalizedItems,
      p_descuento_porcentaje: descuento,
      p_cliente_nombre:    clienteNombre,
      p_cliente_telefono:  clienteTelefono,
      p_cliente_direccion: clienteDireccion,
    })

    if (error && !isMissingRpcFunction(error)) return { error }

    if (error && isMissingRpcFunction(error)) {
      const total = calculateOrderTotal(normalizedItems, descuento)

      const legacy = await supabase.rpc('crear_pedido_con_items', {
        p_canal: canal,
        p_mesa: mesa ? String(mesa) : null,
        p_notas: notas || null,
        p_items: normalizedItems,
      })

      if (!legacy.error) {
        const patch = {}
        if (descuento > 0)      { patch.total = total; patch.descuento_porcentaje = descuento }
        if (clienteNombre)       patch.cliente_nombre    = clienteNombre
        if (clienteTelefono)     patch.cliente_telefono  = clienteTelefono
        if (clienteDireccion)    patch.cliente_direccion = clienteDireccion
        if (Object.keys(patch).length > 0) {
          let { error: updateError } = await supabase
            .from('pedidos')
            .update(patch)
            .eq('id', legacy.data)

          if (updateError && /descuento_porcentaje/i.test(updateError.message || '')) {
            const retry = await supabase
              .from('pedidos')
              .update({ total })
              .eq('id', legacy.data)

            updateError = retry.error
          }

          if (updateError && /descuento_porcentaje|cliente_/i.test(updateError.message || '')) {
            const safePatch = { ...patch }
            for (const k of ['descuento_porcentaje', 'cliente_nombre', 'cliente_telefono', 'cliente_direccion']) {
              if (new RegExp(k, 'i').test(updateError.message || '')) delete safePatch[k]
            }
            const retry = await supabase.from('pedidos').update(safePatch).eq('id', legacy.data)
            updateError = retry.error
          }
          if (updateError) return { error: updateError }
        }

        return await aplicarExtras(legacy.data)
      }

      if (legacy.error && !isMissingRpcFunction(legacy.error)) return { error: legacy.error }

      let { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          canal,
          mesa: mesa || null,
          notas: notas || null,
          total,
          descuento_porcentaje: descuento,
          cliente_nombre:    clienteNombre,
          cliente_telefono:  clienteTelefono,
          cliente_direccion: clienteDireccion,
        })
        .select('id')
        .single()

      if (pedidoError && /descuento_porcentaje|cliente_/i.test(pedidoError.message || '')) {
        const safeRow = {
          canal, mesa: mesa || null, notas: notas || null, total,
          descuento_porcentaje: descuento,
          cliente_nombre: clienteNombre, cliente_telefono: clienteTelefono, cliente_direccion: clienteDireccion,
        }
        for (const k of ['descuento_porcentaje', 'cliente_nombre', 'cliente_telefono', 'cliente_direccion']) {
          if (new RegExp(k, 'i').test(pedidoError.message || '')) delete safeRow[k]
        }
        const retry = await supabase.from('pedidos').insert(safeRow).select('id').single()
        pedido = retry.data
        pedidoError = retry.error
      }

      if (pedidoError) return { error: pedidoError }

      const rows = normalizedItems.map(item => ({
        ...item,
        pedido_id: pedido.id,
      }))

      let { error: itemsError } = await supabase
        .from('pedido_items')
        .insert(rows)

      if (itemsError && /variante_id/i.test(itemsError.message || '')) {
        const legacyRows = normalizePedidoItemsLegacy(items).map(item => ({
          ...item,
          pedido_id: pedido.id,
        }))

        const retry = await supabase
          .from('pedido_items')
          .insert(legacyRows)

        itemsError = retry.error
      }

      if (itemsError) {
        await supabase.from('pedidos').delete().eq('id', pedido.id)
        return { error: itemsError }
      }

      return await aplicarExtras(pedido.id)
    }

    return await aplicarExtras(data)
  }

  const descontarStockPedido = async (pedidoId) => {
    if (!ENABLE_ORDER_STOCK_DISCOUNT) return null

    const pedido = pedidos.find(p => p.id === pedidoId)
    if (!pedido || pedido.stock_descontado) return

    const items = pedido.pedido_items || []
    const descuentoTotal = []

    for (const item of items) {
      if (!item.menu_item_id) continue

      const receta = recetas.find(r => r.menu_item_id === item.menu_item_id)
      if (!receta) continue

      let piezasPorUnidad = 1

      if (item.variante_id) {
        const { data: variante } = await supabase
          .from('menu_item_variantes')
          .select('piezas')
          .eq('id', item.variante_id)
          .single()

        if (variante) {
          piezasPorUnidad = parseFloat(variante.piezas) || 1
        }
      }

      const totalPorciones = piezasPorUnidad * (item.cantidad || 1)

      const ingredientes = mergeIngredientes(
        calcularIngredientesCrudos(receta, totalPorciones, recetas)
      )

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

    if (descuentoTotal.length > 0) {
      const { error } = await supabase.from('pedidos').update({
        stock_descontado: true,
        descuento_detalle: descuentoTotal,
      }).eq('id', pedidoId)
      if (error) return error
    }

    return null
  }

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

  const cerrarPedido = async (id) => {
    const pedido = pedidos.find(p => p.id === id)
    if (!pedido) return new Error('Pedido no encontrado')
    if (pedido.estado === 'cancelado') return new Error('No se puede cerrar un pedido cancelado')

    if (!pedido.stock_descontado) {
      const stockError = await descontarStockPedido(id)
      if (stockError) return stockError
    }

    let { error: updateError } = await supabase
      .from('pedidos')
      .update({
        estado: 'entregado',
        cerrada_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError && /cerrada_at/i.test(updateError.message || '')) {
      const retry = await supabase
        .from('pedidos')
        .update({ estado: 'entregado' })
        .eq('id', id)
      updateError = retry.error
    }

    if (!updateError) fetchPedidos()
    return updateError
  }

  const cancelarPedido = async (id) => {
    const pedido = pedidos.find(p => p.id === id)

    if (pedido?.stock_descontado) {
      const stockError = await revertirStockPedido(id)
      if (stockError) return stockError
    }

    const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', id)
    if (!error) fetchPedidos()
    return error
  }

  const isFacturado = useCallback((pedido) => Boolean(getAuthorizedComprobante(pedido)), [])

  // UPDATE directo del estado (respeta RLS). Usado como fallback cuando falta la
  // RPC y como camino principal cuando se fuerza sobre un pedido facturado (la
  // RPC rechaza facturados del lado del servidor, así que la salteamos).
  const setEstadoDirecto = async (id, estado) => {
    let { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado, cerrada_at: null })
      .eq('id', id)

    if (updateError && /cerrada_at/i.test(updateError.message || '')) {
      const retry = await supabase
        .from('pedidos')
        .update({ estado })
        .eq('id', id)
      updateError = retry.error
    }
    return updateError
  }

  /**
   * Reabre un pedido cerrado (entregado) para poder editarlo / cobrarlo de nuevo.
   * Vuelve el estado a 'preparando' y limpia cerrada_at.
   * Por defecto bloquea pedidos ya facturados; con { force: true } se permite
   * reabrir facturados (editar con aviso fiscal) vía UPDATE directo.
   */
  const reabrirPedido = async (id, { force = false } = {}) => {
    const pedido = pedidos.find(p => p.id === id)
    if (!pedido) return new Error('Pedido no encontrado')
    if (pedido.estado === 'cancelado') {
      return new Error('No se puede reabrir un pedido cancelado.')
    }
    // Chequeo en cliente (la RPC lo vuelve a validar en el servidor).
    if (!force && getAuthorizedComprobante(pedido)) {
      return new Error('No se puede reabrir un pedido ya facturado.')
    }

    // Modo forzado (facturado permitido con aviso): vamos directo al UPDATE
    // porque la RPC rechaza facturados en el servidor.
    if (force) {
      const err = await setEstadoDirecto(id, 'preparando')
      if (err) return err
      fetchPedidos()
      return null
    }

    // Preferimos la RPC reabrir_pedido (valida no-facturado del lado del server).
    const { error: rpcErr } = await supabase.rpc('reabrir_pedido', { p_pedido_id: id })

    if (rpcErr && !isMissingRpcFunction(rpcErr)) {
      // La RPC existe pero rechazó (p.ej. facturado / cancelado / permisos).
      return rpcErr
    }

    if (rpcErr && isMissingRpcFunction(rpcErr)) {
      // Fallback: si la RPC no está aplicada, UPDATE directo (respeta RLS).
      const err = await setEstadoDirecto(id, 'preparando')
      if (err) return err
    }

    fetchPedidos()
    return null
  }

  /**
   * Restablece un pedido CANCELADO por accidente: lo vuelve a 'pendiente'.
   * Por defecto bloquea pedidos ya facturados; con { force: true } se permite
   * restaurar facturados (con aviso fiscal) vía UPDATE directo.
   */
  const reactivarPedido = async (id, { force = false } = {}) => {
    const pedido = pedidos.find(p => p.id === id)
    if (!force && pedido && getAuthorizedComprobante(pedido)) {
      return new Error('No se puede restablecer un pedido ya facturado.')
    }

    // Modo forzado (facturado permitido con aviso): UPDATE directo.
    if (force) {
      const err = await setEstadoDirecto(id, 'pendiente')
      if (err) return err
      fetchPedidos()
      return null
    }

    const { error: rpcErr } = await supabase.rpc('reactivar_pedido', { p_pedido_id: id })

    if (rpcErr && !isMissingRpcFunction(rpcErr)) {
      // La RPC existe pero rechazó (facturado / no cancelado / permisos).
      return rpcErr
    }

    if (rpcErr && isMissingRpcFunction(rpcErr)) {
      // Fallback: si la RPC no está aplicada, UPDATE directo (respeta RLS).
      const err = await setEstadoDirecto(id, 'pendiente')
      if (err) return err
    }

    fetchPedidos()
    return null
  }

  // Recalcula el total del pedido a partir de sus items, su descuento y su envío.
  // envioOverride permite forzar un envío nuevo (al editarlo) sin esperar al estado.
  const recalcularTotalPedido = async (pedidoId, envioOverride) => {
    const pedido = pedidos.find(p => p.id === pedidoId)
    const { data: itemsActuales } = await supabase
      .from('pedido_items')
      .select('precio_unitario, cantidad')
      .eq('pedido_id', pedidoId)
    const sub = (itemsActuales || []).reduce(
      (acc, i) => acc + (parseCurrencyValue(i.precio_unitario) * (parseInt(i.cantidad) || 0)),
      0
    )
    const envio = envioOverride != null
      ? Math.max(0, Math.round(Number(envioOverride) || 0))
      : Math.max(0, Number(pedido?.costo_envio || 0))
    const tot = Math.max(0, sub - effectiveDiscountAmount(sub, pedido)) + envio
    await supabase.from('pedidos').update({ total: tot }).eq('id', pedidoId)
  }

  // Setea el costo de envío de un pedido existente y recalcula el total.
  // `zona` (opcional) deja registrada la zona elegida.
  const actualizarEnvioPedido = async (pedidoId, costoEnvio, zona = null) => {
    const envio = Math.max(0, Math.round(parseCurrencyValue(costoEnvio)))
    const patch = { costo_envio: envio }
    if (zona !== undefined) patch.envio_zona = zona || null
    let { error } = await supabase.from('pedidos').update(patch).eq('id', pedidoId)
    // Si falta envio_zona (migración no aplicada), reintentamos solo con costo_envio.
    if (error && /envio_zona/i.test(error.message || '')) {
      const retry = await supabase.from('pedidos').update({ costo_envio: envio }).eq('id', pedidoId)
      error = retry.error
    }
    // Si falta la columna costo_envio (migración no aplicada), igual recalculamos
    // el total con el envío para no perder el cobro.
    if (error && !/costo_envio/i.test(error.message || '')) return error
    await recalcularTotalPedido(pedidoId, envio)
    fetchPedidos()
    return null
  }

  /** Agrega items a un pedido existente (órdenes web / para llevar / salón). */
  const agregarItemsPedido = async (pedidoId, newItems) => {
    const normalized = (newItems || [])
      .filter(i => i.nombre && (parseInt(i.cantidad) || 0) > 0)
      .map(i => ({
        nombre:          String(i.nombre).trim(),
        cantidad:        Math.max(1, parseInt(i.cantidad) || 1),
        precio_unitario: parseCurrencyValue(i.precio_unitario),
        notas:           i.notas || null,
        menu_item_id:    i.menu_item_id || null,
        variante_id:     i.variante_id  || null,
      }))
    if (normalized.length === 0) return new Error('Sin items para agregar')

    let { error: rpcErr } = await supabase.rpc('agregar_items_pedido', {
      p_pedido_id: pedidoId,
      p_items:     normalized,
    })

    // Fallback: si la RPC no existe o falla por variante_id, insertamos directo.
    if (rpcErr) {
      const rows = normalized.map(i => ({ ...i, pedido_id: pedidoId }))
      let ins = await supabase.from('pedido_items').insert(rows)
      if (ins.error && /variante_id/i.test(ins.error.message || '')) {
        const legacyRows = rows.map(({ variante_id, ...rest }) => rest)
        ins = await supabase.from('pedido_items').insert(legacyRows)
      }
      if (ins.error) return ins.error
      rpcErr = null
    }

    // Auto-envío a cocina (mismo comportamiento que las mesas).
    await supabase.rpc('enviar_a_cocina', { p_pedido_id: pedidoId }).catch(() => null)

    await recalcularTotalPedido(pedidoId)
    fetchPedidos()
    return null
  }

  const updateItemCantidadPedido = async (pedidoId, itemId, nuevaCantidad) => {
    const cant = parseInt(nuevaCantidad) || 0
    const result = cant <= 0
      ? await supabase.from('pedido_items').delete().eq('id', itemId)
      : await supabase.from('pedido_items').update({ cantidad: cant }).eq('id', itemId)
    if (!result.error) {
      await recalcularTotalPedido(pedidoId)
      fetchPedidos()
    }
    return result.error
  }

  const removeItemPedido = async (pedidoId, itemId) => {
    const { error: delErr } = await supabase.from('pedido_items').delete().eq('id', itemId)
    if (!delErr) {
      await recalcularTotalPedido(pedidoId)
      fetchPedidos()
    }
    return delErr
  }

  // Descuento tipo gift card sobre una orden (delivery / take away).
  const aplicarDescuentoOrden = async (pedidoId, { tipo, valor, alcance, seleccionIds }) => {
    const pedido = pedidos.find(p => p.id === pedidoId)
    const itemsPedido = pedido?.pedido_items || []
    const costoEnvio = Number(pedido?.costo_envio || 0)
    const res = await aplicarDescLib({ pedidoId, items: itemsPedido, tipo, valor, alcance, seleccionIds, costoEnvio })
    if (!res.error) fetchPedidos()
    return res
  }

  const quitarDescuentoOrden = async (pedidoId) => {
    const pedido = pedidos.find(p => p.id === pedidoId)
    const itemsPedido = pedido?.pedido_items || []
    const costoEnvio = Number(pedido?.costo_envio || 0)
    const res = await quitarDescLib({ pedidoId, items: itemsPedido, costoEnvio })
    if (!res.error) fetchPedidos()
    return res
  }

  /**
   * Actualiza los datos "de cabecera" de una orden: fecha/hora (created_at),
   * cliente (nombre / teléfono / dirección), mesa, personas, notas, canal, etc.
   * Update tolerante: si una columna no existe (migración no aplicada), la saca
   * del patch y reintenta, para no perder el resto de los cambios.
   */
  const actualizarDatosPedido = async (pedidoId, patch) => {
    const clean = { ...(patch || {}) }
    // Nunca dejamos que se cuele el id ni campos vacíos undefined.
    delete clean.id
    Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k] })
    if (Object.keys(clean).length === 0) return null

    // 1) Camino preferido: RPC SECURITY DEFINER. Saltea el bloqueo silencioso de
    //    RLS sobre `pedidos` (UPDATE directo que afecta 0 filas sin error) y
    //    valida el rol del lado del servidor.
    const { error: rpcErr } = await supabase.rpc('actualizar_datos_pedido', {
      p_pedido_id: pedidoId,
      p_patch:     clean,
    })
    if (!rpcErr) { fetchPedidos(); return null }
    // La RPC existe pero rechazó (p.ej. no autorizado): devolvemos ese error.
    if (!isMissingRpcFunction(rpcErr)) return rpcErr

    // 2) Fallback (RPC no aplicada aún): UPDATE directo. Usamos .select() para
    //    detectar el caso RLS —0 filas afectadas SIN error— y avisarlo en vez de
    //    fallar en silencio. Además sacamos columnas inexistentes y reintentamos.
    const work = { ...clean }
    for (let intento = 0; intento < 6; intento++) {
      const { data, error } = await supabase
        .from('pedidos').update(work).eq('id', pedidoId).select('id')

      if (error) {
        const msg = error.message || ''
        const columnaFaltante = Object.keys(work).find(k => new RegExp(`\\b${k}\\b`, 'i').test(msg))
        if (columnaFaltante && /does not exist|could not find|schema cache|column/i.test(msg)) {
          delete work[columnaFaltante]
          if (Object.keys(work).length === 0) { fetchPedidos(); return null }
          continue
        }
        return error
      }

      // Sin error pero sin filas => RLS bloqueó el UPDATE (permisos).
      if (!data || data.length === 0) {
        return new Error(
          'No se pudo guardar por permisos de la base (RLS). Aplicá la migración ' +
          '20260702000000_actualizar_datos_pedido.sql en Supabase, o verificá que ' +
          'tu usuario tenga rol operativo/admin.'
        )
      }

      fetchPedidos()
      return null
    }
    return null
  }

  return {
    pedidos, grouped, stats,
    loading, error,
    createPedido, avanzarEstado, cerrarPedido, cancelarPedido,
    reabrirPedido, reactivarPedido, agregarItemsPedido, updateItemCantidadPedido, removeItemPedido,
    aplicarDescuentoOrden, quitarDescuentoOrden, actualizarEnvioPedido, actualizarDatosPedido,
    refetch: fetchPedidos,
    isFacturado,
  }
}
