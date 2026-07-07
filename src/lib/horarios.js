import { supabase } from './supabase'

/**
 * Horarios especiales de apertura (ej. días de partido).
 *
 * Tabla `aperturas_especiales`:
 *   fecha        → día puntual (YYYY-MM-DD, hora Argentina)
 *   canal        → 'takeaway' | 'delivery' | 'ambos' (hoy la web adelanta takeaway/ambos)
 *   apertura_min → minuto de apertura ese día (13:00 = 780)
 *   nota         → texto libre
 *   activo       → permite desactivar sin borrar
 *
 * La web pública (Pedidos.tsx) lee esta tabla con la clave anon.
 */

/** "HH:MM" → minutos del día. "13:00" → 780. */
export function timeToMin(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return Math.max(0, Math.min(1439, h * 60 + m))
}

/** minutos del día → "HH:MM". 780 → "13:00". */
export function minToTime(min) {
  const n = Math.max(0, Math.min(1439, Number(min) || 0))
  const h = String(Math.floor(n / 60)).padStart(2, '0')
  const m = String(n % 60).padStart(2, '0')
  return `${h}:${m}`
}

/** Lista las aperturas especiales, ordenadas por fecha ascendente. */
export async function fetchAperturas({ soloActivas = false } = {}) {
  let query = supabase
    .from('aperturas_especiales')
    .select('id, fecha, canal, apertura_min, nota, activo')
    .order('fecha', { ascending: true })
  if (soloActivas) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

/** Crea una apertura especial. */
export async function crearApertura({ fecha, canal = 'takeaway', apertura_min, nota }) {
  return supabase.from('aperturas_especiales').insert({
    fecha,
    canal,
    apertura_min: Number(apertura_min),
    nota: (nota || '').trim() || null,
  })
}

/** Actualiza una apertura especial. */
export async function actualizarApertura(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() }
  if ('apertura_min' in clean) clean.apertura_min = Number(clean.apertura_min)
  if ('nota' in clean) clean.nota = (clean.nota || '').trim() || null
  return supabase.from('aperturas_especiales').update(clean).eq('id', id)
}

/** Elimina una apertura especial. */
export async function eliminarApertura(id) {
  return supabase.from('aperturas_especiales').delete().eq('id', id)
}
