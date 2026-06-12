import { supabase } from './supabase'
import { previewDescuento, calculateOrderSubtotal, effectiveDiscountAmount, clampDiscount } from './orders'

/**
 * Aplica/actualiza el descuento de un pedido (tipo gift card).
 * Calcula el monto, lo guarda junto con la config y recalcula el total.
 *
 * @param {object}  args
 * @param {string}  args.pedidoId
 * @param {array}   args.items        pedido_items (para calcular el monto)
 * @param {'porcentaje'|'monto'} args.tipo
 * @param {number}  args.valor        el % o los $
 * @param {'todo'|'seleccion'} args.alcance
 * @param {string[]} [args.seleccionIds]  ids de items a los que aplica (si alcance='seleccion')
 */
export async function aplicarDescuentoPedido({ pedidoId, items, tipo, valor, alcance, seleccionIds = [], costoEnvio = 0 }) {
  if (!pedidoId) return { error: new Error('Falta el pedido.') }

  const envio = Math.max(0, Math.round(Number(costoEnvio) || 0))
  const prev = previewDescuento({ items, tipo, valor, alcance, seleccionIds })
  const { subtotal, descuentoMonto } = prev
  // El envío se suma al total (no se descuenta).
  const total = prev.total + envio

  const patchCompleto = {
    descuento_tipo:    tipo,
    descuento_valor:   Number(valor) || 0,
    descuento_alcance: alcance,
    descuento_monto:   descuentoMonto,
    descuento_items:   alcance === 'seleccion' ? seleccionIds : [],
    // compat: el % viejo solo tiene sentido cuando es porcentaje sobre todo el pedido
    descuento_porcentaje: (tipo === 'porcentaje' && alcance === 'todo') ? clampDiscount(valor) : 0,
    total,
  }

  let { error } = await supabase.from('pedidos').update(patchCompleto).eq('id', pedidoId)

  // Si faltan las columnas nuevas (migración no aplicada), degradamos a lo que
  // se pueda: total siempre, y % solo si es el caso simple.
  if (error && /descuento_(tipo|valor|alcance|monto|items)/i.test(error.message || '')) {
    const safe = { total }
    if (tipo === 'porcentaje' && alcance === 'todo') safe.descuento_porcentaje = clampDiscount(valor)
    const retry = await supabase.from('pedidos').update(safe).eq('id', pedidoId)
    error = retry.error
    if (!error) {
      return { error: null, total, descuentoMonto, subtotal, degraded: true }
    }
  }

  return { error, total, descuentoMonto, subtotal }
}

/** Quita el descuento de un pedido y recalcula el total (= subtotal + envío). */
export async function quitarDescuentoPedido({ pedidoId, items, costoEnvio = 0 }) {
  if (!pedidoId) return { error: new Error('Falta el pedido.') }
  const subtotal = calculateOrderSubtotal(items)
  const envio = Math.max(0, Math.round(Number(costoEnvio) || 0))
  const total = subtotal + envio

  const patch = {
    descuento_tipo: 'porcentaje',
    descuento_valor: 0,
    descuento_alcance: 'todo',
    descuento_monto: 0,
    descuento_items: [],
    descuento_porcentaje: 0,
    total,
  }
  let { error } = await supabase.from('pedidos').update(patch).eq('id', pedidoId)
  if (error && /descuento_(tipo|valor|alcance|monto|items)/i.test(error.message || '')) {
    const retry = await supabase.from('pedidos').update({ descuento_porcentaje: 0, total }).eq('id', pedidoId)
    error = retry.error
  }
  return { error, total }
}

/** Recalcula el total guardado de un pedido respetando su descuento y envío actuales. */
export async function recomputarTotalPedido(pedidoId) {
  const [{ data: pedido }, { data: items }] = await Promise.all([
    supabase.from('pedidos').select('descuento_monto, descuento_porcentaje, costo_envio').eq('id', pedidoId).maybeSingle(),
    supabase.from('pedido_items').select('precio_unitario, cantidad').eq('pedido_id', pedidoId),
  ])
  const subtotal = calculateOrderSubtotal(items || [])
  const descuentoMonto = effectiveDiscountAmount(subtotal, pedido || {})
  const envio = Math.max(0, Number(pedido?.costo_envio || 0))
  const total = Math.max(0, subtotal - descuentoMonto) + envio
  await supabase.from('pedidos').update({ total }).eq('id', pedidoId)
  return total
}
