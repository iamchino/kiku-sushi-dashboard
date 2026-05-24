import { buildArcaQrUrl, formatReceiptNumber } from './fiscal'
import { calculateDiscountAmount, calculateOrderSubtotal, clampDiscount } from './orders'

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

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

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
    direccion && `<div class="row"><span>Dirección</span><span>${escapeHtml(direccion)}</span></div>`,
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

function printDocument(title, bodyHtml) {
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

export function printComanda(pedido) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : 'NUEVO'
  const items = normalizeItems(pedido)
  const canal = CANAL_LABELS[pedido?.canal] || pedido?.canal || 'Pedido'

  const rows = items.map(item => `
    <div class="line">
      <div class="qty">${escapeHtml(item.cantidad)}x</div>
      <div class="name bold">${escapeHtml(item.nombre)}</div>
    </div>
    ${item.notas ? `<div class="note">Nota: ${escapeHtml(item.notas)}</div>` : ''}
  `).join('')

  const body = `
    <main class="ticket">
      <div class="center bold xl">KIKU SUSHI</div>
      <div class="center bold lg">COMANDA INTERNA</div>
      <div class="stamp">DOCUMENTO NO VALIDO COMO FACTURA</div>
      <div class="row"><span>Pedido</span><span class="bold">#${escapeHtml(shortId)}</span></div>
      <div class="row"><span>Fecha</span><span>${escapeHtml(formatDateTime(pedido?.created_at))}</span></div>
      <div class="row"><span>Canal</span><span>${escapeHtml(canal)}</span></div>
      ${pedido?.mesa ? `<div class="row"><span>Mesa</span><span class="bold">${escapeHtml(pedido.mesa)}</span></div>` : ''}
      ${renderClienteBlock(pedido)}
      <div class="sep"></div>
      ${rows || '<div class="center">Sin items</div>'}
      ${pedido?.notas ? `<div class="sep"></div><div class="bold">Notas</div><div>${escapeHtml(pedido.notas)}</div>` : ''}
      <div class="sep"></div>
      <div class="center sm">Kiku Sushi - Cocina</div>
    </main>
  `

  printDocument(`Comanda ${shortId}`, body)
}

export function printCustomerTicket(pedido, config) {
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

  const body = `
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

  printDocument(`Ticket cliente ${shortId}`, body)
}

export function printFiscalTicket(pedido, comprobante, config) {
  const shortId = pedido?.id ? String(pedido.id).slice(-4).toUpperCase() : ''
  const items = normalizeItems(pedido)
  const qrUrl = comprobante?.qr_url || buildArcaQrUrl(comprobante, config)
  const receiptNumber = formatReceiptNumber(comprobante?.punto_venta, comprobante?.numero)
  const cae = comprobante?.cae || ''
  const descuento = clampDiscount(pedido?.descuento_porcentaje)
  const subtotal = calculateOrderSubtotal(items)
  const discountAmount = calculateDiscountAmount(subtotal, descuento)

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

  const body = `
    <main class="ticket">
      <div class="center bold xl">${escapeHtml(config?.nombre_fantasia || 'KIKU SUSHI')}</div>
      ${config?.razon_social ? `<div class="center">${escapeHtml(config.razon_social)}</div>` : ''}
      ${config?.domicilio ? `<div class="center sm">${escapeHtml(config.domicilio)}</div>` : ''}
      ${config?.cuit ? `<div class="center">CUIT ${escapeHtml(config.cuit)}</div>` : ''}
      <div class="center">${escapeHtml(config?.condicion_iva || 'Responsable Inscripto')}</div>
      ${config?.ingresos_brutos ? `<div class="center sm">IIBB ${escapeHtml(config.ingresos_brutos)}</div>` : ''}
      ${config?.inicio_actividades ? `<div class="center sm">Inicio act. ${escapeHtml(formatDate(config.inicio_actividades))}</div>` : ''}
      <div class="sep"></div>
      <div class="center bold lg">FACTURA B</div>
      <div class="center sm">Cod. ${String(comprobante?.tipo_cbte || 6).padStart(3, '0')}</div>
      <div class="row mt"><span>Nro.</span><span class="bold">${escapeHtml(receiptNumber)}</span></div>
      <div class="row"><span>Fecha</span><span>${escapeHtml(formatDate(comprobante?.fecha_emision))}</span></div>
      <div class="row"><span>Pedido</span><span>#${escapeHtml(shortId)}</span></div>
      <div class="sep"></div>
      <div class="bold">Cliente</div>
      <div>${escapeHtml(comprobante?.receptor_nombre || 'Consumidor Final')}</div>
      <div class="sm">${escapeHtml(comprobante?.receptor_condicion_iva || 'Consumidor Final')}</div>
      <div class="sep"></div>
      ${rows}
      <div class="sep"></div>
      ${descuento > 0 ? `
        <div class="row"><span>Subtotal</span><span>$${formatMoney(subtotal)}</span></div>
        <div class="row"><span>Descuento ${descuento.toLocaleString('es-AR')}%</span><span>-$${formatMoney(discountAmount)}</span></div>
      ` : ''}
      <div class="row"><span>Neto gravado</span><span>$${formatMoney(comprobante?.importe_neto)}</span></div>
      <div class="row"><span>IVA</span><span>$${formatMoney(comprobante?.importe_iva)}</span></div>
      <div class="row bold lg"><span>Total</span><span>$${formatMoney(comprobante?.importe_total || pedido?.total)}</span></div>
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

  printDocument(`Factura ${receiptNumber}`, body)
}
