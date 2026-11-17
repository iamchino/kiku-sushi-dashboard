// Constantes y helpers compartidos por la sección Finanzas.

export const CATEGORIAS = [
  { id: 'mercaderia',    label: 'Mercadería',    color: '#0ea5e9' },
  { id: 'sueldos',       label: 'Sueldos',       color: '#f97316' },
  { id: 'proveedores',   label: 'Proveedores',   color: '#8b5cf6' },
  { id: 'alquiler',      label: 'Alquiler',      color: '#ec4899' },
  { id: 'servicios',     label: 'Servicios',     color: '#14b8a6' },
  { id: 'impuestos',     label: 'Impuestos',     color: '#ef4444' },
  { id: 'mantenimiento', label: 'Mantenimiento', color: '#eab308' },
  { id: 'marketing',     label: 'Marketing',     color: '#22c55e' },
  // Comisiones de tarjetas y apps, gastos bancarios, intereses (desde el SQL 55).
  { id: 'comisiones',    label: 'Comisiones y financieros', color: '#6366f1' },
  { id: 'otros',         label: 'Otros',         color: '#94a3b8' },
]

export const MEDIOS_PAGO = [
  { id: 'efectivo',        label: 'Efectivo' },
  { id: 'transferencia',   label: 'Transferencia' },
  { id: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { id: 'tarjeta_debito',  label: 'Tarjeta débito' },
  { id: 'cheque',          label: 'Cheque' },
  { id: 'otro',            label: 'Otro' },
  // Canje (desde el SQL 59): la factura se canceló sin plata (se cambió por
  // una cata, por consumo en el local…). El pago queda PAGADO, pero no es
  // plata que salió: no cuenta en "Salió", ni en el cash flow, ni en los
  // Totales de Caja. Es el espejo de "Cuenta corriente" del lado de los cobros.
  { id: 'canje',           label: 'Canje' },
]

export const MEDIO_CANJE = 'canje'

/** True si el pago (fila de `egresos`) se canceló con canje: no salió plata. */
export const esCanje = (egreso) => egreso?.medio_pago === MEDIO_CANJE

/** Solo los pagos que movieron plata (sin los canjes). */
export const sinCanjes = (egresos) => (egresos || []).filter(e => !esCanje(e))

/**
 * Lo pagado con canje dentro de una lista de egresos: { total, cantidad }.
 * Cuenta solo los que están pagados (un canje nunca queda pendiente).
 */
export function totalCanjes(egresos) {
  let total = 0, cantidad = 0
  for (const e of egresos || []) {
    if (!esCanje(e) || (e.estado && e.estado !== 'pagado')) continue
    total += Number(e.monto) || 0
    cantidad += 1
  }
  return { total, cantidad }
}

// El constraint viejo de la tabla no conoce 'canje': sin el SQL 59 la base
// rechaza el pago con el nombre del check. Se traduce a algo que se entienda.
export function errorDeCanje(mensaje) {
  return /egresos_medio_pago_check/i.test(String(mensaje || ''))
    ? 'Para pagar con canje falta correr el SQL 59 en Supabase. Mientras tanto, guardalo con otro medio de pago.'
    : mensaje
}

// Un pago pendiente vive en dos estados según su vencimiento:
//   PROYECCIÓN → falta más que esto para vencer (o no tiene fecha)
//   DEUDA      → vence dentro de este plazo, o ya venció
// El pase es automático: lo decide el calendario, no una acción del usuario.
export const DIAS_ANTES_DE_SER_DEUDA = 3

/** 'proyeccion' | 'deuda' para un vencimiento 'YYYY-MM-DD' (null = proyección). */
export function naturalezaPendiente(vencimiento, hoyISO = localDateISO()) {
  if (!vencimiento) return 'proyeccion'
  const limite = new Date(`${hoyISO}T00:00:00`)
  limite.setDate(limite.getDate() + DIAS_ANTES_DE_SER_DEUDA)
  return vencimiento <= localDateISO(limite) ? 'deuda' : 'proyeccion'
}

export const catLabel  = (id) => CATEGORIAS.find(c => c.id === id)?.label || id
export const catColor  = (id) => CATEGORIAS.find(c => c.id === id)?.color || '#94a3b8'
export const medioLabel = (id) => MEDIOS_PAGO.find(m => m.id === id)?.label || id

// $ 1.234.567 (sin decimales, formato es-AR)
export const fmtMoney = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`

/**
 * "$1.250.000,50": la plata con centavos solo si los tiene (un saldo de banco
 * o el total de una factura los traen, y redondearlos confunde al cotejar).
 * Negativos: "-$35.000".
 */
export function fmtPlata(n) {
  const v = Number(n) || 0
  const conCentavos = Math.abs(Math.round(v * 100)) % 100 !== 0
  const txt = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : ''}$${txt}`
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' sin problemas de zona horaria
export const fmtFecha = (s) => {
  if (!s) return ''
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return (y && m && d) ? `${d}/${m}/${y}` : s
}

// 'YYYY-MM-DD' en hora LOCAL (no UTC)
export function localDateISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Devuelve { desde, hasta, label } para 'dia' | 'mes' | 'anio' a partir de una fecha de referencia.
export function calcularPeriodo(gran, ref = new Date()) {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  if (gran === 'dia') {
    const iso = localDateISO(ref)
    return { desde: iso, hasta: iso, label: fmtFecha(iso) }
  }
  if (gran === 'anio') {
    return {
      desde: `${y}-01-01`,
      hasta: `${y}-12-31`,
      label: `Año ${y}`,
    }
  }
  // mes (por defecto)
  const last = new Date(y, m + 1, 0).getDate()
  return {
    desde: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    hasta: `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    label: `${MESES[m]} ${y}`,
  }
}

// Mueve la fecha de referencia un período hacia atrás/adelante.
export function shiftRef(gran, ref, dir) {
  const d = new Date(ref)
  if (gran === 'dia')  d.setDate(d.getDate() + dir)
  if (gran === 'mes')  d.setMonth(d.getMonth() + dir)
  if (gran === 'anio') d.setFullYear(d.getFullYear() + dir)
  return d
}

/**
 * Resumen de lo cargado a un proveedor: cuánto se le pagó con plata, cuánto se
 * canceló con canje, cuánto se le debe y cuánto de eso ya venció.
 * `pagos` = filas de egresos.
 */
export function resumenPagosProveedor(pagos, hoyISO = localDateISO()) {
  const r = {
    pagado: 0, cantPagados: 0, canjeado: 0, cantCanjeados: 0,
    pendiente: 0, cantPendientes: 0, vencido: 0, cantVencidos: 0,
  }
  for (const p of pagos || []) {
    const monto = Number(p?.monto) || 0
    if (p?.estado === 'pendiente') {
      r.pendiente += monto; r.cantPendientes += 1
      if (p.vencimiento && p.vencimiento < hoyISO) { r.vencido += monto; r.cantVencidos += 1 }
    } else if (esCanje(p)) {
      r.canjeado += monto; r.cantCanjeados += 1
    } else {
      r.pagado += monto; r.cantPagados += 1
    }
  }
  return r
}
