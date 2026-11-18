import { supabase } from './supabase'

// Gastos fijos (SQL 60): la lista, el alta y la creación de los pendientes de
// cada mes. Sin el SQL 60 todo esto responde "no disponible" y las pantallas
// esconden la casilla y el botón.

let disponible = null              // null = no se sabe todavía
let generacion = { dia: null, promesa: null }

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ¿Corrió el SQL 60? Se pregunta una vez por sesión. */
export async function gastosFijosDisponibles() {
  if (disponible !== null) return disponible
  const { error } = await supabase.from('gastos_fijos').select('id').limit(1)
  disponible = !error
  return disponible
}

/** La lista, con el proveedor. { disponible, lista }. */
export async function cargarGastosFijos() {
  const { data, error } = await supabase
    .from('gastos_fijos')
    .select('*, proveedor:proveedores(razon_social)')
    .order('activo', { ascending: false })
    .order('dia_vencimiento', { ascending: true })
    .order('descripcion', { ascending: true })
  if (error) {
    if (disponible === null) disponible = false
    return { disponible: false, lista: [], error: error.message }
  }
  disponible = true
  return { disponible: true, lista: data || [] }
}

/** Alta (id null) o corrección. Devuelve la fila. */
export async function guardarGastoFijo(id, datos) {
  const { data, error } = await supabase.rpc('gasto_fijo_guardar', {
    p_id: id || null,
    p_descripcion: datos.descripcion,
    p_categoria: datos.categoria,
    p_monto: datos.monto,
    p_dia: datos.dia_vencimiento,
    p_medio_pago: datos.medio_pago,
    p_proveedor_id: datos.proveedor_id || null,
    p_notas: datos.notas || null,
    p_desde: datos.desde || null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function activarGastoFijo(id, activo) {
  const { data, error } = await supabase.rpc('gasto_fijo_activar', { p_id: id, p_activo: activo })
  if (error) throw new Error(error.message)
  return data
}

export async function borrarGastoFijo(id) {
  const { error } = await supabase.rpc('gasto_fijo_borrar', { p_id: id })
  if (error) throw new Error(error.message)
}

/** "Se repite todos los meses" en un pago recién cargado. */
export async function gastoFijoDesdePago(egresoId, dia, descripcion) {
  const { data, error } = await supabase.rpc('gasto_fijo_desde_pago', {
    p_egreso_id: egresoId,
    p_dia: dia || null,
    p_descripcion: descripcion || null,
  })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Crea los pendientes del mes que falten. Corre una vez por día y por
 * pestaña del navegador (las pantallas de Pagos y Finanzas la llaman antes de
 * leer los pagos); `forzar` la vuelve a correr (al cargar o cambiar un gasto
 * fijo). Nunca rompe la pantalla: sin el SQL 60, o con un error, devuelve 0.
 * @returns {Promise<{ creados: number, detalle: object[] }>}
 */
export function generarGastosFijosHoy({ forzar = false } = {}) {
  const dia = hoyLocal()
  if (!forzar && generacion.dia === dia && generacion.promesa) return generacion.promesa
  const promesa = (async () => {
    if (disponible === false) return { creados: 0, detalle: [] }
    const { data, error } = await supabase.rpc('generar_gastos_fijos')
    if (error) {
      // Sin el SQL 60 la función no existe: no se vuelve a intentar.
      if (/generar_gastos_fijos|function|schema cache|does not exist/i.test(error.message)) disponible = false
      return { creados: 0, detalle: [] }
    }
    return { creados: Number(data?.creados) || 0, detalle: data?.detalle || [] }
  })().catch(() => ({ creados: 0, detalle: [] }))
  generacion = { dia, promesa }
  return promesa
}

/** Para las pruebas: olvida lo que sabía de esta sesión. */
export function _reiniciarGastosFijos() {
  disponible = null
  generacion = { dia: null, promesa: null }
}
