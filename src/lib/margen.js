// Margen de un plato o de un combo. Lógica pura (se prueba con
// `npm run verificar:finanzas`).
//
// El precio de la carta lleva el IVA adentro; el costo se carga SIN IVA (el
// precio del renglón de la factura del proveedor: ese IVA no es costo, se
// descuenta del IVA de las ventas). Comparar uno contra el otro tal cual da un
// margen de más: con un costo del 30 % del precio marcaba 70 % cuando en
// realidad es 63,7 %. Por eso el margen se calcula contra el precio SIN IVA.

/** Alícuota del IVA que lleva adentro el precio de la carta. */
export const IVA_CARTA = 21

/** Por debajo de este margen (%) el plato se marca en rojo. */
export const MARGEN_BAJO = 30

/** Precio de carta sin el IVA, o null si no hay precio. */
export function precioSinIva(precio, alicuota = IVA_CARTA) {
  const p = Number(precio)
  if (!Number.isFinite(p) || p <= 0) return null
  const a = Number(alicuota)
  return p / (1 + (Number.isFinite(a) && a > 0 ? a : 0) / 100)
}

/**
 * Margen (%) de vender a `precio` (de carta, con IVA) algo que cuesta `costo`
 * (sin IVA): cuánto de lo que le queda al negocio después del IVA no es costo.
 * null si no hay precio.
 */
export function margenSinIva(precio, costo, alicuota = IVA_CARTA) {
  const neto = precioSinIva(precio, alicuota)
  if (neto === null) return null
  return ((neto - (Number(costo) || 0)) / neto) * 100
}

export const esMargenBajo = (margen) => margen !== null && margen !== undefined && margen < MARGEN_BAJO

/** "$10.000" sin decimales, para mostrar el precio sin IVA al lado del de carta. */
export function textoSinIva(precio, alicuota = IVA_CARTA) {
  const neto = precioSinIva(precio, alicuota)
  return neto === null ? '' : `$${Math.round(neto).toLocaleString('es-AR')}`
}
