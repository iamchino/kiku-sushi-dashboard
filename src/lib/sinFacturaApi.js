// Lecturas y escrituras de la marca "no se factura". La lógica pura está en
// sinFactura.js. Requiere la migración 20261116000000 (SQL 58): sin ella
// `disponible` vuelve false y Caja no ofrece la marca.
import { supabase } from './supabase'

function faltaEsquema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST205|42P01|42883|schema cache|Could not find|does not exist/i.test(msg)
}

const TANDA = 100   // ids por consulta: la URL no pasa de unos 4 KB

/**
 * Marcas de una lista de pedidos.
 * → { disponible, marcas: Map pedido_id → { motivo, usuario_nombre, created_at } }
 */
export async function cargarMarcasSinFactura(pedidoIds) {
  const marcas = new Map()
  const ids = [...new Set((pedidoIds || []).filter(Boolean))]
  // Sin pedidos igual se consulta (una fila, nada más) para saber si la base
  // ya tiene la tabla: de eso depende que se ofrezca el botón.
  const tandas = ids.length ? [] : [null]
  for (let i = 0; i < ids.length; i += TANDA) tandas.push(ids.slice(i, i + TANDA))
  for (const tanda of tandas) {
    let q = supabase.from('pedidos_sin_factura').select('pedido_id, motivo, usuario_nombre, created_at')
    q = tanda ? q.in('pedido_id', tanda) : q.limit(1)
    const { data, error } = await q
    if (error) {
      if (faltaEsquema(error)) return { disponible: false, marcas: new Map() }
      throw new Error(error.message || 'No se pudieron leer los pedidos marcados como "no se factura".')
    }
    if (tanda) for (const fila of data || []) marcas.set(fila.pedido_id, fila)
  }
  return { disponible: true, marcas }
}

function mensaje(error, porDefecto) {
  if (faltaEsquema(error)) return 'Falta correr el SQL 58 en Supabase para poder usar esta marca.'
  return error?.message || porDefecto
}

/** Marca un pedido como "no se factura". Devuelve la marca guardada. */
export async function marcarSinFactura(pedidoId, motivo) {
  const { data, error } = await supabase.rpc('pedido_marcar_sin_factura', { p_pedido_id: pedidoId, p_motivo: motivo })
  if (error) throw new Error(mensaje(error, 'No se pudo marcar el pedido.'))
  return Array.isArray(data) ? data[0] : data
}

/** Saca la marca: el pedido vuelve a Pendientes de facturación. */
export async function desmarcarSinFactura(pedidoId) {
  const { error } = await supabase.rpc('pedido_desmarcar_sin_factura', { p_pedido_id: pedidoId })
  if (error) throw new Error(mensaje(error, 'No se pudo sacar la marca.'))
}
