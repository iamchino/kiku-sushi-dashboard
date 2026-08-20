// Helpers de forma de pago a nivel pedido.
//
// La verdad de cómo se cobró una orden vive en la tabla `pagos` (una fila por
// medio, soporta pago dividido). Para cobros viejos o hechos fuera de caja se
// cae al campo `pedidos.medio_pago`, que guarda un único medio informado.
import { MEDIO_PAGO_LABELS } from './escposFormatter'

// Orden y color de los medios que acepta la base (constraint de `pagos`).
export const MEDIOS_PAGO_ORDEN = [
  { id: 'efectivo',        label: 'Efectivo',        color: '#34d399' },
  { id: 'transferencia',   label: 'Transferencia',   color: '#4f8ef7' },
  { id: 'tarjeta_debito',  label: 'Tarjeta débito',  color: '#a78bfa' },
  { id: 'tarjeta_credito', label: 'Tarjeta crédito', color: '#f472b6' },
]

/**
 * Etiqueta legible de un medio de pago para pantalla (con acentos).
 * Los tickets impresos usan MEDIO_PAGO_LABELS, que va sin acentos por ESC/POS.
 */
export function etiquetaMedioPago(medio) {
  if (!medio || medio === 'sin_pago') return 'Sin registrar'
  return MEDIOS_PAGO_ORDEN.find(m => m.id === medio)?.label
    || MEDIO_PAGO_LABELS[medio]
    || String(medio)
}

/** Color asociado a un medio de pago (gris si es desconocido). */
export function colorMedioPago(medio) {
  return MEDIOS_PAGO_ORDEN.find(m => m.id === medio)?.color || 'var(--text-secondary)'
}

/**
 * Líneas de cobro de un pedido, ordenadas por hora.
 * Devuelve [] si la orden todavía no registra cobro.
 */
export function lineasDePago(pedido) {
  const pagos = Array.isArray(pedido?.pagos) ? [...pedido.pagos] : []
  if (pagos.length > 0) {
    return pagos
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(p => ({
        medio: p.medio_pago,
        monto: Number(p.monto) || 0,
        nroOp: p.numero_operacion || null,
        notas: p.notas || null,
        at: p.created_at || null,
      }))
  }
  if (pedido?.medio_pago && pedido.medio_pago !== 'sin_pago') {
    return [{
      medio: pedido.medio_pago,
      monto: Number(pedido.total) || 0,
      nroOp: null,
      notas: null,
      at: null,
      estimado: true,   // no viene de `pagos`: es el medio informado en el pedido
    }]
  }
  return []
}

/**
 * Resumen del conjunto de pedidos por medio de pago.
 * `medios` trae siempre los cuatro del catálogo (aunque estén en cero) más los
 * que aparezcan en los datos y no estén catalogados.
 */
export function resumenMediosPago(pedidos = []) {
  const acumulado = new Map()
  let sinRegistrar = 0
  let totalCobrado = 0

  pedidos.forEach(pedido => {
    const lineas = lineasDePago(pedido)
    if (lineas.length === 0) {
      sinRegistrar += 1
      return
    }
    lineas.forEach(linea => {
      const prev = acumulado.get(linea.medio) || { monto: 0, cobros: 0 }
      prev.monto += linea.monto
      prev.cobros += 1
      acumulado.set(linea.medio, prev)
      totalCobrado += linea.monto
    })
  })

  const catalogados = MEDIOS_PAGO_ORDEN.map(m => ({
    ...m,
    ...(acumulado.get(m.id) || { monto: 0, cobros: 0 }),
  }))
  const fueraDeCatalogo = [...acumulado.entries()]
    .filter(([id]) => !MEDIOS_PAGO_ORDEN.some(m => m.id === id))
    .map(([id, v]) => ({ id, label: etiquetaMedioPago(id), color: 'var(--text-secondary)', ...v }))

  return { medios: [...catalogados, ...fueraDeCatalogo], sinRegistrar, totalCobrado }
}
