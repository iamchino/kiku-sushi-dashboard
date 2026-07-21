// Helpers del módulo de Control de Horas.
// La semana de liquidación de Kiku va de LUNES a DOMINGO (laborable mar–sáb;
// el domingo no se trabaja pero cierra la semana).
import { startOfWeek, addDays, addWeeks, format, isWithinInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { localDateISO } from './finanzas'

// weekStartsOn: 1 = lunes
export const SEMANA_OPTS = { weekStartsOn: 1 }

export function inicioSemana(ref = new Date()) {
  return startOfWeek(ref, SEMANA_OPTS)
}

// Rango de la semana que contiene `ref`: { inicio, fin, desde, hasta, label }
// desde/hasta en ISO local (YYYY-MM-DD) para queries; fin = domingo (inicio + 6).
export function rangoSemana(ref = new Date()) {
  const inicio = inicioSemana(ref)
  const fin = addDays(inicio, 6)
  return {
    inicio,
    fin,
    desde: localDateISO(inicio),
    hasta: localDateISO(fin),
    // instantes UTC reales para filtrar columnas timestamptz
    inicioISO: inicio.toISOString(),
    finExclusivoISO: addDays(inicio, 7).toISOString(),
    label: `${format(inicio, 'EEE d MMM', { locale: es })} → ${format(fin, 'EEE d MMM', { locale: es })}`,
  }
}

export function shiftSemana(ref, dir) {
  return addWeeks(ref, dir)
}

export function esSemanaActual(inicio) {
  return isWithinInterval(new Date(), { start: inicio, end: addDays(inicio, 7) })
}

// ── Desglose por día ────────────────────────────────────────────────────────
// Zona horaria del negocio. La usamos para que la fecha de un fichaje coincida
// con la que calcula el SQL (que agrupa con `at time zone America/...`): así el
// desglose por día suma EXACTO el total semanal, sin corrimientos por UTC.
const AR_TZ = 'America/Argentina/Buenos_Aires'
const AR_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})

// timestamptz | Date → 'YYYY-MM-DD' en hora de Argentina.
export function arDateISO(ts) {
  return AR_DATE_FMT.format(new Date(ts))
}

// Los 7 días de la semana que empieza en `inicio` (lunes), como
// [{ iso, corta, num }] listos para pintar la tira Lun→Dom.
// corta: 'lun'..'dom' · num: día del mes.
export function diasDeLaSemana(inicio) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(inicio, i)
    return {
      iso: localDateISO(d),
      corta: format(d, 'EEEEEE', { locale: es }), // 'lu','ma'... -> lo normalizamos abajo
      etiqueta: format(d, 'EEE', { locale: es }),   // 'lun','mar'...
      num: format(d, 'd'),
    }
  })
}

// Compacto para la tira por día: 0 → '—', 420 → '7h', 450 → '7h30'.
export function fmtHorasCompacto(min) {
  const m = Math.max(0, Math.round(Number(min || 0)))
  if (m === 0) return '—'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  return r === 0 ? `${h}h` : `${h}h${r.toString().padStart(2, '0')}`
}

// 462 → "7 h 42 m"
export function fmtMinutos(min) {
  const m = Math.max(0, Math.round(Number(min || 0)))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} m`
  return r === 0 ? `${h} h` : `${h} h ${r.toString().padStart(2, '0')} m`
}

// timestamptz → "18:03"
export function fmtHora(ts) {
  if (!ts) return '—'
  return format(new Date(ts), 'HH:mm')
}

// timestamptz → "mar 14/07 18:03"
export function fmtFechaHora(ts) {
  if (!ts) return '—'
  return format(new Date(ts), 'EEE dd/MM HH:mm', { locale: es })
}

// Pide la ubicación al navegador. Devuelve { lat, lng, precision_m } o lanza
// un Error con mensaje entendible para mostrar en pantalla.
export function obtenerUbicacion({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este dispositivo no soporta ubicación. Probá desde el celular.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision_m: pos.coords.accuracy ?? null,
      }),
      (err) => {
        const msgs = {
          1: 'Tenés que darle permiso de ubicación al navegador para poder fichar.',
          2: 'No pudimos obtener tu ubicación. Activá el GPS e intentá de nuevo.',
          3: 'La ubicación tardó demasiado. Intentá de nuevo.',
        }
        reject(new Error(msgs[err.code] || 'Error obteniendo la ubicación.'))
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    )
  })
}
