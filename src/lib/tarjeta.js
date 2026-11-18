// Gastos con tarjeta de crédito (pedido de administración del 18/11).
//
// Una compra con la tarjeta (la publicidad de Meta, la póliza del seguro) ya
// está pagada para el proveedor, pero la plata del negocio sale recién cuando
// se paga el resumen. Por eso se carga como PENDIENTE con medio "Tarjeta
// crédito": en Proyección de pagos va aparte, en "Tarjeta de crédito" (no como
// deuda vencida), y cuando se paga el resumen se marcan pagados todos juntos
// con la fecha del pago. Desde ahí cuentan en "Salió" y en el cash flow.
//
// No se carga el total del resumen como un pago aparte: se contaría dos veces.
// Lógica pura: se prueba con `npm run verificar:tarjeta`.

import { fmtFecha, fmtPlata, localDateISO } from './finanzas'
import { leerSaldo } from './disponible'

export const MEDIO_TARJETA = 'tarjeta_credito'

/** ¿Es un gasto con tarjeta que todavía no se pagó con el resumen? */
export function esDeTarjeta(e) {
  return Boolean(e) && e.estado === 'pendiente' && e.medio_pago === MEDIO_TARJETA
}

/** El día del cargo en la tarjeta: el vencimiento si lo tiene, si no la fecha. */
export function fechaDelCargo(e) {
  return String(e?.vencimiento || e?.fecha || '').slice(0, 10)
}

/** Separa los pendientes: los de la tarjeta (por fecha del cargo) y el resto. */
export function separarPendientes(pendientes = []) {
  const tarjeta = []
  const resto = []
  for (const e of pendientes) (esDeTarjeta(e) ? tarjeta : resto).push(e)
  tarjeta.sort((a, b) => fechaDelCargo(a).localeCompare(fechaDelCargo(b)) || String(a.descripcion).localeCompare(String(b.descripcion)))
  return { tarjeta, resto }
}

/** { total, cantidad, desde, hasta } de una lista de gastos con tarjeta. */
export function resumenTarjeta(items = []) {
  const fechas = items.map(fechaDelCargo).filter(Boolean).sort()
  return {
    total: Math.round(items.reduce((s, e) => s + (Number(e.monto) || 0), 0) * 100) / 100,
    cantidad: items.length,
    desde: fechas[0] || null,
    hasta: fechas[fechas.length - 1] || null,
  }
}

/** "3 compras" / "1 compra". */
export function textoCompras(n) {
  return `${n} ${n === 1 ? 'compra' : 'compras'}`
}

/**
 * Compara lo tildado con el total del resumen que dice el banco (opcional).
 * @returns {{ estado: 'sin_dato'|'invalido'|'coincide'|'falta'|'sobra', diferencia?, texto }}
 */
export function compararConResumen(totalTildado, textoResumen) {
  const t = String(textoResumen ?? '').trim()
  if (!t) return { estado: 'sin_dato', texto: '' }
  const resumen = leerSaldo(t)
  if (resumen === null || resumen < 0) return { estado: 'invalido', texto: 'Ese total no es un número.' }
  const dif = Math.round((resumen - totalTildado) * 100) / 100
  if (Math.abs(dif) < 1) return { estado: 'coincide', diferencia: 0, texto: 'Coincide con el resumen.' }
  if (dif > 0) {
    return {
      estado: 'falta', diferencia: dif,
      texto: `El resumen dice ${fmtPlata(resumen)}: faltan ${fmtPlata(dif)}. Puede ser una compra sin cargar, o los intereses y gastos del resumen: cargalos como pendientes con «Tarjeta crédito» y van a aparecer acá.`,
    }
  }
  return {
    estado: 'sobra', diferencia: -dif,
    texto: `El resumen dice ${fmtPlata(resumen)}: lo tildado tiene ${fmtPlata(-dif)} de más. Destildá lo que no vino en este resumen.`,
  }
}

/** Valida la fecha del pago del resumen: hoy o antes. */
export function validarFechaPago(fecha, hoyISO = localDateISO()) {
  const f = String(fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 'Poné la fecha en que se pagó el resumen.'
  if (f > hoyISO) return 'La fecha del pago no puede ser futura.'
  return null
}

/**
 * Lo que se le manda a editar_pago() por cada gasto del resumen: el mismo
 * pago, pagado, con la fecha del pago. No toca ninguna caja (es tarjeta).
 */
export function pagoDelResumen(e, fechaPago) {
  return {
    categoria: e.categoria,
    descripcion: e.descripcion,
    monto: Number(e.monto),
    medio_pago: MEDIO_TARJETA,
    estado: 'pagado',
    fecha: fechaPago,
    proveedor_id: e.proveedor_id || null,
    empleado_id: e.empleado_id || null,
    subtipo: e.subtipo || null,
    periodo: e.periodo || null,
    vencimiento: e.vencimiento || null,
    comprobante_nro: e.comprobante_nro || null,
    notas: e.notas || null,
    origen: 'ninguno',
  }
}

/** El texto de la fila en Proyección: "en la tarjeta desde el 14/11/2026". */
export function textoFilaTarjeta(e) {
  const f = fechaDelCargo(e)
  return f ? `en la tarjeta desde el ${fmtFecha(f)}` : 'en la tarjeta'
}
