// Precio de venta de un producto del menú.
//
// menu_items.precio es TEXTO de display en formato argentino ("$12.500",
// "12500", "$1.250,50") y menu_items.precio_num es el numérico canónico.
// Parsear "$12.500" con parseFloat da 12.5: por eso acá se replica la regla
// de la función SQL kiku_parse_precio_ar (migración 20260524).

export function parsePrecioAR(input) {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return isFinite(input) ? input : null
  const raw = String(input).trim()
  if (!raw || raw.includes('/')) return null             // "5p: $12.500 / 9p: $23.200"
  // Primer número con sus separadores: "12.500", "12500", "1.250,50", "12.50".
  const m = raw.match(/[0-9]+(?:[.,][0-9]+)*/)
  if (!m) return null
  let clean = m[0]
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.')   // coma = decimal, punto = miles
  } else if (/\.[0-9]{3}$/.test(clean)) {
    clean = clean.replace(/\./g, '')                     // "12.500" → 12500
  }
  const num = parseFloat(clean)
  return isFinite(num) ? num : null
}

// Precio de venta de un menu_item: precio_num si existe, si no el texto.
export function precioVentaDe(menuItem) {
  if (!menuItem) return null
  const num = parseFloat(menuItem.precio_num)
  if (isFinite(num) && num > 0) return num
  return parsePrecioAR(menuItem.precio)
}
