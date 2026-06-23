import { supabase } from './supabase'

/**
 * Configuración de envío (delivery).
 *
 *   base  = costo de envío por defecto (envio_config.base, ej. 3500)
 *   zonas = lista de zonas con su recargo sobre la base (envio_zonas)
 *
 * El costo final de un pedido = base + recargo de la zona elegida.
 * La web pública lee esta misma config (clave anon).
 */

export const DEFAULT_BASE_ENVIO = 3500

/** Lee la base del envío. Si la tabla no existe todavía, cae al default. */
export async function fetchBaseEnvio() {
  const { data, error } = await supabase
    .from('envio_config')
    .select('base, activo')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return DEFAULT_BASE_ENVIO
  return Math.max(0, Math.round(Number(data.base) || 0)) || DEFAULT_BASE_ENVIO
}

/** Lee las zonas activas, ordenadas. */
export async function fetchZonas({ soloActivas = true } = {}) {
  let query = supabase
    .from('envio_zonas')
    .select('id, nombre, recargo, activo, orden')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (soloActivas) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) return []
  return data || []
}

/** Lee base + zonas de una sola pasada. */
export async function fetchEnvioConfig({ soloActivas = true } = {}) {
  const [base, zonas] = await Promise.all([fetchBaseEnvio(), fetchZonas({ soloActivas })])
  return { base, zonas }
}

/** Costo total de envío para una zona (base + recargo). */
export function costoDeZona(base, zona) {
  const b = Math.max(0, Math.round(Number(base) || 0))
  const r = zona ? Math.max(0, Math.round(Number(zona.recargo) || 0)) : 0
  return b + r
}

/** Guarda la base del envío (solo admin). */
export async function guardarBaseEnvio(base) {
  const value = Math.max(0, Math.round(Number(base) || 0))
  return supabase
    .from('envio_config')
    .upsert({ id: 1, base: value, updated_at: new Date().toISOString() })
}

/** Crea una zona. */
export async function crearZona({ nombre, recargo, orden = 0 }) {
  return supabase.from('envio_zonas').insert({
    nombre: String(nombre || '').trim(),
    recargo: Math.max(0, Math.round(Number(recargo) || 0)),
    orden: Number(orden) || 0,
  })
}

/** Actualiza una zona. */
export async function actualizarZona(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() }
  if ('nombre' in clean) clean.nombre = String(clean.nombre || '').trim()
  if ('recargo' in clean) clean.recargo = Math.max(0, Math.round(Number(clean.recargo) || 0))
  return supabase.from('envio_zonas').update(clean).eq('id', id)
}

/** Elimina una zona. */
export async function eliminarZona(id) {
  return supabase.from('envio_zonas').delete().eq('id', id)
}
