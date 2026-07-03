import QRCode from 'qrcode'
import { buildArcaQrUrl, formatReceiptNumber, nombreComprobante } from './fiscal'
import { applyStoredDiscount } from './orders'
import { printerClient, getPrinterFor, canPrintRemote } from './printerClient'
import {
  buildComandaText,
  buildCustomerTicketText,
  buildFiscalTicketText,
  getComandaDestinationLabel,
  formatMoney as escposFormatMoney,
  medioPagoLabel,
  TRANSFER_TITULAR,
  TRANSFER_ALIAS,
} from './escposFormatter'
import { getPrinterConfig } from './printerStore'

/**
 * Genera un data URL PNG del QR a partir de la URL de ARCA.
 * Si falla por cualquier razón devuelve null y caemos al fallback de texto.
 */
async function generateQrDataUrl(qrUrl) {
  if (!qrUrl) return null
  try {
    return await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
  } catch (err) {
    console.warn('[printing] No se pudo generar QR data URL:', err.message)
    return null
  }
}

const CANAL_LABELS = {
  salon: 'Salon',
  llevar: 'Take Away',
  takeaway: 'Take Away',
  delivery: 'Delivery',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export const formatMoney = escposFormatMoney

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return date.toLocaleDateString('es-AR')
}

function renderClienteBlock(pedido) {
  const nombre    = pedido?.cliente_nombre?.trim()
  const telefono  = pedido?.cliente_telefono?.trim()
  const direccion = pedido?.cliente_direccion?.trim()
  if (!nombre && !telefono && !direccion) return ''
  const rows = [
    nombre    && `<div class="row"><span>Cliente</span><span class="bold">${escapeHtml(nombre)}</span></div>`,
    telefono  && `<div class="row"><span>Tel</span><span>${escapeHtml(telefono)}</span></div>`,
    direccion && `<div class="row"><span>Direccion</span><span>${escapeHtml(direccion)}</span></div>`,
  ].filter(Boolean).join('')
  return `<div class="sep"></div>${rows}`
}

function renderTransferBlock(config) {
  const titular = config?.transfer_titular || TRANSFER_TITULAR
  const alias   = config?.transfer_alias   || TRANSFER_ALIAS
  return `
    <div class="sep"></div>
    <div class="center bold">TRANSFERENCIAS</div>
    <div class="center">${escapeHtml(titular)}</div>
    <div class="center bold">Alias: ${escapeHtml(alias)}</div>
  `
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

// ============================================================
// FALLBACK: impresion via window.print() (iframe + dialog del navegador).
// Se usa si NO esta configurado GG EZ Print, o si el WebSocket falla.
// Es el mismo flujo que tenia el sistema antes.
// ============================================================

function printDocumentBrowser(title, bodyHtml) {
  // El diseño se adapta al ancho del rollo configurado (58 u 80 mm). Clave para
  // impresión directa por navegador: el @page tiene que coincidir con el papel,
  // si no el navegador escala el ticket y sale chico / el QR ilegible.
  const cfg = getPrinterConfig()
  const paperWidth = Number(cfg.paper_width) === 80 ? 80 : 58
  const is80 = paperWidth === 80
  const margin = 1.5
  const bodyWidth = paperWidth - margin * 2

  // Escalas por ancho de papel.
  const font   = 12
  const fontXl = is80 ? 20 : 17
  const fontLg = is80 ? 15 : 14
  const fontSm = is80 ? 10 : 9
  const qtyW   = is80 ? 26 : 22
  const priceW = is80 ? 58 : 50
  const indent = is80 ? 30 : 26
  const qrMm   = is80 ? 50 : 44

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', title)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: ${paperWidth}mm auto; margin: ${margin}mm; }
          * { box-sizing: border-box; }
          body {
            width: ${bodyWidth}mm;
            margin: 0;
            color: #000;
            background: #fff;
            font-family: "Consolas", "Courier New", monospace;
            font-size: ${font}px;
            line-height: 1.3;
          }
          .ticket { width: 100%; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .xl { font-size: ${fontXl}px; letter-spacing: 0; }
          .lg { font-size: ${fontLg}px; }
          .sm { font-size: ${fontSm}px; }
          .mt { margin-top: 8px; }
          .sep { border-top: 1px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; gap: 6px; }
          .line { display: flex; gap: 4px; align-items: flex-start; }
          .qty { width: ${qtyW}px; text-align: right; font-weight: 700; }
          .name { flex: 1; word-break: break-word; }
          .price { width: ${priceW}px; text-align: right; }
          .unit { margin-left: ${indent}px; font-size: ${fontSm}px; color: #000; }
          .note { margin-left: ${indent}px; font-size: ${fontSm}px; }
          .stamp {
            border: 1px solid #000;
            padding: 5px;
            margin: 7px 0;
            text-align: center;
            font-weight: 700;
          }
          img.qr { width: ${qrMm}mm; height: ${qrMm}mm; object-fit: contain; margin: 4px auto 0; display: block; }
          .qr-url { font-size: 7px; word-break: break-all; margin-top: 5px; }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>`)
  doc.close()

  window.setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 250)
}

function buildComandaHtml(pedido) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const items = normalizeItems(pedido)
  const rondaLabel = pedido?._ronda_label || null
  const repeNum = pedido?._repe_num || null
  const repePlatos = pedido?._repe_platos || null
  const repeNombre = pedido?._repe_nombre || null
  const repeNota = pedido?._repe_nota || null
  const destinationLabel = getComandaDestinationLabel(pedido)

  const dt = pedido?.created_at ? new Date(pedido.created_at) : new Date()
  const fecha = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const salida = pedido?.programado_para
    ? new Date(pedido.programado_para).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  const rows = items.map(item => `
    <div class="cmd-item">
      <div class="cmd-item-line"><span class="cmd-qty">${escapeHtml(item.cantidad)}x</span> <span class="cmd-name">${escapeHtml(String(item.nombre).toUpperCase())}</span></div>
      ${item.notas ? `<div class="cmd-note">Nota: ${escapeHtml(item.notas)}</div>` : ''}
    </div>
  `).join('')

  return `
    <main class="ticket">
      <style>
        .cmd-header { text-align: center; font-weight: 800; font-size: 22px; letter-spacing: 4px; padding: 6px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; margin-bottom: 8px; }
        .cmd-destination { text-align: center; font-weight: 900; font-size: 28px; line-height: 1.05; margin: 8px 0 14px; padding: 5px 0; border-bottom: 2px solid #000; }
        .cmd-info { font-size: 12px; display: flex; justify-content: space-between; margin: 2px 0; }
        .cmd-section { text-align: center; font-weight: 700; font-size: 11px; letter-spacing: 3px; margin: 12px 0 6px; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
        .cmd-item { margin: 0 0 14px; }
        .cmd-item-line { font-size: 24px; font-weight: 900; line-height: 1.12; word-break: break-word; }
        .cmd-qty { font-weight: 900; }
        .cmd-name { font-weight: 900; }
        .cmd-note { font-size: 15px; font-weight: 700; margin-left: 30px; margin-top: 4px; }
        .cmd-foot { border-top: 1px dashed #000; margin-top: 6px; }
      </style>
      <div class="cmd-header">ORDEN</div>
      <div class="cmd-destination">${escapeHtml(destinationLabel)}</div>
      ${repeNum
        ? `<div style="border:3px solid #000;border-radius:6px;padding:6px 4px;margin:8px 0;text-align:center;">
             <div style="font-size:30px;font-weight:900;line-height:1.1;">x${escapeHtml(repeNum)} REPE</div>
             ${repeNombre ? `<div style="font-size:18px;font-weight:800;margin-top:3px;">${escapeHtml(repeNombre)}</div>` : ''}
             ${repePlatos ? `<div style="font-size:16px;font-weight:700;margin-top:2px;">${escapeHtml(repePlatos)} platos</div>` : ''}
             ${repeNota ? `<div style="font-size:15px;font-weight:700;margin-top:4px;">Nota: ${escapeHtml(repeNota)}</div>` : ''}
           </div>`
        : (rondaLabel ? `<div class="center bold" style="background:#000;color:#fff;padding:4px 0;margin:6px 0;">${escapeHtml(rondaLabel)}</div>` : '')}
      <div class="cmd-info"><span>Orden:</span><span class="bold">#${escapeHtml(shortId)}</span></div>
      <div class="cmd-info"><span>Fecha:</span><span>${escapeHtml(fecha)}</span></div>
      <div class="cmd-info"><span>Hora:</span><span>${escapeHtml(hora)}</span></div>
      ${salida ? `<div class="cmd-info" style="font-weight:800"><span>SALIDA:</span><span>${escapeHtml(salida)}</span></div>` : ''}
      ${pedido?.personas ? `<div class="cmd-info"><span>Personas:</span><span>${escapeHtml(pedido.personas)}</span></div>` : ''}

      ${repeNum ? '' : `<div class="cmd-section">ITEMS</div>
      ${rows || '<div class="center">Sin items</div>'}`}

      ${pedido?.notas ? `<div class="cmd-section">NOTAS</div><div style="font-size:12px">${escapeHtml(pedido.notas)}</div>` : ''}
      <div class="cmd-foot"></div>
    </main>
  `
}

// Bloque de desglose por persona (cobro por consumo). Aditivo: si no hay
// desglose, no renderiza nada y el ticket queda igual que siempre.
function renderDesgloseBlock(desglose) {
  if (!Array.isArray(desglose) || desglose.length === 0) return ''
  const cuentas = desglose.map(c => {
    const items = (c.items || []).map(i =>
      `<div class="row sm"><span>${escapeHtml(i.cantidad)}x ${escapeHtml(i.nombre)}${i.compartido ? ' (comp.)' : ''}</span><span>$${formatMoney(i.monto)}</span></div>`
    ).join('')
    return `
      <div class="bold">${escapeHtml(c.label)}${c.medioLabel ? ` · ${escapeHtml(c.medioLabel)}` : ''}</div>
      ${items}
      <div class="row bold"><span>Total ${escapeHtml(c.label)}</span><span>$${formatMoney(c.total)}</span></div>
    `
  }).join('<div class="sep"></div>')
  return `
    <div class="sep"></div>
    <div class="center bold">DESGLOSE POR PERSONA</div>
    ${cuentas}
  `
}

function buildCustomerHtml(pedido, config, opts = {}) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const items = normalizeItems(pedido)
  const canal = CANAL_LABELS[pedido?.canal] || pedido?.canal || 'Pedido'
  const { subtotal, descuentoMonto } = applyStoredDiscount(items, pedido)
  const envio = Number(pedido?.costo_envio || 0)
  const total = Number(pedido?.total ?? Math.max(0, subtotal - descuentoMonto + envio))
  const medioLabel = medioPagoLabel(opts.medioPago ?? pedido?.medio_pago)

  const rows = items.map(item => {
    const lineTotal = item.precio_unitario * item.cantidad
    return `
      <div class="line">
        <div class="qty">${escapeHtml(item.cantidad)}x</div>
        <div class="name">${escapeHtml(item.nombre)}</div>
        <div class="price">$${formatMoney(lineTotal)}</div>
      </div>
      <div class="unit">$${formatMoney(item.precio_unitario)} c/u</div>
      ${item.notas ? `<div class="note">Nota: ${escapeHtml(item.notas)}</div>` : ''}
    `
  }).join('')

  return `
    <main class="ticket">
      <div class="center bold xl">${escapeHtml(config?.nombre_fantasia || 'KIKU SUSHI')}</div>
      <div class="center bold lg">NO VALIDO COMO FACTURA</div>
      <div class="row"><span>Pedido</span><span class="bold">#${escapeHtml(shortId)}</span></div>
      <div class="row"><span>Fecha</span><span>${escapeHtml(formatDateTime(new Date()))}</span></div>
      <div class="row"><span>Canal</span><span>${escapeHtml(canal)}</span></div>
      ${pedido?.mesa ? `<div class="row"><span>Mesa</span><span class="bold">${escapeHtml(pedido.mesa)}</span></div>` : ''}
      ${renderClienteBlock(pedido)}
      <div class="sep"></div>
      ${rows || '<div class="center">Sin items</div>'}
      ${pedido?.notas ? `<div class="sep"></div><div class="bold">Notas</div><div>${escapeHtml(pedido.notas)}</div>` : ''}
      <div class="sep"></div>
      ${(descuentoMonto > 0 || envio > 0) ? `
        <div class="row"><span>Subtotal</span><span>$${formatMoney(subtotal)}</span></div>
      ` : ''}
      ${descuentoMonto > 0 ? `<div class="row"><span>Descuento</span><span>-$${formatMoney(descuentoMonto)}</span></div>` : ''}
      ${envio > 0 ? `<div class="row"><span>Envio</span><span>$${formatMoney(envio)}</span></div>` : ''}
      <div class="row bold lg"><span>Total</span><span>$${formatMoney(total)}</span></div>
      ${medioLabel ? `<div class="row"><span>Pago</span><span class="bold">${escapeHtml(medioLabel)}</span></div>` : ''}
      ${renderDesgloseBlock(opts.desglose)}
      ${renderTransferBlock(config)}
    </main>
  `
}

function buildFiscalHtml(pedido, comprobante, config, opts = {}) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : ''
  const items = normalizeItems(pedido)
  const receiptNumber = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  const cae = comprobante?.cae || ''
  const medioLabel = medioPagoLabel(opts.medioPago ?? pedido?.medio_pago)
  const { subtotal, descuentoMonto } = applyStoredDiscount(items, pedido)
  const envio = Number(pedido?.costo_envio || 0)
  const letra = comprobante?.letra || 'B'

  // Bloque IVA: desglosado para Factura A, oculto para B/C
  const ivaDesgloseHtml = letra === 'A'
    ? `<div class="row"><span>Neto gravado</span><span>$${formatMoney(comprobante?.importe_neto)}</span></div>
       <div class="row"><span>IVA 21%</span><span>$${formatMoney(comprobante?.importe_iva)}</span></div>`
    : ''

  // Ley 27.743 Transparencia Fiscal: sólo para B y C
  const transparenciaHtml = (letra === 'B' || letra === 'C')
    ? `<div class="sep"></div>
       <div class="center sm bold">Reg. Transparencia Fiscal</div>
       <div class="center sm bold">al Consumidor (Ley 27.743)</div>
       <div class="row sm mt"><span>IVA Contenido</span><span>$${formatMoney(comprobante?.importe_iva)}</span></div>
       <div class="row sm"><span>Otros Imp. Nac. Indir.</span><span>$0,00</span></div>`
    : ''

  const rows = items.map(item => {
    const total = item.precio_unitario * item.cantidad
    return `
      <div class="line">
        <div class="qty">${escapeHtml(item.cantidad)}x</div>
        <div class="name">${escapeHtml(item.nombre)}</div>
        <div class="price">$${formatMoney(total)}</div>
      </div>
    `
  }).join('')

  return `
    <main class="ticket">
      <div class="center bold xl">${escapeHtml(config?.nombre_fantasia || 'KIKU SUSHI')}</div>
      ${config?.razon_social ? `<div class="center">${escapeHtml(config.razon_social)}</div>` : ''}
      ${config?.domicilio ? `<div class="center sm">${escapeHtml(config.domicilio)}</div>` : ''}
      ${config?.cuit ? `<div class="center">CUIT ${escapeHtml(config.cuit)}</div>` : ''}
      <div class="center">${escapeHtml(config?.condicion_iva || 'Responsable Inscripto')}</div>
      ${config?.ingresos_brutos ? `<div class="center sm">IIBB ${escapeHtml(config.ingresos_brutos)}</div>` : ''}
      ${config?.inicio_actividades ? `<div class="center sm">Inicio act. ${escapeHtml(formatDate(config.inicio_actividades))}</div>` : ''}
      <div class="sep"></div>
      <div class="center bold lg">${escapeHtml(nombreComprobante(comprobante?.tipo_cbte).toUpperCase())}</div>
      <div class="center sm">Cod. ${String(comprobante?.tipo_cbte || 6).padStart(3, '0')}</div>
      <div class="row mt"><span>Nro.</span><span class="bold">${escapeHtml(receiptNumber)}</span></div>
      <div class="row"><span>Fecha</span><span>${escapeHtml(formatDate(comprobante?.fecha_emision))}</span></div>
      <div class="row"><span>Pedido</span><span>#${escapeHtml(shortId)}</span></div>
      ${comprobante?.cbte_asociado_numero ? `
        <div class="row"><span>Asoc.</span><span>${escapeHtml(formatReceiptNumber(comprobante.cbte_asociado_punto_venta, comprobante.cbte_asociado_numero))}</span></div>
      ` : ''}
      <div class="sep"></div>
      <div class="bold">Cliente</div>
      <div>${escapeHtml(comprobante?.receptor_nombre || 'Consumidor Final')}</div>
      <div class="sm">${escapeHtml(comprobante?.receptor_condicion_iva || 'Consumidor Final')}</div>
      ${comprobante?.doc_tipo && comprobante.doc_tipo !== 99 ? `
        <div class="sm">${escapeHtml({80:'CUIT',86:'CUIL',96:'DNI'}[comprobante.doc_tipo] || 'Doc.')} ${escapeHtml(comprobante.doc_nro || '')}</div>
      ` : ''}
      ${comprobante?.receptor_domicilio ? `<div class="sm">${escapeHtml(comprobante.receptor_domicilio)}</div>` : ''}
      <div class="sep"></div>
      ${rows}
      <div class="sep"></div>
      ${(descuentoMonto > 0 || envio > 0) ? `
        <div class="row"><span>Subtotal</span><span>$${formatMoney(subtotal)}</span></div>
      ` : ''}
      ${descuentoMonto > 0 ? `<div class="row"><span>Descuento</span><span>-$${formatMoney(descuentoMonto)}</span></div>` : ''}
      ${envio > 0 ? `<div class="row"><span>Envio</span><span>$${formatMoney(envio)}</span></div>` : ''}
      ${ivaDesgloseHtml}
      <div class="row bold lg"><span>Total</span><span>$${formatMoney(comprobante?.importe_total || pedido?.total)}</span></div>
      ${medioLabel ? `<div class="row"><span>Forma de pago</span><span class="bold">${escapeHtml(medioLabel)}</span></div>` : ''}
      ${renderDesgloseBlock(opts.desglose)}
      ${transparenciaHtml}
      <div class="sep"></div>
      <div class="row"><span>CAE</span><span>${escapeHtml(cae)}</span></div>
      <div class="row"><span>Vto. CAE</span><span>${escapeHtml(formatDate(comprobante?.cae_vto))}</span></div>
      ${comprobante?.qr_data_url
        ? `<img class="qr" alt="QR ARCA" src="${escapeHtml(comprobante.qr_data_url)}" />`
        : ''
      }
      ${renderTransferBlock(config)}
      <div class="sep"></div>
      <div class="center sm">Comprobante autorizado por ARCA</div>
    </main>
  `
}

// ============================================================
// FLUJO NUEVO: primero intenta GG EZ Print (WebSocket -> ESC/POS),
// si falla cae al fallback del navegador con el HTML.
// ============================================================

async function tryRemotePrint(kind, content, extra = {}) {
  if (!canPrintRemote(kind)) return false
  const printer = getPrinterFor(kind)
  const cfg = getPrinterConfig()
  try {
    await printerClient.print({
      printerName: printer.name,
      type: printer.type,
      content,
      fontSize: extra.fontSize ?? cfg.font_size,
      paperWidth: cfg.paper_width,
      qrCodeData: extra.qrCodeData,
    })
    return true
  } catch (err) {
    console.warn(`[printing] GG EZ Print fallo para ${kind}, fallback a window.print():`, err.message)
    return false
  }
}

function charsForFontSize(charsPerLine, fontSize) {
  const base = Number(charsPerLine) || 32
  const scale = Math.max(1, Number(fontSize) || 1)
  return Math.max(10, Math.floor(base / scale))
}

// ============================================================
// API publica - mantiene las mismas firmas que la version anterior.
// ============================================================

/**
 * Imprime una comanda de cocina.
 * Devuelve { ok, via } donde via es 'remote' (GG EZ Print) o 'browser' (diálogo
 * del navegador). Si el remoto está configurado pero falla, remoteFailed=true.
 * Si no hay items, no imprime y devuelve { ok:false, reason:'sin_items' }.
 */
export async function printComanda(pedido) {
  const items = pedido?.pedido_items || pedido?.items || []
  if (items.length === 0) {
    return { ok: false, reason: 'sin_items' }
  }

  const cfg = getPrinterConfig()
  const fontSize = Number(cfg.font_size) || 1
  const text = buildComandaText(pedido, { width: charsForFontSize(cfg.chars_per_line, fontSize) })
  const remoteConfigured = canPrintRemote('comanda')

  try {
    const ok = await tryRemotePrint('comanda', text, { fontSize })
    if (ok) return { ok: true, via: 'remote' }
  } catch (err) {
    console.warn('[printing] error inesperado en impresión remota de comanda:', err?.message)
  }

  // Fallback al diálogo del navegador.
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const rondaLabel = pedido?._ronda_label || ''
  try {
    printDocumentBrowser(
      `Comanda ${shortId}${rondaLabel ? ' - ' + rondaLabel : ''}`,
      buildComandaHtml(pedido)
    )
    return { ok: true, via: 'browser', remoteFailed: remoteConfigured }
  } catch (err) {
    return { ok: false, error: err, remoteFailed: remoteConfigured }
  }
}

export async function printCustomerTicket(pedido, config, opts = {}) {
  const cfg = getPrinterConfig()
  const medioPago = opts.medioPago ?? null
  const desglose = opts.desglose ?? null
  const text = buildCustomerTicketText(pedido, config, { width: cfg.chars_per_line, medioPago, desglose })
  const ok = await tryRemotePrint('ticket', text)
  if (ok) return

  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  printDocumentBrowser(`Ticket cliente ${shortId}`, buildCustomerHtml(pedido, config, { medioPago, desglose }))
}

export async function printFiscalTicket(pedido, comprobante, config, opts = {}) {
  const cfg = getPrinterConfig()
  const medioPago = opts.medioPago ?? null

  // Enriquecemos el comprobante con el QR como imagen (data URL) si todavía no lo tiene.
  let enrichedComprobante = comprobante
  if (comprobante && !comprobante.qr_data_url) {
    const qrUrl = comprobante.qr_url || buildArcaQrUrl(comprobante, config)
    const qrDataUrl = await generateQrDataUrl(qrUrl)
    if (qrDataUrl) {
      enrichedComprobante = { ...comprobante, qr_data_url: qrDataUrl }
    }
  }

  // Pasamos la URL del QR al servicio de impresión para que la renderice
  // server-side como bitmap raster (en Go los bytes no se mangle por UTF-8).
  const qrCodeData = enrichedComprobante?.qr_url || buildArcaQrUrl(enrichedComprobante, config) || ''

  let text = buildFiscalTicketText(pedido, enrichedComprobante, config, { width: cfg.chars_per_line, medioPago, desglose: opts.desglose ?? null })
  // Red de seguridad: si NO hay datos de QR, removemos el marcador {{QR}} del
  // texto para que el servicio nunca imprima el literal "{{QR}}" ni texto crudo.
  if (!qrCodeData) {
    text = text.split('{{QR}}').join('')
    console.warn('[printing] qr_code_data vacío — el QR no se va a imprimir. Comprobante:', {
      tipo_cbte: enrichedComprobante?.tipo_cbte,
      numero:    enrichedComprobante?.numero,
      cae:       enrichedComprobante?.cae,
      qr_url:    enrichedComprobante?.qr_url,
    })
  }
  const ok = await tryRemotePrint('fiscal', text, { qrCodeData })
  if (ok) return

  const receiptNumber = formatReceiptNumber(enrichedComprobante?.punto_venta, enrichedComprobante?.numero)
  printDocumentBrowser(`Factura ${receiptNumber}`, buildFiscalHtml(pedido, enrichedComprobante, config, { medioPago, desglose: opts.desglose ?? null }))
}
