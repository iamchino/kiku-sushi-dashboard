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
  { id: 'otros',         label: 'Otros',         color: '#94a3b8' },
]

export const MEDIOS_PAGO = [
  { id: 'efectivo',        label: 'Efectivo' },
  { id: 'transferencia',   label: 'Transferencia' },
  { id: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { id: 'tarjeta_debito',  label: 'Tarjeta débito' },
  { id: 'cheque',          label: 'Cheque' },
  { id: 'otro',            label: 'Otro' },
]

export const catLabel  = (id) => CATEGORIAS.find(c => c.id === id)?.label || id
export const catColor  = (id) => CATEGORIAS.find(c => c.id === id)?.color || '#94a3b8'
export const medioLabel = (id) => MEDIOS_PAGO.find(m => m.id === id)?.label || id

// $ 1.234.567 (sin decimales, formato es-AR)
export const fmtMoney = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-AR')}`

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
