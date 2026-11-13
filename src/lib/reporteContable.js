// Reporte para los contadores: un Excel con los cobros y los pagos del
// período, y los sueldos pagados por empleado y por mes.
//
// Los números salen de las mismas fuentes que la pantalla de Caja, así lo que
// ve el contador coincide con lo que ve el encargado:
//   · cobros  → `pedidos` + `pagos` (lineasDePago / resumenMediosPago)
//   · pagos   → `egresos` con estado 'pagado'
//   · sueldos → `egresos` de categoría 'sueldos', agrupados por empleado y mes
//   · cuentas corrientes (canjes) → `cuentas_corrientes_saldos` y sus
//     movimientos. Lo cobrado a cuenta figura en Cobros con su medio propio,
//     pero NO suma al total cobrado: no es plata que haya entrado.
//   · IVA de las ventas → facturas y notas de crédito EMITIDAS en el período
//     (por fecha de emisión, como las declara el contador), con el neto y el
//     IVA de cada una. La lógica está en lib/ivaVentas.js.
//
// La librería xlsx se carga recién al exportar (import dinámico) para no
// engordar el bundle de todo el dashboard.
import { lineasDePago, etiquetaMedioPago, esCuentaCorriente, MEDIOS_PAGO_ORDEN } from './pagosPedido'
import { estadoCuenta, fechaCorta } from './cuentasCorrientes'
import { COND_IVA_RECEPTOR_LABEL, fechaHoyAR, getAuthorizedComprobante, getFacturasAutorizadas, getNotasCredito, nombreComprobante } from './fiscal'
import { catLabel, medioLabel } from './finanzas'
import { bloqueResumenIva, comprobantesDePedidos, desgloseIva, filasLibroIva } from './ivaVentas'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fechaAR(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

function horaAR(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/** 'YYYY-MM-DD' (fecha de egreso, sin hora) → 'Oct 2026'. */
function mesDeFecha(iso) {
  const [y, m] = String(iso || '').split('-')
  if (!y || !m) return 'Sin fecha'
  return `${MESES[Number(m) - 1] || m} ${y}`
}

function claveMes(iso) {
  return String(iso || '').slice(0, 7) || '9999-99'
}

function num(v) {
  return Math.round(Number(v || 0) * 100) / 100
}

// Celda con formato de moneda para la hoja Resumen (que mezcla cantidades y
// importes en la misma columna).
function $(v) {
  return { v: num(v), t: 'n', z: '#,##0.00' }
}

const CANAL = {
  salon: 'Salón', delivery: 'Delivery', takeaway: 'Take away', whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa', rappi: 'Rappi', web: 'Web',
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos (la consulta de egresos vive en lib/pagos.js: cargarEgresosPeriodo)
// ─────────────────────────────────────────────────────────────────────────────

/** Resumen de egresos por medio de pago, para la tarjeta de Totales. */
export function resumenEgresos(egresos = []) {
  const porMedio = new Map()
  let total = 0
  egresos.forEach(e => {
    if (e.estado && e.estado !== 'pagado') return
    const monto = Number(e.monto || 0)
    total += monto
    porMedio.set(e.medio_pago, (porMedio.get(e.medio_pago) || 0) + monto)
  })
  return { total, porMedio, cantidad: egresos.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Armado de hojas
// ─────────────────────────────────────────────────────────────────────────────

function nombreEmpleado(e) {
  const emp = e?.empleado
  if (emp?.nombre || emp?.apellido) return [emp.nombre, emp.apellido].filter(Boolean).join(' ')
  return e?.descripcion || 'Sin empleado'
}

export function armarHojas({
  pedidos = [], egresos = [], cuentasCorrientes = null, cuentasDePagos = null, desde, hasta, negocio,
  comprobantesEmitidos = null, numerosDePedido = null, alicuota = 21,
}) {
  // ── Cobros: una fila por línea de pago ──────────────────────────────────
  const cobrosFilas = []
  const cobrosPorMedio = new Map()
  const canjes = { cobros: 0, monto: 0 }   // lo cargado a cuenta corriente
  let sinCobro = 0
  pedidos.forEach(p => {
    if (p.estado === 'cancelado') return
    const lineas = lineasDePago(p)
    const factura = getAuthorizedComprobante(p)
    if (lineas.length === 0) { sinCobro += 1; return }
    lineas.forEach(l => {
      if (esCuentaCorriente(l.medio)) {
        canjes.cobros += 1; canjes.monto += l.monto
      } else {
        const prev = cobrosPorMedio.get(l.medio) || { cobros: 0, monto: 0 }
        prev.cobros += 1; prev.monto += l.monto
        cobrosPorMedio.set(l.medio, prev)
      }
      cobrosFilas.push({
        'Fecha': fechaAR(l.at || p.created_at),
        'Hora': horaAR(l.at || p.created_at),
        'Pedido': p.numero ?? String(p.id || '').slice(-6).toUpperCase(),
        'Canal': CANAL[p.canal] || p.canal || '',
        'Mesa': p.mesa || '',
        'Medio de pago': etiquetaMedioPago(l.medio),
        'Monto': num(l.monto),
        'Nro. operación': l.nroOp || '',
        'Comprobante': factura ? nombreComprobante(factura.tipo_cbte) : 'Sin factura',
        'Nro. comprobante': factura
          ? `${String(factura.punto_venta).padStart(5, '0')}-${String(factura.numero).padStart(8, '0')}`
          : '',
        'CAE': factura?.cae || '',
        'Cuenta corriente': esCuentaCorriente(l.medio) ? (cuentasDePagos?.get(l.id) || 'Sí') : '',
      })
    })
  })

  // ── Pagos (egresos): una fila por pago ──────────────────────────────────
  const pagosFilas = egresos.map(e => ({
    'Fecha': fechaAR(`${e.fecha}T12:00:00`),
    'Categoría': catLabel(e.categoria),
    'Detalle': e.subtipo || '',
    'Descripción': e.descripcion || '',
    'Proveedor / Empleado': e.proveedor?.razon_social || nombreEmpleado(e) || '',
    'Período': e.periodo || '',
    'Medio de pago': medioLabel(e.medio_pago),
    'Salió de': e.pagado_desde === 'caja' ? 'Caja del día'
      : e.pagado_desde === 'caja_fuerte' ? 'Caja fuerte'
      : e.pagado_desde === 'banco' ? (e.cuenta?.nombre || 'Banco') : '',
    'Comprobante': e.comprobante_nro || '',
    'Monto': num(e.monto),
  }))
  const pagosPorMedio = new Map()
  const pagosPorCategoria = new Map()
  egresos.forEach(e => {
    const m = Number(e.monto || 0)
    pagosPorMedio.set(e.medio_pago, (pagosPorMedio.get(e.medio_pago) || 0) + m)
    pagosPorCategoria.set(e.categoria, (pagosPorCategoria.get(e.categoria) || 0) + m)
  })

  // ── Sueldos: empleado × mes ─────────────────────────────────────────────
  const sueldos = egresos.filter(e => e.categoria === 'sueldos')
  const meses = [...new Set(sueldos.map(e => claveMes(e.fecha)))].sort()
  const porEmpleado = new Map()
  sueldos.forEach(e => {
    const nombre = nombreEmpleado(e)
    const fila = porEmpleado.get(nombre) || { total: 0, meses: new Map() }
    const k = claveMes(e.fecha)
    fila.meses.set(k, (fila.meses.get(k) || 0) + Number(e.monto || 0))
    fila.total += Number(e.monto || 0)
    porEmpleado.set(nombre, fila)
  })
  const sueldosFilas = [...porEmpleado.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([nombre, fila]) => {
      const row = { 'Empleado': nombre }
      meses.forEach(k => { row[mesDeFecha(`${k}-01`)] = num(fila.meses.get(k) || 0) })
      row['Total'] = num(fila.total)
      return row
    })
  if (sueldosFilas.length > 0) {
    const totalRow = { 'Empleado': 'TOTAL' }
    meses.forEach(k => {
      totalRow[mesDeFecha(`${k}-01`)] = num(sueldos
        .filter(e => claveMes(e.fecha) === k)
        .reduce((a, e) => a + Number(e.monto || 0), 0))
    })
    totalRow['Total'] = num(sueldos.reduce((a, e) => a + Number(e.monto || 0), 0))
    sueldosFilas.push(totalRow)
  }
  const sueldosDetalle = sueldos.map(e => ({
    'Fecha': fechaAR(`${e.fecha}T12:00:00`),
    'Mes': mesDeFecha(e.fecha),
    'Empleado': nombreEmpleado(e),
    'Concepto': e.subtipo || e.descripcion || 'Sueldo',
    'Período': e.periodo || '',
    'Medio de pago': medioLabel(e.medio_pago),
    'Monto': num(e.monto),
  }))

  // ── Facturación ─────────────────────────────────────────────────────────
  const activos = pedidos.filter(p => p.estado !== 'cancelado')
  const vendido = activos.reduce((a, p) => a + Number(p.total || 0), 0)
  let facturado = 0, cantFacturados = 0, nc = 0, cantNc = 0
  activos.forEach(p => {
    // Todas las facturas (anuladas incluidas): las NC se restan aparte.
    getFacturasAutorizadas(p).forEach(f => {
      facturado += Number(f.importe_total || 0); cantFacturados += 1
    })
    const ncs = getNotasCredito(p)
    cantNc += ncs.length
    nc += ncs.reduce((a, c) => a + Number(c.importe_total || 0), 0)
  })
  const totalCobrado = [...cobrosPorMedio.values()].reduce((a, v) => a + v.monto, 0)
  const totalPagado = egresos.reduce((a, e) => a + Number(e.monto || 0), 0)

  // ── IVA de las ventas ───────────────────────────────────────────────────
  // Por fecha de EMISIÓN del comprobante. Si esa lista no vino (no se pudo
  // leer), se arma con las facturas de los pedidos del período, que es lo que
  // muestra Caja, y el bloque lo aclara.
  const porEmision = Array.isArray(comprobantesEmitidos)
  const comprobantesIva = porEmision ? comprobantesEmitidos : comprobantesDePedidos(activos)
  const numeroPedidoIva = new Map(pedidos.map(p => [p.id, p.numero]))
  if (numerosDePedido) numerosDePedido.forEach((nro, id) => numeroPedidoIva.set(id, nro))
  const ivaDesglose = desgloseIva(comprobantesIva, alicuota)
  const ivaFilas = filasLibroIva(comprobantesIva, { alicuota, numeroPedido: numeroPedidoIva })
  const bloqueIva = bloqueResumenIva(ivaDesglose, { alicuota, desde, hasta, porEmision })
  if (porEmision && Math.abs(ivaDesglose.total - (facturado - nc)) >= 0.01) {
    bloqueIva.push(['Puede no coincidir con el "Neto facturado" de arriba: acá cada comprobante cuenta por su fecha de emisión; arriba, por la fecha del pedido.'])
  }

  // ── Resumen ─────────────────────────────────────────────────────────────
  const medios = [
    ...MEDIOS_PAGO_ORDEN.map(m => m.id),
    ...[...new Set([...cobrosPorMedio.keys(), ...pagosPorMedio.keys()])]
      .filter(id => !MEDIOS_PAGO_ORDEN.some(m => m.id === id)),
  ]
  const resumen = [
    [negocio || 'Reporte contable'],
    [`Período: ${fechaAR(`${desde}T12:00:00`)} al ${fechaAR(`${hasta}T12:00:00`)}`],
    [`Generado: ${fechaAR(new Date())} ${horaAR(new Date())}`],
    [],
    ['COBROS Y PAGOS POR MEDIO'],
    ['Medio de pago', 'Cobros (cant.)', 'Cobrado', 'Pagado', 'Neto'],
    ...medios.map(id => {
      const c = cobrosPorMedio.get(id) || { cobros: 0, monto: 0 }
      const p = pagosPorMedio.get(id) || 0
      return [etiquetaMedioPago(id) === 'Sin registrar' ? medioLabel(id) : etiquetaMedioPago(id),
        c.cobros, $(c.monto), $(p), $(c.monto - p)]
    }),
    ['TOTAL', cobrosFilas.length - canjes.cobros, $(totalCobrado), $(totalPagado), $(totalCobrado - totalPagado)],
    ...(canjes.cobros > 0
      ? [['Cuenta corriente (canjes: no es dinero, no suma al total)', canjes.cobros, $(canjes.monto)]]
      : []),
    [],
    ['PAGOS POR CATEGORÍA'],
    ['Categoría', 'Pagado'],
    ...[...pagosPorCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, m]) => [catLabel(cat), $(m)]),
    [],
    ['VENTAS Y FACTURACIÓN'],
    ['Pedidos', activos.length],
    ['Vendido (total de pedidos)', $(vendido)],
    ['Facturado (facturas autorizadas)', $(facturado), `${cantFacturados} facturas`],
    ['No facturado', $(vendido - facturado)],
    ['Notas de crédito', $(-nc), `${cantNc} NC`],
    ['Neto facturado', $(facturado - nc)],
    ['Pedidos sin cobro registrado', sinCobro],
    [],
    ...bloqueIva.map(fila => fila.map(v => (typeof v === 'number' ? $(v) : v))),
  ]

  // ── Cuentas corrientes (canjes) ─────────────────────────────────────────
  // Estado de cada cuenta a hoy + lo consumido dentro del período, y el
  // detalle de los movimientos del período.
  const cuentas = cuentasCorrientes?.cuentas || []
  const movsPeriodo = cuentasCorrientes?.movimientos || []
  const hoy = fechaHoyAR()
  const consumidoPeriodo = new Map()
  movsPeriodo.forEach(m => {
    consumidoPeriodo.set(m.cuenta_id, (consumidoPeriodo.get(m.cuenta_id) || 0) + Number(m.monto || 0))
  })
  const cuentasFilas = cuentas.map(c => ({
    'Cuenta': c.nombre,
    'Razón social': c.razon_social || '',
    'CUIT': c.cuit || '',
    'Condición IVA': COND_IVA_RECEPTOR_LABEL[Number(c.condicion_iva)] || '',
    'Vigencia desde': fechaCorta(c.vigencia_desde),
    'Vigencia hasta': fechaCorta(c.vigencia_hasta),
    'Estado': estadoCuenta(c, hoy).label,
    'Monto acordado': num(c.monto_acordado),
    'Consumido en el período': num(consumidoPeriodo.get(c.id) || 0),
    'Consumido total': num(c.consumido),
    'Saldo': num(c.saldo),
    'Notas del acuerdo': c.notas || '',
  }))
  if (cuentasFilas.length > 1) {
    cuentasFilas.push({
      'Cuenta': 'TOTAL', 'Razón social': '', 'CUIT': '', 'Condición IVA': '',
      'Vigencia desde': '', 'Vigencia hasta': '', 'Estado': '',
      'Monto acordado': num(cuentas.reduce((a, c) => a + c.monto_acordado, 0)),
      'Consumido en el período': num([...consumidoPeriodo.values()].reduce((a, v) => a + v, 0)),
      'Consumido total': num(cuentas.reduce((a, c) => a + c.consumido, 0)),
      'Saldo': num(cuentas.reduce((a, c) => a + c.saldo, 0)),
      'Notas del acuerdo': '',
    })
  }
  const nombreCuenta = new Map(cuentas.map(c => [c.id, c.nombre]))
  const numeroPedido = new Map(pedidos.map(p => [p.id, p.numero]))
  const cuentasMovimientos = [...movsPeriodo]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map(m => ({
      'Fecha': fechaCorta(m.fecha),
      'Cuenta': nombreCuenta.get(m.cuenta_id) || '',
      'Detalle': m.detalle || '',
      'Nro. operación': m.numero_operacion || '',
      'Pedido': m.pedido_id ? (numeroPedido.get(m.pedido_id) ?? '') : '',
      'Origen': m.pago_id ? 'Cobro en caja' : 'Cargado a mano',
      'Monto': num(m.monto),
    }))

  return {
    resumen,
    cobros: cobrosFilas,
    pagos: pagosFilas,
    sueldosResumen: sueldosFilas,
    sueldosDetalle,
    cuentas: cuentasFilas,
    cuentasMovimientos,
    ivaVentas: ivaFilas,
    totales: {
      vendido, facturado, nc, totalCobrado, totalPagado, canjes: canjes.monto,
      iva: ivaDesglose.iva, netoSinIva: ivaDesglose.neto, facturadoEmitido: ivaDesglose.total, ivaPorEmision: porEmision,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────────────────────

function anchos(filas, minimo = 10) {
  if (!filas.length) return []
  const keys = Object.keys(filas[0])
  return keys.map(k => ({
    wch: Math.min(48, Math.max(minimo, k.length, ...filas.map(f => String(f[k] ?? '').length))),
  }))
}

function aplicarFormatoMoneda(XLSX, ws, columnas) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    columnas.forEach(C => {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00'
    })
  }
}

export async function exportarReporteContable({
  pedidos, egresos, cuentasCorrientes, cuentasDePagos, desde, hasta, negocio,
  comprobantesEmitidos = null, numerosDePedido = null, alicuota = 21,
}) {
  const XLSX = await import('xlsx')
  const hojas = armarHojas({
    pedidos, egresos, cuentasCorrientes, cuentasDePagos, desde, hasta, negocio,
    comprobantesEmitidos, numerosDePedido, alicuota,
  })
  const wb = XLSX.utils.book_new()

  const wsResumen = XLSX.utils.aoa_to_sheet(hojas.resumen)
  wsResumen['!cols'] = [{ wch: 46 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  const wsCobros = XLSX.utils.json_to_sheet(hojas.cobros.length ? hojas.cobros : [{ 'Sin cobros en el período': '' }])
  wsCobros['!cols'] = anchos(hojas.cobros)
  aplicarFormatoMoneda(XLSX, wsCobros, [6])
  XLSX.utils.book_append_sheet(wb, wsCobros, 'Cobros')

  // IVA de las ventas: una fila por factura y por nota de crédito emitida.
  const wsIva = XLSX.utils.json_to_sheet(
    hojas.ivaVentas.length ? hojas.ivaVentas : [{ 'Sin comprobantes emitidos en el período': '' }],
  )
  wsIva['!cols'] = anchos(hojas.ivaVentas)
  aplicarFormatoMoneda(XLSX, wsIva, [6, 7, 8])
  XLSX.utils.book_append_sheet(wb, wsIva, 'IVA ventas')

  const wsPagos = XLSX.utils.json_to_sheet(hojas.pagos.length ? hojas.pagos : [{ 'Sin pagos en el período': '' }])
  wsPagos['!cols'] = anchos(hojas.pagos)
  aplicarFormatoMoneda(XLSX, wsPagos, [9])
  XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos')

  const wsSueldos = XLSX.utils.json_to_sheet(
    hojas.sueldosResumen.length ? hojas.sueldosResumen : [{ 'Sin sueldos pagados en el período': '' }],
  )
  wsSueldos['!cols'] = anchos(hojas.sueldosResumen, 12)
  if (hojas.sueldosResumen.length) {
    const n = Object.keys(hojas.sueldosResumen[0]).length
    aplicarFormatoMoneda(XLSX, wsSueldos, Array.from({ length: n - 1 }, (_, i) => i + 1))
  }
  XLSX.utils.book_append_sheet(wb, wsSueldos, 'Sueldos por mes')

  if (hojas.sueldosDetalle.length) {
    const wsDet = XLSX.utils.json_to_sheet(hojas.sueldosDetalle)
    wsDet['!cols'] = anchos(hojas.sueldosDetalle)
    aplicarFormatoMoneda(XLSX, wsDet, [6])
    XLSX.utils.book_append_sheet(wb, wsDet, 'Sueldos detalle')
  }

  // Cuentas corrientes (canjes): solo si hay cuentas y el usuario las ve.
  if (hojas.cuentas.length) {
    const wsCc = XLSX.utils.json_to_sheet(hojas.cuentas)
    wsCc['!cols'] = anchos(hojas.cuentas, 12)
    aplicarFormatoMoneda(XLSX, wsCc, [7, 8, 9, 10])
    XLSX.utils.book_append_sheet(wb, wsCc, 'Cuentas corrientes')
  }
  if (hojas.cuentasMovimientos.length) {
    const wsCcMov = XLSX.utils.json_to_sheet(hojas.cuentasMovimientos)
    wsCcMov['!cols'] = anchos(hojas.cuentasMovimientos)
    aplicarFormatoMoneda(XLSX, wsCcMov, [6])
    XLSX.utils.book_append_sheet(wb, wsCcMov, 'Cuentas corr. movimientos')
  }

  const slug = (negocio || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  XLSX.writeFile(wb, `${slug}_contable_${desde}_${hasta}.xlsx`)
  return hojas.totales
}
