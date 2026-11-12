// Cash flow mensual (Finanzas → Cash flow). Lógica pura, sin Supabase ni
// React, para poder probarla con node (npm run verificar:cashflow).
//
// La tabla tiene una columna por mes y cada mes es de uno de tres tipos:
//
//   pasado  → todo REAL: lo cobrado y lo pagado. El estimado, si lo había,
//             queda como referencia para comparar.
//   curso   → mezcla: lo real hasta hoy + lo pendiente cargado, y el estimado
//             del mes completo. Se muestra el mayor de los dos (si ya se gastó
//             más de lo estimado, manda la realidad).
//   futuro  → el estimado, o lo pendiente ya cargado si es más.
//
// Los egresos se agrupan como los lleva administración en su planilla. El
// agrupamiento vive acá: reagrupar no toca la base (los estimados se guardan
// por id de grupo; si un id desaparece, ese estimado simplemente deja de verse).

export const CONCEPTO_INGRESOS = 'ingresos'

export const GRUPOS = [
  { id: 'mercaderia',        label: 'Mercadería',               categorias: ['mercaderia', 'proveedores'] },
  { id: 'personal',          label: 'Personal',                 categorias: ['sueldos'] },
  { id: 'local_servicios',   label: 'Local y servicios',        categorias: ['alquiler', 'servicios'] },
  { id: 'impuestos',         label: 'Impuestos y tasas',        categorias: ['impuestos'] },
  { id: 'comisiones',        label: 'Comisiones y financieros', categorias: ['comisiones'] },
  { id: 'operativos',        label: 'Operativos',               categorias: ['mantenimiento', 'marketing'] },
  { id: 'inversiones_otros', label: 'Inversiones y otros',      categorias: ['otros'] },
]

const GRUPO_POR_DEFECTO = 'inversiones_otros'

/** Grupo del cash flow al que va una categoría de egreso (las desconocidas, a "otros"). */
export function grupoDeCategoria(categoria) {
  return GRUPOS.find(g => g.categorias.includes(categoria))?.id || GRUPO_POR_DEFECTO
}

// ─── Meses ('YYYY-MM-01', siempre como texto: sin Date no hay corrimientos) ──

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** 'YYYY-MM-DD' (o 'YYYY-MM') → 'YYYY-MM-01'. */
export function mesDe(iso) {
  const [y, m] = String(iso || '').split('-')
  if (!y || !m) return null
  return `${y}-${m.padStart(2, '0')}-01`
}

export function sumarMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/** Meses entre dos (b − a). */
export function diferenciaMeses(a, b) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}

export function listaMeses(desde, cantidad) {
  return Array.from({ length: Math.max(0, cantidad) }, (_, i) => sumarMeses(desde, i))
}

/** Último día del mes, 'YYYY-MM-DD'. */
export function finDeMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${mes.slice(0, 8)}${String(dias).padStart(2, '0')}`
}

/** 'nov 2026' (o 'noviembre 2026' con largo). */
export function labelMes(mes, { largo = false } = {}) {
  const [y, m] = String(mes || '').split('-').map(Number)
  if (!y || !m) return ''
  return `${(largo ? MESES_LARGOS : MESES_CORTOS)[m - 1]} ${y}`
}

export function tipoDeMes(mes, mesActual) {
  if (mes < mesActual) return 'pasado'
  if (mes === mesActual) return 'curso'
  return 'futuro'
}

// ─── Armado ──────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Una celda de la tabla.
 *   valor     → lo que se muestra y entra en los totales
 *   real      → cobrado / pagado
 *   pendiente → pagos cargados todavía sin pagar (solo egresos)
 *   estimado  → lo que escribió administración (null = sin estimar)
 *   origen    → de dónde sale `valor`:
 *               'real' (mes pasado) · 'cargado' (real + pendiente ya en el
 *               sistema) · 'estimado' · 'vacio'
 */
function armarCelda({ tipo, real, pendiente, estimado }) {
  const base = real + pendiente
  if (tipo === 'pasado') {
    return { valor: real, real, pendiente, estimado, origen: real > 0 ? 'real' : 'vacio' }
  }
  if (estimado !== null && estimado >= base) {
    return { valor: estimado, real, pendiente, estimado, origen: 'estimado' }
  }
  return { valor: base, real, pendiente, estimado, origen: base > 0 ? 'cargado' : 'vacio' }
}

function ratio(parte, total) {
  return total > 0 ? parte / total : null
}

/**
 * Estado de un mes. Con saldo configurado manda el saldo final contra el
 * mínimo de seguridad; sin saldo, el signo del flujo del mes.
 */
export function estadoDeMes({ saldoFinal, flujo, saldoMinimo, sinDatos }) {
  if (sinDatos) return 'sin_datos'
  if (saldoFinal !== null) {
    if (saldoFinal < 0) return 'negativo'
    if (saldoMinimo > 0 && saldoFinal < saldoMinimo) return 'bajo'
    return 'ok'
  }
  return flujo < 0 ? 'negativo' : 'ok'
}

export const ESTADOS = {
  ok:        { label: 'OK',           tono: 'ok' },
  bajo:      { label: 'BAJO MÍNIMO',  tono: 'warn' },
  negativo:  { label: 'NEGATIVO',     tono: 'bad' },
  sin_datos: { label: '—',            tono: null },
}

/**
 * Desde qué mes hay que traer datos para poder calcular todo lo que se ve:
 * el saldo se arrastra desde `saldo_desde`, y el promedio real que se sugiere
 * al estimar mira los tres meses anteriores al actual.
 */
export function primerMesDeCalculo(primerVisible, mesActual, saldoDesde) {
  return [primerVisible, sumarMeses(mesActual, -3), saldoDesde].filter(Boolean).sort()[0]
}

/**
 * Arma el modelo completo de la tabla.
 *
 * @param {string[]} meses      meses visibles, en orden
 * @param {Array}    filas      resultado de cashflow_mensual: { mes, concepto, pagado, pendiente, cantidad }
 * @param {Array}    estimados  filas de cashflow_estimados: { mes, concepto, monto }
 * @param {object}   config     { saldo_inicial, saldo_desde, saldo_minimo } o null
 * @param {string}   mesActual  'YYYY-MM-01'
 */
export function armarCashflow({ meses = [], filas = [], estimados = [], config = null, mesActual }) {
  // real / pendiente por mes y grupo
  const datos = new Map()            // `${mes}|${concepto}` → { real, pendiente }
  const sinFecha = { monto: 0, cantidad: 0 }
  for (const f of filas) {
    if (!f.mes) {                    // pendiente sin vencimiento
      sinFecha.monto += num(f.pendiente)
      sinFecha.cantidad += num(f.cantidad)
      continue
    }
    const concepto = f.concepto === CONCEPTO_INGRESOS ? CONCEPTO_INGRESOS : grupoDeCategoria(f.concepto)
    const k = `${mesDe(f.mes)}|${concepto}`
    const prev = datos.get(k) || { real: 0, pendiente: 0 }
    prev.real += num(f.pagado)
    prev.pendiente += num(f.pendiente)
    datos.set(k, prev)
  }
  const est = new Map(estimados.map(e => [`${mesDe(e.mes)}|${e.concepto}`, num(e.monto)]))

  const saldoDesde = config?.saldo_desde ? mesDe(config.saldo_desde) : null
  const saldoInicial = num(config?.saldo_inicial)
  const saldoMinimo = num(config?.saldo_minimo)

  const celdaDe = (mes, concepto, tipo) => {
    const d = datos.get(`${mes}|${concepto}`) || { real: 0, pendiente: 0 }
    const e = est.has(`${mes}|${concepto}`) ? est.get(`${mes}|${concepto}`) : null
    return armarCelda({ tipo, real: d.real, pendiente: concepto === CONCEPTO_INGRESOS ? 0 : d.pendiente, estimado: e })
  }

  const columnaDe = (mes) => {
    const tipo = tipoDeMes(mes, mesActual)
    const ingresos = celdaDe(mes, CONCEPTO_INGRESOS, tipo)
    const grupos = Object.fromEntries(GRUPOS.map(g => [g.id, celdaDe(mes, g.id, tipo)]))
    const totalEgresos = GRUPOS.reduce((a, g) => a + grupos[g.id].valor, 0)
    const pendienteCargado = GRUPOS.reduce((a, g) => a + grupos[g.id].pendiente, 0)
    const flujo = ingresos.valor - totalEgresos
    return { mes, tipo, ingresos, grupos, totalEgresos, pendienteCargado, flujo }
  }

  // El saldo se arrastra desde saldo_desde aunque ese mes no esté a la vista.
  const visibles = new Set(meses)
  const primero = meses[0]
  const ultimo = meses[meses.length - 1]
  const desdeCalculo = saldoDesde && primero && saldoDesde < primero ? saldoDesde : primero
  const mesesCalculo = primero ? listaMeses(desdeCalculo, diferenciaMeses(desdeCalculo, ultimo) + 1) : []

  let saldo = saldoDesde ? saldoInicial : null
  let acumulado = 0
  const columnas = []
  for (const mes of mesesCalculo) {
    const col = columnaDe(mes)
    const enSaldo = saldoDesde !== null && mes >= saldoDesde
    if (enSaldo) saldo += col.flujo
    if (!visibles.has(mes)) continue
    acumulado += col.flujo
    const saldoFinal = enSaldo ? saldo : null
    const sinDatos = col.ingresos.valor === 0 && col.totalEgresos === 0
    columnas.push({
      ...col,
      acumulado,
      saldoFinal,
      estado: estadoDeMes({ saldoFinal, flujo: col.flujo, saldoMinimo, sinDatos }),
      indicadores: {
        mercaderia: ratio(col.grupos.mercaderia.valor, col.ingresos.valor),
        personal: ratio(col.grupos.personal.valor, col.ingresos.valor),
        flujo: ratio(col.flujo, col.ingresos.valor),
      },
    })
  }

  // Totales de lo que se ve.
  const tIngresos = columnas.reduce((a, c) => a + c.ingresos.valor, 0)
  const tGrupos = Object.fromEntries(GRUPOS.map(g => [g.id, columnas.reduce((a, c) => a + c.grupos[g.id].valor, 0)]))
  const tEgresos = columnas.reduce((a, c) => a + c.totalEgresos, 0)
  const total = {
    ingresos: tIngresos,
    grupos: tGrupos,
    totalEgresos: tEgresos,
    pendienteCargado: columnas.reduce((a, c) => a + c.pendienteCargado, 0),
    flujo: tIngresos - tEgresos,
    saldoFinal: columnas.length ? columnas[columnas.length - 1].saldoFinal : null,
    indicadores: {
      mercaderia: ratio(tGrupos.mercaderia, tIngresos),
      personal: ratio(tGrupos.personal, tIngresos),
      flujo: ratio(tIngresos - tEgresos, tIngresos),
    },
  }

  // Promedio real de los últimos (hasta) tres meses cerrados, por concepto:
  // es la referencia que se ofrece al estimar una fila.
  const promedios = {}
  for (const concepto of [CONCEPTO_INGRESOS, ...GRUPOS.map(g => g.id)]) {
    const valores = [1, 2, 3]
      .map(n => datos.get(`${sumarMeses(mesActual, -n)}|${concepto}`)?.real || 0)
      .filter(v => v > 0)
    promedios[concepto] = valores.length ? Math.round(valores.reduce((a, v) => a + v, 0) / valores.length) : null
  }

  return {
    columnas, total, sinFecha, promedios,
    saldo: { desde: saldoDesde, inicial: saldoInicial, minimo: saldoMinimo, configurado: saldoDesde !== null },
    mesesEnAlerta: columnas.filter(c => c.estado === 'negativo' || c.estado === 'bajo').map(c => c.mes),
  }
}

/**
 * Estimados de una fila para varios meses seguidos, con aumento mensual
 * compuesto (inflación, crecimiento). Redondea a pesos.
 *   serieEstimados({ concepto, desde: '2026-12-01', hasta: '2027-02-01', monto: 1000, aumentoPct: 10 })
 *   → [{mes:'2026-12-01', monto:1000}, {mes:'2027-01-01', monto:1100}, {mes:'2027-02-01', monto:1210}]
 */
export function serieEstimados({ concepto, desde, hasta, monto, aumentoPct = 0 }) {
  const base = num(monto)
  const factor = 1 + num(aumentoPct) / 100
  const n = diferenciaMeses(desde, hasta) + 1
  if (!(n > 0) || !(base >= 0) || !(factor > 0)) return []
  return listaMeses(desde, n).map((mes, i) => ({
    mes, concepto, monto: Math.round(base * Math.pow(factor, i)),
  }))
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/** $ 1.234.567 sin decimales; negativos con el signo adelante: -$ 1.234. */
export function fmtPlata(n) {
  const v = Math.round(num(n))
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('es-AR')}`
}

/** $4,6M · $850K · $900 — para etiquetas del gráfico, donde no entra el número entero. */
export function fmtPlataCorta(n) {
  const v = num(n)
  const a = Math.abs(v)
  const signo = v < 0 ? '-' : ''
  if (a >= 1e6) return `${signo}$${(a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })}M`
  if (a >= 1e3) return `${signo}$${Math.round(a / 1e3).toLocaleString('es-AR')}K`
  return `${signo}$${Math.round(a)}`
}

/** 0.786 → '78,6%'; null → '—'. */
export function fmtPct(r) {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—'
  return `${(r * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// ─── Hoja para Excel (matriz de celdas, la escribe cashflowExcel.js) ─────────

/** Matriz [fila][columna] con el mismo orden que la pantalla. Números crudos. */
export function matrizParaExcel(modelo, { negocio = '' } = {}) {
  const cols = modelo.columnas
  const fila = (label, pick, pickTotal) => [label, ...cols.map(pick), pickTotal === undefined ? '' : pickTotal]
  const pct = (r) => (r === null ? '' : Math.round(r * 1000) / 10)
  const tipoLabel = { pasado: 'Real', curso: 'En curso', futuro: 'Estimado' }
  return [
    [`Cash flow mensual${negocio ? ` — ${negocio}` : ''}`],
    ['Montos en pesos. Meses pasados: real. Mes en curso y futuros: estimado o pagos ya cargados, lo que sea mayor.'],
    [],
    ['Concepto', ...cols.map(c => labelMes(c.mes)), 'Total'],
    ['', ...cols.map(c => tipoLabel[c.tipo]), ''],
    ['INGRESOS'],
    fila('Total ingresos', c => c.ingresos.valor, modelo.total.ingresos),
    [],
    ['EGRESOS'],
    ...GRUPOS.map(g => fila(g.label, c => c.grupos[g.id].valor, modelo.total.grupos[g.id])),
    fila('Total egresos', c => c.totalEgresos, modelo.total.totalEgresos),
    [],
    fila('FLUJO NETO DEL MES', c => c.flujo, modelo.total.flujo),
    fila('SALDO FINAL', c => (c.saldoFinal === null ? '' : c.saldoFinal), modelo.total.saldoFinal === null ? '' : modelo.total.saldoFinal),
    fila('Saldo mínimo de seguridad', () => modelo.saldo.minimo, ''),
    fila('Estado', c => ESTADOS[c.estado].label, ''),
    fila('Flujo neto acumulado', c => c.acumulado, modelo.total.flujo),
    [],
    ['INDICADORES'],
    fila('Mercadería como % de ingresos', c => pct(c.indicadores.mercaderia), pct(modelo.total.indicadores.mercaderia)),
    fila('Personal como % de ingresos', c => pct(c.indicadores.personal), pct(modelo.total.indicadores.personal)),
    fila('Flujo neto como % de ingresos', c => pct(c.indicadores.flujo), pct(modelo.total.indicadores.flujo)),
    fila('Pagos pendientes ya cargados (incluidos arriba)', c => c.pendienteCargado, modelo.total.pendienteCargado),
  ]
}
