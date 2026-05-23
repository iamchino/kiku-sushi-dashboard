import { useCallback, useEffect, useMemo, useState } from 'react'
import { startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'
import { buildFiscalRequest, getAuthorizedComprobante, normalizeComprobanteResponse } from '../lib/fiscal'
import { printComanda, printCustomerTicket, printFiscalTicket } from '../lib/printing'
import { calculateOrderTotal, clampDiscount, parseCurrencyValue } from '../lib/orders'

const ARCA_API_BASE = (import.meta.env.VITE_ARCA_API_URL || '').replace(/\/$/, '')
const ARCA_COMPROBANTES_URL = import.meta.env.VITE_ARCA_COMPROBANTES_URL
  || (ARCA_API_BASE ? `${ARCA_API_BASE}/api/arca/comprobantes` : '')

function sortPedidos(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function normalizePedidoItems(items) {
  return items
    .filter(item => String(item.nombre || '').trim())
    .map(item => ({
      nombre: String(item.nombre || '').trim(),
      cantidad: Math.max(1, Number(item.cantidad || 1)),
      precio_unitario: parseCurrencyValue(item.precio_unitario),
      notas: item.notas || null,
      menu_item_id: item.menu_item_id || null,
      variante_id: item.variante_id || null,
    }))
}

function withoutVariantId(items) {
  return items.map(item => {
    const copy = { ...item }
    delete copy.variante_id
    return copy
  })
}

export function useFacturacion() {
  const [pedidos, setPedidos] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [setupWarning, setSetupWarning] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSetupWarning(null)

    const start = startOfDay(new Date()).toISOString()

    const pedidosQuery = supabase
      .from('pedidos')
      .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas, menu_item_id, variante_id), comprobantes_fiscales(*)')
      .gte('created_at', start)
      .neq('estado', 'cancelado')
      .order('created_at', { ascending: false })

    let { data: pedidosData, error: pedidosError } = await pedidosQuery

    if (pedidosError) {
      const fallback = await supabase
        .from('pedidos')
        .select('*, pedido_items(id, nombre, cantidad, precio_unitario, notas, menu_item_id, variante_id)')
        .gte('created_at', start)
        .neq('estado', 'cancelado')
        .order('created_at', { ascending: false })

      pedidosData = fallback.data
      pedidosError = fallback.error
      setSetupWarning('Falta ejecutar la migracion de facturacion en Supabase.')
    }

    const { data: configData, error: configError } = await supabase
      .from('facturacion_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pedidosError) setError(pedidosError.message)
    if (configError) setSetupWarning('Falta configurar los datos fiscales de Kiku en Supabase.')

    setPedidos((pedidosData || []).sort(sortPedidos))
    setConfig(configData || null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('caja-facturacion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes_fiscales' }, fetchData)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchData])

  const arcaReady = Boolean(ARCA_COMPROBANTES_URL && config?.cuit && config?.punto_venta)

  const stats = useMemo(() => {
    const total = pedidos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0)
    const facturados = pedidos.filter(getAuthorizedComprobante)
    const pendiente = pedidos.filter(pedido => !getAuthorizedComprobante(pedido))

    return {
      pedidos: pedidos.length,
      total,
      facturados: facturados.length,
      pendientes: pendiente.length,
    }
  }, [pedidos])

  const registrarImpresion = useCallback(async ({ pedido, comprobante, tipo }) => {
    await supabase
      .from('impresiones_documentos')
      .insert({
        pedido_id: pedido?.id || null,
        comprobante_id: comprobante?.id || null,
        tipo,
        destino: 'comandera_usb',
        metadata: {
          pedido_total: pedido?.total || 0,
          comprobante_numero: comprobante?.numero || null,
        },
      })
  }, [])

  const imprimirComanda = useCallback(async (pedido) => {
    printComanda(pedido)
    await registrarImpresion({ pedido, tipo: 'comanda' }).catch(() => null)
  }, [registrarImpresion])

  const imprimirTicket = useCallback(async (pedido, comprobante) => {
    printFiscalTicket(pedido, comprobante, config)
    await registrarImpresion({ pedido, comprobante, tipo: 'ticket_fiscal' }).catch(() => null)
  }, [config, registrarImpresion])

  const imprimirTicketNoFiscal = useCallback(async (pedido) => {
    printCustomerTicket(pedido, config)
    await registrarImpresion({ pedido, tipo: 'ticket_no_fiscal' }).catch(() => null)
  }, [config, registrarImpresion])

  const actualizarPedido = useCallback(async (pedidoId, values) => {
    const items = normalizePedidoItems(values.items || [])
    if (items.length === 0) throw new Error('El pedido debe tener al menos un item.')

    const descuento = clampDiscount(values.descuento_porcentaje)
    const total = calculateOrderTotal(items, descuento)

    let { error: pedidoError } = await supabase
      .from('pedidos')
      .update({
        canal: values.canal,
        mesa: values.mesa || null,
        notas: values.notas || null,
        total,
        descuento_porcentaje: descuento,
      })
      .eq('id', pedidoId)

    if (pedidoError && /descuento_porcentaje/i.test(pedidoError.message || '')) {
      const retry = await supabase
        .from('pedidos')
        .update({
          canal: values.canal,
          mesa: values.mesa || null,
          notas: values.notas || null,
          total,
        })
        .eq('id', pedidoId)

      pedidoError = retry.error
    }

    if (pedidoError) throw pedidoError

    const { error: deleteError } = await supabase
      .from('pedido_items')
      .delete()
      .eq('pedido_id', pedidoId)

    if (deleteError) throw deleteError

    let { error: insertError } = await supabase
      .from('pedido_items')
      .insert(items.map(item => ({ ...item, pedido_id: pedidoId })))

    if (insertError && /variante_id/i.test(insertError.message || '')) {
      const retry = await supabase
        .from('pedido_items')
        .insert(withoutVariantId(items).map(item => ({ ...item, pedido_id: pedidoId })))

      insertError = retry.error
    }

    if (insertError) throw insertError

    await fetchData()
    return { ...values, id: pedidoId, pedido_items: items, descuento_porcentaje: descuento, total }
  }, [fetchData])

  const facturarEImprimir = useCallback(async (pedido) => {
    const existing = getAuthorizedComprobante(pedido)
    if (existing) {
      await imprimirTicket(pedido, existing)
      return existing
    }

    if (!arcaReady) {
      throw new Error('El conector ARCA no esta configurado. Falta backend WSFE, CUIT o punto de venta.')
    }

    const payload = buildFiscalRequest(pedido, config)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    const response = await fetch(ARCA_COMPROBANTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result?.message || result?.error || 'ARCA rechazo o no respondio la solicitud.')
    }

    const comprobante = normalizeComprobanteResponse(result, pedido, config)
    if (!comprobante.cae || !comprobante.numero) {
      throw new Error('ARCA no devolvio CAE o numero de comprobante.')
    }

    const { data, error: insertError } = await supabase
      .from('comprobantes_fiscales')
      .insert(comprobante)
      .select()
      .single()

    if (insertError) throw insertError

    await imprimirTicket(pedido, data)
    await fetchData()
    return data
  }, [arcaReady, config, fetchData, imprimirTicket])

  return {
    pedidos,
    config,
    loading,
    error,
    setupWarning,
    stats,
    arcaReady,
    arcaComprobantesUrl: ARCA_COMPROBANTES_URL,
    refetch: fetchData,
    imprimirComanda,
    imprimirTicketNoFiscal,
    imprimirTicket,
    actualizarPedido,
    facturarEImprimir,
  }
}
