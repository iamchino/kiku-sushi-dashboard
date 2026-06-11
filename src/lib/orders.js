export function parseCurrencyValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '')

  if (!cleaned) return 0

  const sign = cleaned.startsWith('-') ? -1 : 1
  const unsigned = cleaned.replace(/-/g, '')
  const hasComma = unsigned.includes(',')
  const hasDot = unsigned.includes('.')

  if (hasComma && hasDot) {
    const lastComma = unsigned.lastIndexOf(',')
    const lastDot = unsigned.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    const normalized = unsigned
      .replaceAll(thousandsSeparator, '')
      .replace(decimalSeparator, '.')
    return sign * (Number.parseFloat(normalized) || 0)
  }

  if (hasDot) {
    const parts = unsigned.split('.')
    const last = parts.at(-1) || ''
    const looksLikeThousands = parts.length > 2 || last.length === 3
    const normalized = looksLikeThousands ? parts.join('') : unsigned
    return sign * (Number.parseFloat(normalized) || 0)
  }

  if (hasComma) {
    const parts = unsigned.split(',')
    const last = parts.at(-1) || ''
    const looksLikeThousands = parts.length > 2 || last.length === 3
    const normalized = looksLikeThousands ? parts.join('') : unsigned.replace(',', '.')
    return sign * (Number.parseFloat(normalized) || 0)
  }

  return sign * (Number.parseFloat(unsigned) || 0)
}

export function clampDiscount(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.min(100, Math.max(0, number))
}

export function calculateOrderSubtotal(items = []) {
  return items.reduce(
    (acc, item) => acc + (parseCurrencyValue(item.precio_unitario) * Number(item.cantidad || 0)),
    0
  )
}

export function calculateDiscountAmount(subtotal, descuentoPorcentaje = 0) {
  const discount = clampDiscount(descuentoPorcentaje)
  return Math.round((Number(subtotal || 0) * discount) / 100)
}

export function calculateOrderTotal(items = [], descuentoPorcentaje = 0) {
  const subtotal = calculateOrderSubtotal(items)
  const discountAmount = calculateDiscountAmount(subtotal, descuentoPorcentaje)
  return Math.max(0, subtotal - discountAmount)
}

// ── Descuentos tipo "gift card" (monto o %, sobre todo el pedido o ítems elegidos) ──

/**
 * Monto de descuento efectivo de un pedido, dado su subtotal.
 * Prioriza descuento_monto (ya calculado: gift card / selección); si no, cae al
 * descuento_porcentaje viejo. Nunca supera el subtotal.
 */
export function effectiveDiscountAmount(subtotal, pedido) {
  const sub = Number(subtotal || 0)
  if (pedido?.descuento_monto != null && pedido.descuento_monto !== '') {
    return Math.min(Math.max(0, Math.round(Number(pedido.descuento_monto) || 0)), sub)
  }
  return calculateDiscountAmount(sub, pedido?.descuento_porcentaje)
}

/** Total del pedido a partir de sus items aplicando el descuento guardado. */
export function applyStoredDiscount(items, pedido) {
  const subtotal = calculateOrderSubtotal(items)
  const descuentoMonto = effectiveDiscountAmount(subtotal, pedido)
  return { subtotal, descuentoMonto, total: Math.max(0, subtotal - descuentoMonto) }
}

/**
 * Lee la config de descuento de un pedido en forma normalizada, con
 * compatibilidad hacia el descuento_porcentaje viejo.
 */
export function getDescuentoConfig(pedido) {
  const tieneNuevo = pedido?.descuento_tipo || pedido?.descuento_monto != null
  if (!tieneNuevo && Number(pedido?.descuento_porcentaje) > 0) {
    return { tipo: 'porcentaje', valor: Number(pedido.descuento_porcentaje), alcance: 'todo', seleccionIds: [] }
  }
  return {
    tipo:         pedido?.descuento_tipo || 'porcentaje',
    valor:        Number(pedido?.descuento_valor ?? pedido?.descuento_porcentaje ?? 0),
    alcance:      pedido?.descuento_alcance || 'todo',
    seleccionIds: Array.isArray(pedido?.descuento_items) ? pedido.descuento_items : [],
  }
}

/**
 * Calcula un descuento "en vivo" desde una configuración elegida en la UI.
 * Devuelve { subtotal, base, descuentoMonto, total }.
 */
export function previewDescuento({ items = [], tipo = 'porcentaje', valor = 0, alcance = 'todo', seleccionIds = [] }) {
  const subtotal = calculateOrderSubtotal(items)
  const sel = new Set(seleccionIds || [])
  const base = alcance === 'seleccion'
    ? items
        .filter(i => sel.has(i.id))
        .reduce((acc, i) => acc + parseCurrencyValue(i.precio_unitario) * Number(i.cantidad || 0), 0)
    : subtotal
  let descuentoMonto = 0
  if (tipo === 'monto') {
    descuentoMonto = Math.min(Math.max(0, Math.round(Number(valor) || 0)), base)
  } else {
    descuentoMonto = calculateDiscountAmount(base, valor)
  }
  return { subtotal, base, descuentoMonto, total: Math.max(0, subtotal - descuentoMonto) }
}
