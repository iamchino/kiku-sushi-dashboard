// Lecturas y escrituras de "la boleta con sus productos" y del reporte de
// faltantes. La lógica pura está en compras.js. Todo esto necesita la
// migración 20261114000000 (SQL 56): sin ella las lecturas devuelven
// `disponible: false` y las pantallas siguen como antes, sin romperse.
import { supabase } from './supabase'
import { filaFaltante, itemsParaGuardar, pagoParaRpc } from './compras'

function faltaEsquema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST204|PGRST205|42P01|42883|42703|schema cache|Could not find|does not exist/i.test(msg)
}

/**
 * Productos para armar una boleta: toda la materia prima, marcando los que
 * ya se le compraron a ese proveedor (con su último precio).
 * → { disponible, productos }
 */
export async function cargarProductosCompra(proveedorId = null) {
  const { data, error } = await supabase.rpc('compra_productos', { p_proveedor_id: proveedorId || null })
  if (error) {
    if (faltaEsquema(error)) return { disponible: false, productos: [] }
    throw new Error(error.message || 'No se pudieron leer los productos.')
  }
  return { disponible: true, productos: data || [] }
}

/** Los productos ya cargados en un pago. Sin el SQL 56 devuelve []. */
export async function cargarItemsDePago(egresoId) {
  if (!egresoId) return []
  const { data, error } = await supabase
    .from('compra_items')
    .select('id, egreso_id, stock_id, nombre, unidad, cantidad, precio_unitario, subtotal')
    .eq('egreso_id', egresoId)
    .order('nombre')
  if (error) return []
  return data || []
}

/**
 * Cuántos productos tiene cada pago de una lista: Map egreso_id → { n, total }.
 * Sirve para marcar en Pagos cuáles metieron mercadería al stock. Si algo
 * falla (SQL sin correr, sin permiso) devuelve un Map vacío: es un adorno.
 */
export async function contarItemsDePagos(egresoIds) {
  const mapa = new Map()
  const ids = [...new Set((egresoIds || []).filter(Boolean))]
  if (ids.length === 0) return mapa
  const { data, error } = await supabase
    .from('compra_items')
    .select('egreso_id, subtotal')
    .in('egreso_id', ids)
  if (error) return mapa
  for (const it of data || []) {
    const actual = mapa.get(it.egreso_id) || { n: 0, total: 0 }
    actual.n += 1
    actual.total += Number(it.subtotal) || 0
    mapa.set(it.egreso_id, actual)
  }
  return mapa
}

function mensajeDe(error) {
  const msg = error?.message || 'No se pudo guardar.'
  if (faltaEsquema(error)) {
    return 'Para cargar los productos de la boleta falta correr el SQL 56 en Supabase. El pago no se guardó.'
  }
  return msg
}

/** Pago nuevo + productos, todo o nada. Devuelve lo mismo que registrar_pago(). */
export async function registrarCompra(form, filas, permitirDiferencia = false) {
  const { data, error } = await supabase.rpc('registrar_compra', {
    p_pago: pagoParaRpc(form),
    p_items: itemsParaGuardar(filas),
    p_permitir_diferencia: Boolean(permitirDiferencia),
  })
  if (error) throw new Error(mensajeDe(error))
  return data
}

/** Corrige el pago y deja la boleta con exactamente esos productos. */
export async function editarCompra(pago, form, filas, motivo = null, permitirDiferencia = false) {
  const id = pago?.id || pago
  if (!id) throw new Error('Falta el pago a editar.')
  const { data, error } = await supabase.rpc('editar_compra', {
    p_egreso_id: id,
    p_pago: pagoParaRpc(form),
    p_items: itemsParaGuardar(filas),
    p_motivo: motivo?.trim() || null,
    p_permitir_diferencia: Boolean(permitirDiferencia),
  })
  if (error) throw new Error(mensajeDe(error))
  return data
}

/**
 * Reporte de faltantes del período [desde, hasta] (YYYY-MM-DD, inclusive).
 * → { disponible, filas } con las filas ya en números (filaFaltante).
 */
export async function cargarFaltantes(desde, hasta) {
  const { data, error } = await supabase.rpc('stock_faltantes', { p_desde: desde, p_hasta: hasta })
  if (error) {
    if (faltaEsquema(error)) return { disponible: false, filas: [] }
    throw new Error(error.message || 'No se pudo leer el reporte.')
  }
  return { disponible: true, filas: (data || []).map(filaFaltante) }
}
