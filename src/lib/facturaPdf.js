import QRCode from 'qrcode'
import { applyStoredDiscount } from './orders'
import {
  buildArcaQrUrl, esNotaCredito, esNotaDebito, formatReceiptNumber, nombreComprobante, onlyDigits,
} from './fiscal'
import { medioPagoLabel } from './escposFormatter'

// ─────────────────────────────────────────────────────────────────────────────
// Factura / Nota de crédito en PDF (hoja A4), con el formato clásico de ARCA:
// letra en el recuadro del medio, datos del emisor y del receptor, detalle,
// totales, CAE y QR. Se genera en el navegador con jsPDF (import dinámico:
// solo se baja la librería cuando alguien descarga un PDF).
//
//   · Factura A: precios netos, IVA discriminado, "Neto gravado" + "IVA 21%".
//   · Factura B/C: precios con IVA incluido y el bloque de Transparencia
//     Fiscal al Consumidor (Ley 27.743) con el IVA contenido.
//   · Nota de crédito/débito: una sola línea que referencia la factura
//     original (sirve para NC parciales) y el mismo pie fiscal.
//
// Mismos datos que el ticket térmico (buildFiscalTicketText): si algo cambia
// ahí, cambiarlo acá también.
// ─────────────────────────────────────────────────────────────────────────────

const MM = { ancho: 210, alto: 297, margen: 12 }
const GRIS = 60
const NEGRO = 0

const fmtMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-AR') : '')
const fmtCuit = (c) => {
  const d = onlyDigits(c)
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : (c || '')
}
const docLabel = (tipo) => ({ 80: 'CUIT', 86: 'CUIL', 96: 'DNI' }[Number(tipo)] || 'Doc.')

function normalizeItems(pedido) {
  return (pedido?.pedido_items || pedido?.items || []).map(item => ({
    nombre: String(item.nombre || ''),
    cantidad: Number(item.cantidad || 1),
    precio_unitario: Number(item.precio_unitario || 0),
  }))
}

/** Factura original de una NC/ND: por cbte_asociado_id o por lo que se mandó a ARCA. */
function comprobanteAsociado(pedido, comprobante) {
  if (!comprobante) return null
  const lista = pedido?.comprobantes_fiscales || []
  const porId = comprobante.cbte_asociado_id ? lista.find(c => c.id === comprobante.cbte_asociado_id) : null
  if (porId) return porId
  const asoc = comprobante.arca_request?.cbtes_asociados?.[0]
  if (asoc) return { tipo_cbte: asoc.tipo_cbte, punto_venta: asoc.punto_venta, numero: asoc.numero, fecha_emision: asoc.fecha }
  const facturas = lista.filter(c => [1, 6, 11].includes(Number(c.tipo_cbte)) && c.estado !== 'rechazado' && c.estado !== 'error')
  return facturas.length === 1 ? facturas[0] : null
}

/** Nombre del archivo: Factura-B-00002-00000325.pdf */
export function nombreArchivoPdf(comprobante) {
  const tipo = nombreComprobante(comprobante?.tipo_cbte).replace(/\s+/g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '')
  return `${tipo}-${formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)}.pdf`
}

async function qrDataUrl(comprobante, config) {
  if (comprobante?.qr_data_url) return comprobante.qr_data_url
  const url = comprobante?.qr_url || buildArcaQrUrl(comprobante, config)
  if (!url) return null
  try {
    return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 300 })
  } catch {
    return null
  }
}

/**
 * Arma el PDF y lo devuelve como instancia de jsPDF (para guardar, abrir o
 * testear). `opts.medioPago` = forma de pago a mostrar (id del catálogo).
 */
export async function armarFacturaPdf(pedido, comprobante, config, opts = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const letra = comprobante?.letra || 'B'
  const esA = letra === 'A'
  const esNC = esNotaCredito(comprobante?.tipo_cbte)
  const esND = esNotaDebito(comprobante?.tipo_cbte)
  const titulo = esNC ? 'NOTA DE CRÉDITO' : esND ? 'NOTA DE DÉBITO' : 'FACTURA'
  const alicuota = Number(config?.alicuota_iva || 21)
  const nro = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  const asociado = (esNC || esND) ? comprobanteAsociado(pedido, comprobante) : null

  const X0 = MM.margen
  const X1 = MM.ancho - MM.margen
  const W = X1 - X0
  let y = MM.margen

  const texto = (s, x, yy, o = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal')
    doc.setFontSize(o.size || 9)
    doc.setTextColor(o.color ?? NEGRO)
    doc.text(String(s ?? ''), x, yy, { align: o.align || 'left', maxWidth: o.maxWidth })
  }
  const lineaH = (yy, x0 = X0, x1 = X1) => { doc.setDrawColor(NEGRO); doc.setLineWidth(0.25); doc.line(x0, yy, x1, yy) }

  // ── Encabezado: emisor | letra | datos del comprobante ────────────────────
  const hCab = 44
  doc.setLineWidth(0.4); doc.setDrawColor(NEGRO)
  doc.rect(X0, y, W, hCab)
  const cx = X0 + W / 2
  const boxW = 16, boxH = 18
  doc.rect(cx - boxW / 2, y, boxW, boxH)
  doc.line(cx, y + boxH, cx, y + hCab)
  texto(letra, cx, y + 11, { size: 26, bold: true, align: 'center' })
  texto(`COD. ${String(comprobante?.tipo_cbte || 6).padStart(3, '0')}`, cx, y + 16.5, { size: 6.5, align: 'center' })

  // Emisor (izquierda)
  const ex = X0 + 4
  let ey = y + 9
  texto((config?.nombre_fantasia || 'KIKU SUSHI').toUpperCase(), ex, ey, { size: 15, bold: true })
  ey += 7
  if (config?.razon_social) { texto(`Razón social: ${config.razon_social}`, ex, ey, { size: 8.5, bold: true, maxWidth: W / 2 - 14 }); ey += 4.5 }
  if (config?.domicilio) { texto(`Domicilio comercial: ${config.domicilio}`, ex, ey, { size: 8, maxWidth: W / 2 - 14 }); ey += 4.5 }
  texto(`Condición frente al IVA: ${config?.condicion_iva || 'Responsable Inscripto'}`, ex, ey, { size: 8 })

  // Comprobante (derecha)
  const dx = cx + boxW / 2 + 4
  let dy = y + 9
  texto(titulo, dx, dy, { size: 15, bold: true })
  texto('ORIGINAL', X1 - 4, dy, { size: 8, align: 'right' })
  dy += 7
  texto(`Punto de Venta: ${String(comprobante?.punto_venta || 0).padStart(5, '0')}    Comp. Nro: ${String(comprobante?.numero || 0).padStart(8, '0')}`, dx, dy, { size: 9, bold: true }); dy += 5
  texto(`Fecha de Emisión: ${fmtDate(comprobante?.fecha_emision)}`, dx, dy, { size: 8.5 }); dy += 5
  texto(`CUIT: ${fmtCuit(config?.cuit)}`, dx, dy, { size: 8.5, bold: true }); dy += 4.5
  if (config?.ingresos_brutos) { texto(`Ingresos Brutos: ${config.ingresos_brutos}`, dx, dy, { size: 8 }); dy += 4.5 }
  if (config?.inicio_actividades) texto(`Fecha de Inicio de Actividades: ${fmtDate(config.inicio_actividades)}`, dx, dy, { size: 8 })
  y += hCab + 2

  // ── Período / condición de venta ───────────────────────────────────────────
  const medio = medioPagoLabel(opts.medioPago ?? pedido?.medio_pago) || 'Contado'
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : ''
  doc.rect(X0, y, W, 8)
  texto(`Condición de venta: ${medio}`, X0 + 3, y + 5.3, { size: 8.5, bold: true })
  if (shortId) texto(`Pedido #${shortId}`, X1 - 3, y + 5.3, { size: 8, align: 'right', color: GRIS })
  y += 10

  // ── Receptor ───────────────────────────────────────────────────────────────
  const docTipo = Number(comprobante?.doc_tipo || 99)
  const recDoc = docTipo !== 99 && comprobante?.doc_nro && comprobante.doc_nro !== '0'
    ? `${docLabel(docTipo)}: ${docTipo === 80 ? fmtCuit(comprobante.doc_nro) : comprobante.doc_nro}`
    : ''
  const recLineas = [
    [recDoc, `Apellido y Nombre / Razón Social: ${comprobante?.receptor_nombre || 'Consumidor Final'}`],
    [`Condición frente al IVA: ${comprobante?.receptor_condicion_iva || 'Consumidor Final'}`, ''],
  ]
  if (comprobante?.receptor_domicilio) recLineas.push([`Domicilio: ${comprobante.receptor_domicilio}`, ''])
  const hRec = 4 + recLineas.length * 5
  doc.rect(X0, y, W, hRec)
  let ry = y + 5.3
  for (const [izq, der] of recLineas) {
    if (izq) texto(izq, X0 + 3, ry, { size: 8.5, bold: izq.startsWith('CUIT'), maxWidth: der ? 50 : W - 6 })
    if (der) texto(der, X0 + 3 + (izq ? 52 : 0), ry, { size: 8.5, maxWidth: W - 6 - (izq ? 52 : 0) })
    ry += 5
  }
  y += hRec + 2

  // ── Detalle ────────────────────────────────────────────────────────────────
  // Columnas: cant | descripción | precio unit | (A: IVA %) | subtotal
  const cols = esA
    ? [{ t: 'Cant.', w: 14, a: 'right' }, { t: 'Producto / Servicio', w: W - 14 - 30 - 18 - 30, a: 'left' }, { t: 'Precio Unit.', w: 30, a: 'right' }, { t: 'IVA', w: 18, a: 'right' }, { t: 'Subtotal', w: 30, a: 'right' }]
    : [{ t: 'Cant.', w: 14, a: 'right' }, { t: 'Producto / Servicio', w: W - 14 - 32 - 32, a: 'left' }, { t: 'Precio Unit.', w: 32, a: 'right' }, { t: 'Subtotal', w: 32, a: 'right' }]
  const colX = []
  let acc = X0
  for (const c of cols) { colX.push(acc); acc += c.w }

  const cabecera = () => {
    doc.setFillColor(235, 235, 235)
    doc.rect(X0, y, W, 7, 'F')
    doc.rect(X0, y, W, 7)
    cols.forEach((c, i) => {
      const x = c.a === 'right' ? colX[i] + c.w - 2 : colX[i] + 2
      texto(c.t, x, y + 4.8, { size: 8, bold: true, align: c.a })
    })
    y += 7
  }
  cabecera()

  const items = normalizeItems(pedido)
  const { subtotal, descuentoMonto } = applyStoredDiscount(items, pedido)
  const envio = Number(pedido?.costo_envio || 0)
  const divisor = 1 + alicuota / 100
  const neto = (bruto) => Math.round((bruto / divisor) * 100) / 100

  const filas = []
  if (esNC || esND) {
    const ref = asociado
      ? `${nombreComprobante(asociado.tipo_cbte)} ${formatReceiptNumber(asociado.punto_venta, asociado.numero)}${asociado.fecha_emision ? ` del ${fmtDate(asociado.fecha_emision)}` : ''}`
      : 'la factura original'
    const motivo = comprobante?.arca_request?.motivo || comprobante?.receptor_metadata?.motivo || ''
    filas.push({ cantidad: 1, nombre: `${esNC ? 'Nota de crédito' : 'Nota de débito'} sobre ${ref}${motivo ? ` · ${motivo}` : ''}`, bruto: Number(comprobante?.importe_total || 0) })
  } else {
    for (const it of items) filas.push({ cantidad: it.cantidad, nombre: it.nombre, bruto: it.precio_unitario * it.cantidad, unit: it.precio_unitario })
    if (descuentoMonto > 0) filas.push({ cantidad: 1, nombre: 'Descuento', bruto: -descuentoMonto })
    if (envio > 0) filas.push({ cantidad: 1, nombre: pedido?.envio_zona ? `Envío (${pedido.envio_zona})` : 'Envío', bruto: envio })
  }

  const altoFila = 6
  for (const f of filas) {
    const descW = cols[1].w - 4
    const lineas = doc.splitTextToSize(f.nombre, descW)
    const h = Math.max(altoFila, lineas.length * 4 + 2)
    if (y + h > MM.alto - 75) { // pie de página + nueva hoja
      doc.addPage(); y = MM.margen; cabecera()
    }
    const unit = f.unit ?? (f.cantidad ? f.bruto / f.cantidad : f.bruto)
    const mostrarUnit = esA ? neto(unit) : unit
    const mostrarSub = esA ? neto(f.bruto) : f.bruto
    texto(f.cantidad % 1 === 0 ? String(f.cantidad) : f.cantidad.toLocaleString('es-AR'), colX[0] + cols[0].w - 2, y + 4.3, { size: 8.5, align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(NEGRO)
    doc.text(lineas, colX[1] + 2, y + 4.3)
    texto(fmtMoney(mostrarUnit), colX[2] + cols[2].w - 2, y + 4.3, { size: 8.5, align: 'right' })
    if (esA) {
      texto(`${alicuota}%`, colX[3] + cols[3].w - 2, y + 4.3, { size: 8.5, align: 'right' })
      texto(fmtMoney(mostrarSub), colX[4] + cols[4].w - 2, y + 4.3, { size: 8.5, align: 'right' })
    } else {
      texto(fmtMoney(mostrarSub), colX[3] + cols[3].w - 2, y + 4.3, { size: 8.5, align: 'right' })
    }
    y += h
  }
  lineaH(y)
  y += 4

  // ── Totales ────────────────────────────────────────────────────────────────
  const total = Number(comprobante?.importe_total || (Math.max(0, subtotal - descuentoMonto) + envio))
  const impNeto = Number(comprobante?.importe_neto || neto(total))
  const impIva = Number(comprobante?.importe_iva || Math.round((total - impNeto) * 100) / 100)
  const totLineas = esA
    ? [['Importe Neto Gravado: $', impNeto], [`IVA ${alicuota}%: $`, impIva], ['Importe Otros Tributos: $', 0], ['Importe Total: $', total]]
    : [['Subtotal: $', total], ['Importe Otros Tributos: $', 0], ['Importe Total: $', total]]
  const tx = X1 - 3
  for (const [lab, val] of totLineas) {
    const esTotal = lab.startsWith('Importe Total')
    texto(lab, tx - 34, y, { size: esTotal ? 10 : 8.5, bold: true, align: 'right' })
    texto(fmtMoney(val), tx, y, { size: esTotal ? 10 : 8.5, bold: true, align: 'right' })
    y += esTotal ? 6 : 5
  }

  // ── Pie fiscal: transparencia (B/C), QR, CAE ───────────────────────────────
  const pieY = Math.max(y + 4, MM.alto - 62)
  if (pieY + 50 > MM.alto) { doc.addPage() }
  let py = pieY + 50 > MM.alto ? MM.margen : pieY
  lineaH(py)
  py += 4

  const qr = await qrDataUrl(comprobante, config)
  const qrSize = 30
  if (qr) doc.addImage(qr, 'PNG', X0, py, qrSize, qrSize)

  const fx = X0 + qrSize + 6
  let fy = py + 4
  if (!esA) {
    texto('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', fx, fy, { size: 8, bold: true }); fy += 4.2
    texto(`IVA Contenido: $ ${fmtMoney(impIva)}`, fx, fy, { size: 8 }); fy += 4
    texto('Otros Impuestos Nacionales Indirectos: $ 0,00', fx, fy, { size: 8 }); fy += 6
  }
  texto('Comprobante Autorizado por ARCA', fx, fy, { size: 9, bold: true }); fy += 4.5
  texto(`CAE N°: ${comprobante?.cae || '—'}`, fx, fy, { size: 8.5 })
  texto(`Fecha de Vto. de CAE: ${fmtDate(comprobante?.cae_vto)}`, X1 - 3, fy, { size: 8.5, align: 'right' }); fy += 4.5
  texto('Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación', fx, fy, { size: 6.5, color: GRIS, maxWidth: W - qrSize - 8 })

  // Numeración de páginas
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    texto(`Pág. ${p}/${paginas}`, X1, MM.alto - 6, { size: 7, color: GRIS, align: 'right' })
    texto(`${nombreComprobante(comprobante?.tipo_cbte)} ${nro}`, X0, MM.alto - 6, { size: 7, color: GRIS })
  }

  return doc
}

/** Genera y descarga el PDF. */
export async function descargarFacturaPdf(pedido, comprobante, config, opts = {}) {
  if (!comprobante?.cae) throw new Error('Ese comprobante no tiene CAE: no hay factura que descargar.')
  const doc = await armarFacturaPdf(pedido, comprobante, config, opts)
  doc.save(nombreArchivoPdf(comprobante))
  return nombreArchivoPdf(comprobante)
}
