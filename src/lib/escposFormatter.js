/**
 * Convierte pedidos / comprobantes en texto plano formateado para una impresora
 * termica de 58 mm (32 columnas a fuente normal).
 *
 * El servicio GG EZ Print agrega los bytes ESC/POS de init / corte / feed.
 * Nosotros solo escribimos texto, con saltos de linea, alineaciones manuales,
 * y separadores con guiones.
 *
 * Para tickets mas anchos (papel 80mm = ~48 cols) pasar `width` distinto.
 */

import { buildArcaQrUrl, formatReceiptNumber, nombreComprobante } from './fiscal'

// El QR del ticket fiscal se genera SERVER-SIDE por GG EZ Print (Go).
// Nosotros solo dejamos un marker `{{QR}}` en el contenido y mandamos
// la URL aparte en el campo `qr_code_data`. De esta forma evitamos el
// problema de que JSON+Go expanden bytes > 127 a UTF-8 multi-byte.
import { applyStoredDiscount } from './orders'

const CANAL_LABELS = {
  salon: 'Salon',
  llevar: 'Take Away',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
}

const DELIVERY_CHANNELS = new Set(['delivery', 'pedidosya', 'rappi'])
const TAKEAWAY_CHANNELS = new Set(['llevar', 'takeaway', 'take_away', 'take-away', 'take away', 'whatsapp'])

const DEFAULT_WIDTH = 32

// Datos de transferencia que se imprimen al pie de los tickets de cliente
// (pre-cuenta) y fiscal. NO se imprimen en la comanda de cocina.
// Se pueden sobreescribir desde facturacion_config si algún día se agregan
// las columnas correspondientes.
export const TRANSFER_TITULAR = 'Kiku Sushi S.A.S'
export const TRANSFER_ALIAS = 'kiku.sushi.galicia'

// Etiquetas legibles de los medios de pago para imprimir en los tickets.
export const MEDIO_PAGO_LABELS = {
  efectivo:        'Efectivo',
  tarjeta_credito: 'Tarjeta Credito',
  tarjeta_debito:  'Tarjeta Debito',
  transferencia:   'Transferencia',
  sin_pago:        'Sin pago',
}

/** Devuelve la etiqueta legible de un medio de pago (o null si no aplica). */
export function medioPagoLabel(medio) {
  if (!medio || medio === 'sin_pago') return null
  return MEDIO_PAGO_LABELS[medio] || String(medio)
}

// --------- helpers de formato ----------

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return date.toLocaleDateString('es-AR')
}

/** Quita acentos para evitar problemas con la pagina de codigos por defecto. */
function ascii(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/[“”‘’]/g, '"')
}

function pad(text, width, align = 'left') {
  const str = ascii(text)
  if (str.length >= width) return str.slice(0, width)
  const space = ' '.repeat(width - str.length)
  if (align === 'right') return space + str
  if (align === 'center') {
    const left = Math.floor((width - str.length) / 2)
    const right = width - str.length - left
    return ' '.repeat(left) + str + ' '.repeat(right)
  }
  return str + space
}

function line(width, char = '-') {
  return char.repeat(width)
}

function center(text, width) {
  return pad(text, width, 'center')
}

function row(left, right, width) {
  const l = ascii(left)
  const r = ascii(right)
  if (l.length + r.length + 1 <= width) {
    return l + ' '.repeat(width - l.length - r.length) + r
  }
  // No entra: cortamos el izquierdo y dejamos el derecho intacto.
  const max = Math.max(0, width - r.length - 1)
  return ascii(l).slice(0, max).padEnd(width - r.length) + r
}

/** Envuelve un texto largo en lineas de `width` columnas, indentado opcional. */
function wrap(text, width, indent = '') {
  const result = []
  const words = ascii(text).split(/\s+/)
  let current = ''
  const maxLine = width - indent.length
  for (const w of words) {
    if (!w) continue
    if (!current) {
      current = w
    } else if (current.length + 1 + w.length <= maxLine) {
      current += ' ' + w
    } else {
      result.push(indent + current)
      current = w
    }
    while (current.length > maxLine) {
      result.push(indent + current.slice(0, maxLine))
      current = current.slice(maxLine)
    }
  }
  if (current) result.push(indent + current)
  return result
}

function normalizeItems(pedido) {
  return (pedido?.pedido_items || pedido?.items || []).map(item => ({
    id: item.id || item._key || `${item.nombre}-${item.cantidad}`,
    nombre: item.nombre,
    cantidad: Number(item.cantidad || 1),
    precio_unitario: Number(item.precio_unitario || 0),
    notas: item.notas || '',
  }))
}

function hasMesa(pedido) {
  return pedido?.mesa !== null && pedido?.mesa !== undefined && String(pedido.mesa).trim() !== ''
}

export function getComandaDestinationLabel(pedido) {
  const canal = String(pedido?.canal || '').trim().toLowerCase()

  if ((canal === 'salon' || pedido?.mesa_id || hasMesa(pedido)) && hasMesa(pedido)) {
    return `MESA ${pedido.mesa}`
  }

  if (canal === 'salon' || pedido?.mesa_id) return 'SALON'
  if (pedido?.cliente_direccion || DELIVERY_CHANNELS.has(canal)) return 'DELIVERY'
  if (TAKEAWAY_CHANNELS.has(canal)) return 'TAKE AWAY'

  return ascii(CANAL_LABELS[canal] || pedido?.canal || 'Pedido').toUpperCase()
}

function clienteBlock(pedido, width) {
  const nombre    = pedido?.cliente_nombre?.trim()
  const telefono  = pedido?.cliente_telefono?.trim()
  const direccion = pedido?.cliente_direccion?.trim()
  if (!nombre && !telefono && !direccion) return []
  const out = [line(width)]
  if (nombre)    out.push(row('Cliente', nombre, width))
  if (telefono)  out.push(row('Tel', telefono, width))
  if (direccion) {
    out.push('Direccion:')
    out.push(...wrap(direccion, width))
  }
  return out
}

/** Bloque de datos de transferencia para el pie de ticket cliente/fiscal. */
function transferBlock(width, config) {
  const titular = config?.transfer_titular || TRANSFER_TITULAR
  const alias   = config?.transfer_alias   || TRANSFER_ALIAS
  return [
    line(width),
    center('TRANSFERENCIAS', width),
    center(titular, width),
    center(`Alias: ${alias}`, width),
  ]
}

// --------- builders publicos ----------

export function buildComandaText(pedido, opts = {}) {
  const width = opts.width || DEFAULT_WIDTH
  const items = normalizeItems(pedido)
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const rondaLabel = pedido?._ronda_label || null
  const destinationLabel = getComandaDestinationLabel(pedido)

  // Para que la fecha y hora se vean separadas como en el ticket de referencia
  const dt = pedido?.created_at ? new Date(pedido.created_at) : new Date()
  const fecha = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const out = []

  // Header: "ORDEN" en grande (con doble fila para que se note más)
  out.push(line(width, '='))
  out.push(center('ORDEN', width))
  out.push(center(destinationLabel, width))
  out.push(line(width, '='))
  out.push('')

  // Ronda: se destaca cuando se reimprime solo una tanda adicional.
  if (rondaLabel) {
    out.push(center(`*** ${ascii(rondaLabel).toUpperCase()} ***`, width))
    out.push('')
  }

  // Datos del pedido (compactos)
  out.push(row('Orden:', `#${shortId}`, width))
  out.push(row('Fecha:', fecha, width))
  out.push(row('Hora:', hora, width))
  if (pedido?.personas) out.push(row('Personas:', String(pedido.personas), width))

  out.push('')
  out.push(line(width))
  out.push(center('ITEMS', width))
  out.push(line(width))
  out.push('')

  if (items.length === 0) {
    out.push(center('Sin items', width))
  } else {
    for (const item of items) {
      const head = `  ${item.cantidad}x ${ascii(item.nombre).toUpperCase()}`
      out.push(...wrap(head, width))
      if (item.notas) {
        out.push(...wrap(`    Nota: ${item.notas}`, width))
      }
      out.push('') // línea en blanco entre items para que respiren
    }
  }

  if (pedido?.notas) {
    out.push(line(width))
    out.push('NOTAS GENERALES:')
    out.push(...wrap(pedido.notas, width))
  }

  out.push(line(width))

  return out.join('\n')
}

export function buildCustomerTicketText(pedido, config, opts = {}) {
  const width = opts.width || DEFAULT_WIDTH
  const items = normalizeItems(pedido)
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const canal = CANAL_LABELS[pedido?.canal] || pedido?.canal || 'Pedido'

  const { subtotal, descuentoMonto } = applyStoredDiscount(items, pedido)
  const total = Number(pedido?.total ?? Math.max(0, subtotal - descuentoMonto))

  const out = []
  out.push(center((config?.nombre_fantasia || 'KIKU SUSHI').toUpperCase(), width))
  out.push(center('NO VALIDO COMO FACTURA', width))
  out.push(line(width))
  out.push(row('Pedido', `#${shortId}`, width))
  out.push(row('Fecha', formatDateTime(new Date()), width))
  out.push(row('Canal', canal, width))
  if (pedido?.mesa) out.push(row('Mesa', String(pedido.mesa), width))

  out.push(...clienteBlock(pedido, width))

  out.push(line(width))
  if (items.length === 0) {
    out.push(center('Sin items', width))
  } else {
    for (const item of items) {
      const lineTotal = item.precio_unitario * item.cantidad
      const head = `${item.cantidad}x ${ascii(item.nombre)}`
      const headLines = wrap(head, width - 10)
      const priceStr = `$${formatMoney(lineTotal)}`
      // primera linea con cantidad/nombre + precio a la derecha
      out.push(row(headLines[0] || '', priceStr, width))
      for (let i = 1; i < headLines.length; i++) out.push(headLines[i])
      out.push(`   $${formatMoney(item.precio_unitario)} c/u`)
      if (item.notas) out.push(...wrap(`Nota: ${item.notas}`, width, '   '))
    }
  }

  if (pedido?.notas) {
    out.push(line(width))
    out.push('Notas:')
    out.push(...wrap(pedido.notas, width))
  }

  out.push(line(width))
  if (descuentoMonto > 0) {
    out.push(row('Subtotal', `$${formatMoney(subtotal)}`, width))
    out.push(row('Descuento', `-$${formatMoney(descuentoMonto)}`, width))
  }
  out.push(row('TOTAL', `$${formatMoney(total)}`, width))
  const medioLabelCustomer = medioPagoLabel(opts.medioPago ?? pedido?.medio_pago)
  if (medioLabelCustomer) out.push(row('Pago', medioLabelCustomer, width))
  out.push(...transferBlock(width, config))
  out.push('')
  out.push(center('Gracias por su compra!', width))

  return out.join('\n')
}

export function buildFiscalTicketText(pedido, comprobante, config, opts = {}) {
  const width = opts.width || DEFAULT_WIDTH
  const items = normalizeItems(pedido)
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : ''

  const receiptNumber = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  const cae = comprobante?.cae || ''

  const { subtotal, descuentoMonto } = applyStoredDiscount(items, pedido)

  const out = []
  out.push(center((config?.nombre_fantasia || 'KIKU SUSHI').toUpperCase(), width))
  if (config?.razon_social) out.push(center(config.razon_social, width))
  if (config?.domicilio)    out.push(...wrap(config.domicilio, width).map(l => center(l, width)))
  if (config?.cuit)         out.push(center(`CUIT ${config.cuit}`, width))
  out.push(center(config?.condicion_iva || 'Responsable Inscripto', width))
  if (config?.ingresos_brutos)   out.push(center(`IIBB ${config.ingresos_brutos}`, width))
  if (config?.inicio_actividades) out.push(center(`Inicio act. ${formatDate(config.inicio_actividades)}`, width))

  out.push(line(width))
  out.push(center(nombreComprobante(comprobante?.tipo_cbte).toUpperCase(), width))
  out.push(center(`Cod. ${String(comprobante?.tipo_cbte || 6).padStart(3, '0')}`, width))
  out.push(row('Nro.', receiptNumber || '', width))
  out.push(row('Fecha', formatDate(comprobante?.fecha_emision), width))
  if (shortId) out.push(row('Pedido', `#${shortId}`, width))

  // Comprobante asociado (para Nota de Crédito / Débito)
  const cbteAsoc = comprobante?.cbte_asociado_numero
    ? formatReceiptNumber(comprobante.cbte_asociado_punto_venta, comprobante.cbte_asociado_numero)
    : null
  if (cbteAsoc) {
    out.push(row('Asoc.', cbteAsoc, width))
  }

  out.push(line(width))
  out.push('Cliente:')
  out.push(...wrap(comprobante?.receptor_nombre || 'Consumidor Final', width))
  out.push(...wrap(comprobante?.receptor_condicion_iva || 'Consumidor Final', width))
  if (comprobante?.doc_tipo && comprobante.doc_tipo !== 99) {
    const docLabel = comprobante.doc_tipo === 80 ? 'CUIT'
      : comprobante.doc_tipo === 86 ? 'CUIL'
      : comprobante.doc_tipo === 96 ? 'DNI' : 'Doc.'
    out.push(`${docLabel} ${comprobante.doc_nro || ''}`)
  }
  if (comprobante?.receptor_domicilio) {
    out.push(...wrap(comprobante.receptor_domicilio, width))
  }

  out.push(line(width))
  for (const item of items) {
    const lineTotal = item.precio_unitario * item.cantidad
    const head = `${item.cantidad}x ${ascii(item.nombre)}`
    const headLines = wrap(head, width - 10)
    out.push(row(headLines[0] || '', `$${formatMoney(lineTotal)}`, width))
    for (let i = 1; i < headLines.length; i++) out.push(headLines[i])
  }

  out.push(line(width))
  if (descuentoMonto > 0) {
    out.push(row('Subtotal', `$${formatMoney(subtotal)}`, width))
    out.push(row('Descuento', `-$${formatMoney(descuentoMonto)}`, width))
  }
  // Factura A: desglose neto + IVA. Factura B/C: precio incluye IVA, no se desglosa.
  if (comprobante?.letra === 'A') {
    out.push(row('Neto gravado', `$${formatMoney(comprobante?.importe_neto)}`, width))
    out.push(row('IVA 21%', `$${formatMoney(comprobante?.importe_iva)}`, width))
  }
  out.push(row('TOTAL', `$${formatMoney(comprobante?.importe_total || pedido?.total)}`, width))
  const medioLabelFiscal = medioPagoLabel(opts.medioPago ?? pedido?.medio_pago)
  if (medioLabelFiscal) out.push(row('Forma de pago', medioLabelFiscal, width))

  // Ley 27.743 - Transparencia Fiscal al Consumidor (sólo Factura/NC B y C)
  if (comprobante?.letra === 'B' || comprobante?.letra === 'C') {
    out.push(line(width))
    out.push(center('Reg. Transparencia Fiscal', width))
    out.push(center('al Consumidor (Ley 27.743)', width))
    out.push(row('IVA Contenido', `$${formatMoney(comprobante?.importe_iva)}`, width))
    out.push(row('Otros Imp. Nac. Indir.', '$0,00', width))
  }

  out.push(line(width))
  if (cae) out.push(row('CAE', cae, width))
  if (comprobante?.cae_vto) out.push(row('Vto. CAE', formatDate(comprobante.cae_vto), width))

  // QR ARCA: dejamos un marker {{QR}} que GG EZ Print reemplaza por el
  // raster ESC/POS generado server-side (Go). Esto evita el problema de
  // expansion UTF-8 al pasar bytes binarios por JSON.
  const qrUrl = comprobante?.qr_url || buildArcaQrUrl(comprobante, config)
  if (qrUrl) {
    out.push('{{QR}}')
  }

  out.push(...transferBlock(width, config))
  out.push(line(width))
  out.push(center('Comprobante autorizado', width))
  out.push(center('por ARCA', width))

  return out.join('\n')
}
