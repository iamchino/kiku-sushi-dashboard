import { buildArcaQrUrl, formatReceiptNumber, nombreComprobante } from './fiscal'
import { calculateDiscountAmount, calculateOrderSubtotal, clampDiscount } from './orders'
import { printerClient, getPrinterFor, canPrintRemote } from './printerClient'
import {
  buildComandaText,
  buildCustomerTicketText,
  buildFiscalTicketText,
  formatMoney as escposFormatMoney,
} from './escposFormatter'
import { getPrinterConfig } from './printerStore'

const CANAL_LABELS = {
  salon: 'Salon',
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
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body {
            width: 72mm;
            margin: 0;
            color: #000;
            background: #fff;
            font-family: "Consolas", "Courier New", monospace;
            font-size: 11px;
            line-height: 1.32;
          }
          .ticket { width: 100%; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .xl { font-size: 18px; letter-spacing: 0; }
          .lg { font-size: 14px; }
          .sm { font-size: 9px; }
          .mt { margin-top: 8px; }
          .sep { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; }
          .line { display: flex; gap: 5px; align-items: flex-start; }
          .qty { width: 24px; text-align: right; font-weight: 700; }
          .name { flex: 1; word-break: break-word; }
          .price { width: 56px; text-align: right; }
          .unit { margin-left: 29px; font-size: 9px; color: #000; }
          .note { margin-left: 29px; font-size: 9px; }
          .stamp {
            border: 1px solid #000;
            padding: 5px;
            margin: 7px 0;
            text-align: center;
            font-weight: 700;
          }
          img.qr { width: 35mm; height: 35mm; object-fit: contain; margin: 4px auto 0; display: block; }
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

  const dt = pedido?.created_at ? new Date(pedido.created_at) : new Date()
  const fecha = dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const rows = items.map(item => `
    <div class="cmd-item">
      <div class="cmd-item-line"><span class="cmd-qty">${escapeHtml(item.cantidad)}x</span> <span class="cmd-name">${escapeHtml(String(item.nombre).toUpperCase())}</span></div>
      ${item.notas ? `<div class="cmd-note">Nota: ${escapeHtml(item.notas)}</div>` : ''}
    </div>
  `).join('')

  return `
    <main class="ticket">
      <style>
        .cmd-header { text-align: center; font-weight: 800; font-size: 22px; letter-spacing: 4px; padding: 6px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; margin-bottom: 12px; }
        .cmd-mesa { text-align: center; font-weight: 800; font-size: 26px; margin: 8px 0 14px; }
        .cmd-info { font-size: 12px; display: flex; justify-content: space-between; margin: 2px 0; }
        .cmd-section { text-align: center; font-weight: 700; font-size: 11px; letter-spacing: 3px; margin: 12px 0 6px; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
        .cmd-item { margin: 0 0 12px; }
        .cmd-item-line { font-size: 18px; font-weight: 700; line-height: 1.2; }
        .cmd-qty { font-weight: 800; }
        .cmd-name { font-weight: 700; }
        .cmd-note { font-size: 11px; font-weight: 500; margin-left: 28px; margin-top: 2px; }
        .cmd-foot { border-top: 1px dashed #000; margin-top: 6px; }
      </style>
      <div class="cmd-header">ORDEN</div>
      ${pedido?.mesa ? `<div class="cmd-mesa">MESA ${escapeHtml(pedido.mesa)}</div>` : ''}
      ${rondaLabel ? `<div class="center bold" style="background:#000;color:#fff;padding:4px 0;margin:6px 0;">${escapeHtml(rondaLabel)}</div>` : ''}
      <div class="cmd-info"><span>Orden:</span><span class="bold">#${escapeHtml(shortId)}</span></div>
      <div class="cmd-info"><span>Fecha:</span><span>${escapeHtml(fecha)}</span></div>
      <div class="cmd-info"><span>Hora:</span><span>${escapeHtml(hora)}</span></div>
      ${pedido?.personas ? `<div class="cmd-info"><span>Personas:</span><span>${escapeHtml(pedido.personas)}</span></div>` : ''}

      <div class="cmd-section">ITEMS</div>

      ${rows || '<div class="center">Sin items</div>'}

      ${pedido?.notas ? `<div class="cmd-section">NOTAS</div><div style="font-size:12px">${escapeHtml(pedido.notas)}</div>` : ''}
      <div class="cmd-foot"></div>
    </main>
  `
}

function buildCustomerHtml(pedido, config) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const items = normalizeItems(pedido)
  const canal = CANAL_LABELS[pedido?.canal] || pedido?.canal || 'Pedido'
  const descuento = clampDiscount(pedido?.descuento_porcentaje)
  const subtotal = calculateOrderSubtotal(items)
  const discountAmount = calculateDiscountAmount(subtotal, descuento)
  const total = Number(pedido?.total ?? Math.max(0, subtotal - discountAmount))

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
      ${descuento > 0 ? `
        <div class="row"><span>Subtotal</span><span>$${formatMoney(subtotal)}</span></div>
        <div class="row"><span>Descuento ${descuento.toLocaleString('es-AR')}%</span><span>-$${formatMoney(discountAmount)}</span></div>
      ` : ''}
      <div class="row bold lg"><span>Total</span><span>$${formatMoney(total)}</span></div>
    </main>
  `
}

function buildFiscalHtml(pedido, comprobante, config) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : ''
  const items = normalizeItems(pedido)
  const qrUrl = comprobante?.qr_url || buildArcaQrUrl(comprobante, config)
  const receiptNumber = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  const cae = comprobante?.cae || ''
  const descuento = clampDiscount(pedido?.descuento_porcentaje)
  const subtotal = calculateOrderSubtotal(items)
  const discountAmount = calculateDiscountAmount(subtotal, descuento)
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
      ${descuento > 0 ? `
        <div class="row"><span>Subtotal</span><span>$${formatMoney(subtotal)}</span></div>
        <div class="row"><span>Descuento ${descuento.toLocaleString('es-AR')}%</span><span>-$${formatMoney(discountAmount)}</span></div>
      ` : ''}
      ${ivaDesgloseHtml}
      <div class="row bold lg"><span>Total</span><span>$${formatMoney(comprobante?.importe_total || pedido?.total)}</span></div>
      ${transparenciaHtml}
      <div class="sep"></div>
      <div class="row"><span>CAE</span><span>${escapeHtml(cae)}</span></div>
      <div class="row"><span>Vto. CAE</span><span>${escapeHtml(formatDate(comprobante?.cae_vto))}</span></div>
      ${comprobante?.qr_data_url
        ? `<img class="qr" alt="QR ARCA" src="${escapeHtml(comprobante.qr_data_url)}" />`
        : `<div class="qr-url">${escapeHtml(qrUrl || 'QR pendiente de generar en backend')}</div>`
      }
      <div class="sep"></div>
      <div class="center sm">Comprobante autorizado por ARCA</div>
    </main>
  `
}

// ============================================================
// FLUJO NUEVO: primero intenta GG EZ Print (WebSocket -> ESC/POS),
// si falla cae al fallback del navegador con el HTML.
// ============================================================

async function tryRemotePrint(kind, content) {
  if (!canPrintRemote(kind)) return false
  const printer = getPrinterFor(kind)
  const cfg = getPrinterConfig()
  try {
    await printerClient.print({
      printerName: printer.name,
      type: printer.type,
      content,
      fontSize: cfg.font_size,
      paperWidth: cfg.paper_width,
    })
    return true
  } catch (err) {
    console.warn(`[printing] GG EZ Print fallo para ${kind}, fallback a window.print():`, err.message)
    return false
  }
}

// ============================================================
// API publica - mantiene las mismas firmas que la version anterior.
// ============================================================

export async function printComanda(pedido) {
  const cfg = getPrinterConfig()
  const text = buildComandaText(pedido, { width: cfg.chars_per_line })
  const ok = await tryRemotePrint('comanda', text)
  if (ok) return

  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const rondaLabel = pedido?._ronda_label || ''
  printDocumentBrowser(
    `Comanda ${shortId}${rondaLabel ? ' - ' + rondaLabel : ''}`,
    buildComandaHtml(pedido)
  )
}

export async function printCustomerTicket(pedido, config) {
  const cfg = getPrinterConfig()
  const text = buildCustomerTicketText(pedido, config, { width: cfg.chars_per_line })
  const ok = await tryRemotePrint('ticket', text)
  if (ok) return

  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  printDocumentBrowser(`Ticket cliente ${shortId}`, buildCustomerHtml(pedido, config))
}

export async function printFiscalTicket(pedido, comprobante, config) {
  const cfg = getPrinterConfig()
  const text = buildFiscalTicketText(pedido, comprobante, config, { width: cfg.chars_per_line })
  const ok = await tryRemotePrint('fiscal', text)
  if (ok) return

  const receiptNumber = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  printDocumentBrowser(`Factura ${receiptNumber}`, buildFiscalHtml(pedido, comprobante, config))
}
