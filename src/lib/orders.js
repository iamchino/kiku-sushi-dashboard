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
