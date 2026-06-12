import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculateOrderSubtotal, clampDiscount, parseCurrencyValue, applyStoredDiscount, getDescuentoConfig, effectiveDiscountAmount } from '../lib/orders'
import { aplicarDescuentoPedido, quitarDescuentoPedido } from '../lib/descuento'
import { getAuthorizedComprobante } from '../lib/fiscal'

/**
 * Hook que maneja el pedido abierto de UNA mesa.
 */
export function useMesaPedido({ mesaId } = {}) {
  const [pedido,  setPedido]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 10))

  const fetchPedido = useCallback(async () => {
    if (!mesaId) {
      setPedido(null)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data, error: qErr } = await supabase
      .from('pedidos')
      .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas, menu_item_id, variante_id, enviado_cocina, enviado_at), comprobantes_fiscales(*)')
      .eq('mesa_id', mesaId)
      .in('estado', ['pendiente', 'preparando', 'listo'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (qErr) {
      console.error('[useMesaPedido] error al cargar pedido:', qErr)
      setError(qErr.message)
    } else {
      setError(null)
    }

    if (data?.pedido_items) {
      data.pedido_items = [...data.pedido_items].sort((a, b) => {
        const ta = a.enviado_at ? new Date(a.enviado_at).getTime() : Number.POSITIVE_INFINITY
        const tb = b.enviado_at ? new Date(b.enviado_at).getTime() : Number.POSITIVE_INFINITY
        return ta - tb
      })
    }

    setPedido(data || null)
    setLoading(false)
  }, [mesaId])

  useEffect(() => {
    fetchPedido()
    if (!mesaId) return

    const channel = supabase
      .channel(`mesa-pedido-${mesaId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },               fetchPedido)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' },          fetchPedido)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes_fiscales' }, fetchPedido)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [mesaId, fetchPedido, instanceId])

  // ── Derivados ───────────────────────────────────────────────────────────
  const items = useMemo(() => pedido?.pedido_items || [], [pedido])
  const itemsNoEnviados = useMemo(() => items.filter(i => !i.enviado_cocina), [items])
  const itemsEnviados   = useMemo(() => items.filter(i =>  i.enviado_cocina), [items])

  const subtotal = useMemo(() => calculateOrderSubtotal(items), [items])
  const descuentoInfo = useMemo(() => applyStoredDiscount(items, pedido), [items, pedido])
  const descuentoMonto = descuentoInfo.descuentoMonto
  const total = descuentoInfo.total
  const descuentoConfig = useMemo(() => getDescuentoConfig(pedido), [pedido])
  // Compat: % efectivo solo cuando el descuento es porcentaje sobre todo.
  const descuentoPct = (descuentoConfig.tipo === 'porcentaje' && descuentoConfig.alcance === 'todo')
    ? clampDiscount(descuentoConfig.valor)
    : 0

  const comprobanteAutorizado = pedido ? getAuthorizedComprobante(pedido) : null
  const facturada = Boolean(comprobanteAutorizado)

  // Contador interno de repeticiones (rondas) de Kiku libre — total de la mesa.
  const rondasKiku = pedido?.kiku_libre_rondas || 0

  // ── Acciones ────────────────────────────────────────────────────────────
  const abrirMesa = async ({ personas, mozoId = null, clienteNombre = null, clienteTelefono = null }) => {
    if (!mesaId) return { error: new Error('mesaId requerido') }
    const personasInt = Math.max(1, parseInt(personas) || 1)
    const { data, error: rpcErr } = await supabase.rpc('abrir_mesa', {
      p_mesa_id:          mesaId,
      p_personas:         personasInt,
      p_mozo_id:          mozoId,
      p_cliente_nombre:   clienteNombre?.trim()   || null,
      p_cliente_telefono: clienteTelefono?.trim() || null,
    })
    if (!rpcErr) fetchPedido()
    return { pedidoId: data, error: rpcErr }
  }

  const agregarItems = async (newItems) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
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
    if (normalized.length === 0) return { error: new Error('Sin items para agregar') }

    const { error: rpcErr } = await supabase.rpc('agregar_items_pedido', {
      p_pedido_id: pedido.id,
      p_items:     normalized,
    })
    if (rpcErr) {
      console.error('[useMesaPedido] error al agregar items:', rpcErr)
      return { error: rpcErr }
    }

    // Auto-envío a cocina: al ya no existir el botón manual "Enviar a cocina",
    // los items se marcan como enviados automáticamente y el pedido avanza
    // pendiente→preparando. Así aparece como Activa en Ordenes.
    const { error: enviarErr } = await supabase.rpc('enviar_a_cocina', {
      p_pedido_id: pedido.id,
    })
    if (enviarErr) {
      console.warn('[useMesaPedido] items agregados pero error al auto-enviar a cocina:', enviarErr)
    }

    fetchPedido()
    return { error: null }
  }

  const recalcularTotal = useCallback(async (pedidoId) => {
    const { data: items2 } = await supabase
      .from('pedido_items')
      .select('precio_unitario, cantidad')
      .eq('pedido_id', pedidoId)
    const sub = (items2 || []).reduce(
      (acc, i) => acc + (parseCurrencyValue(i.precio_unitario) * (parseInt(i.cantidad) || 0)),
      0
    )
    const tot = Math.max(0, sub - effectiveDiscountAmount(sub, pedido))
    await supabase.from('pedidos').update({ total: tot }).eq('id', pedidoId)
  }, [pedido])

  const updateItemCantidad = async (itemId, nuevaCantidad) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const cant = parseInt(nuevaCantidad) || 0
    const result = cant <= 0
      ? await supabase.from('pedido_items').delete().eq('id', itemId)
      : await supabase.from('pedido_items').update({ cantidad: cant }).eq('id', itemId)
    if (!result.error) {
      await recalcularTotal(pedido.id)
      fetchPedido()
    }
    return { error: result.error }
  }

  const removeItem = async (itemId) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const { error: delErr } = await supabase.from('pedido_items').delete().eq('id', itemId)
    if (!delErr) {
      await recalcularTotal(pedido.id)
      fetchPedido()
    }
    return { error: delErr }
  }

  const updateItemNotas = async (itemId, notas) => {
    const { error: updErr } = await supabase.from('pedido_items').update({ notas: notas || null }).eq('id', itemId)
    if (!updErr) fetchPedido()
    return { error: updErr }
  }

  const enviarACocina = async () => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const { data, error: rpcErr } = await supabase.rpc('enviar_a_cocina', {
      p_pedido_id: pedido.id,
    })
    if (!rpcErr) fetchPedido()
    return { enviados: data || 0, error: rpcErr }
  }

  const cerrarMesa = async () => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const { error: rpcErr } = await supabase.rpc('cerrar_mesa', {
      p_pedido_id: pedido.id,
    })
    if (!rpcErr) fetchPedido()
    return { error: rpcErr }
  }

  const cancelarMesa = async () => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const { error: updErr } = await supabase.from('pedidos').update({
      estado: 'cancelado',
      cerrada_at: new Date().toISOString(),
    }).eq('id', pedido.id)
    if (!updErr) fetchPedido()
    return { error: updErr }
  }

  const updatePedidoPatch = async (patch) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const { error: updErr } = await supabase.from('pedidos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', pedido.id)
    if (!updErr) fetchPedido()
    return { error: updErr }
  }

  const setDescuento = async (porcentaje) => {
    const desc = clampDiscount(porcentaje)
    const { error: updErr } = await updatePedidoPatch({ descuento_porcentaje: desc })
    if (!updErr && pedido) await recalcularTotal(pedido.id)
    return { error: updErr }
  }

  // Descuento tipo gift card (monto o %, todo el pedido o ítems elegidos).
  const aplicarDescuento = async ({ tipo, valor, alcance, seleccionIds }) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const res = await aplicarDescuentoPedido({ pedidoId: pedido.id, items, tipo, valor, alcance, seleccionIds })
    if (!res.error) fetchPedido()
    return res
  }

  const quitarDescuento = async () => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const res = await quitarDescuentoPedido({ pedidoId: pedido.id, items })
    if (!res.error) fetchPedido()
    return res
  }

  // Setea el contador de rondas de Kiku libre. Tolera que falte la columna.
  const setRondasKiku = async (n) => {
    if (!pedido) return { error: new Error('No hay pedido abierto') }
    const val = Math.max(0, parseInt(n) || 0)
    let { error: updErr } = await supabase
      .from('pedidos')
      .update({ kiku_libre_rondas: val })
      .eq('id', pedido.id)
    if (updErr && /kiku_libre_rondas/i.test(updErr.message || '')) {
      updErr = new Error('Falta aplicar la migración de Kiku libre en Supabase.')
    }
    if (!updErr) fetchPedido()
    return { error: updErr, value: val }
  }

  return {
    pedido,
    items,
    itemsNoEnviados,
    itemsEnviados,
    subtotal,
    descuentoPct,
    descuentoMonto,
    total,
    rondasKiku,
    facturada,
    comprobanteAutorizado,
    loading,
    error,
    refetch: fetchPedido,
    abrirMesa,
    agregarItems,
    updateItemCantidad,
    updateItemNotas,
    removeItem,
    enviarACocina,
    cerrarMesa,
    cancelarMesa,
    updatePedidoPatch,
    setDescuento,
    aplicarDescuento,
    quitarDescuento,
    setRondasKiku,
  }
}
