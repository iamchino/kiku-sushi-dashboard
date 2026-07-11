// Helpers del módulo de Control de Horas.
// La semana de liquidación de Kiku va de MARTES a LUNES (laborable mar–sáb).
import { startOfWeek, addDays, addWeeks, format, isWithinInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { localDateISO } from './finanzas'

// weekStartsOn: 2 = martes
export const SEMANA_OPTS = { weekStartsOn: 2 }

export function inicioSemana(ref = new Date()) {
  return startOfWeek(ref, SEMANA_OPTS)
}

// Rango de la semana que contiene `ref`: { inicio, fin, desde, hasta, label }
// desde/hasta en ISO local (YYYY-MM-DD) para queries; fin = lunes siguiente.
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
