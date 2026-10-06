// Reporte para los contadores: un Excel con los cobros y los pagos del
// período, y los sueldos pagados por empleado y por mes.
//
// Los números salen de las mismas fuentes que la pantalla de Caja, así lo que
// ve el contador coincide con lo que ve el encargado:
//   · cobros  → `pedidos` + `pagos` (lineasDePago / resumenMediosPago)
//   · pagos   → `egresos` con estado 'pagado'
//   · sueldos → `egresos` de categoría 'sueldos', agrupados por empleado y mes
//
// La librería xlsx se carga recién al exportar (import dinámico) para no
// engordar el bundle de todo el dashboard.
import { lineasDePago, etiquetaMedioPago, MEDIOS_PAGO_ORDEN } from './pagosPedido'
import { getAuthorizedComprobante, getNotasCredito, nombreComprobante } from './fiscal'
import { catLabel, medioLabel } from './finanzas'

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

export function armarHojas({ pedidos = [], egresos = [], desde, hasta, negocio }) {
  // ── Cobros: una fila por línea de pago ──────────────────────────────────
  const cobrosFilas = []
  const cobrosPorMedio = new Map()
  let sinCobro = 0
  pedidos.forEach(p => {
    if (p.estado === 'cancelado') return
    const lineas = lineasDePago(p)
    const factura = getAuthorizedComprobante(p)
    if (lineas.length === 0) { sinCobro += 1; return }
    lineas.forEach(l => {
      const prev = cobrosPorMedio.get(l.medio) || { cobros: 0, monto: 0 }
      prev.cobros += 1; prev.monto += l.monto
      cobrosPorMedio.set(l.medio, prev)
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
      : e.pagado_desde === 'banco' ? 'Banco' : '',
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
    const f = getAuthorizedComprobante(p)
    if (f) { facturado += Number(f.importe_total || 0); cantFacturados += 1 }
    const ncs = getNotasCredito(p)
    cantNc += ncs.length
    nc += ncs.reduce((a, c) => a + Number(c.importe_total || 0), 0)
  })
  const totalCobrado = [...cobrosPorMedio.values()].reduce((a, v) => a + v.monto, 0)
  const totalPagado = egresos.reduce((a, e) => a + Number(e.monto || 0), 0)

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
    ['TOTAL', cobrosFilas.length, $(totalCobrado), $(totalPagado), $(totalCobrado - totalPagado)],
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
  ]

  return {
    resumen,
    cobros: cobrosFilas,
    pagos: pagosFilas,
    sueldosResumen: sueldosFilas,
    sueldosDetalle,
    totales: { vendido, facturado, nc, totalCobrado, totalPagado },
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

export async function exportarReporteContable({ pedidos, egresos, desde, hasta, negocio }) {
  const XLSX = await import('xlsx')
  const hojas = armarHojas({ pedidos, egresos, desde, hasta, negocio })
  const wb = XLSX.utils.book_new()

  const wsResumen = XLSX.utils.aoa_to_sheet(hojas.resumen)
  wsResumen['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  const wsCobros = XLSX.utils.json_to_sheet(hojas.cobros.length ? hojas.cobros : [{ 'Sin cobros en el período': '' }])
  wsCobros['!cols'] = anchos(hojas.cobros)
  aplicarFormatoMoneda(XLSX, wsCobros, [6])
  XLSX.utils.book_append_sheet(wb, wsCobros, 'Cobros')

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

  const slug = (negocio || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  XLSX.writeFile(wb, `${slug}_contable_${desde}_${hasta}.xlsx`)
  return hojas.totales
}
