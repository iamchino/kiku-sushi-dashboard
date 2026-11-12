// Lecturas y escrituras del cash flow mensual. La lógica pura está en
// cashflow.js. Requiere la migración 20261113000000 (SQL 55): sin ella
// `faltaMigracion` vuelve true y la pantalla lo avisa.
import { supabase } from './supabase'
import { finDeMes, mesDe } from './cashflow'

function faltaEsquema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST205|42P01|42883|schema cache|Could not find|does not exist/i.test(msg)
}

/**
 * Todo lo que necesita la tabla para el rango [desde, hasta] (meses):
 *   filas      → real y pendiente por mes y categoría, ya sumado en la base
 *   estimados  → lo que cargó administración
 *   config     → saldo inicial / desde / mínimo (o null)
 */
export async function cargarCashflow(desde, hasta) {
  const [filasRes, estRes, cfgRes] = await Promise.all([
    supabase.rpc('cashflow_mensual', { p_desde: desde, p_hasta: hasta }),
    supabase.from('cashflow_estimados').select('mes, concepto, monto').gte('mes', desde).lte('mes', hasta),
    supabase.from('cashflow_config').select('saldo_inicial, saldo_desde, saldo_minimo').limit(1),
  ])
  const primerError = filasRes.error || estRes.error || cfgRes.error
  if (primerError) {
    if (faltaEsquema(primerError)) return { filas: [], estimados: [], config: null, faltaMigracion: true }
    throw new Error(primerError.message || 'No se pudo leer el cash flow.')
  }
  return {
    filas: filasRes.data || [],
    estimados: estRes.data || [],
    config: cfgRes.data?.[0] || null,
    faltaMigracion: false,
  }
}

/** Solo la configuración (para saber desde qué mes hay que traer datos). */
export async function cargarConfigCashflow() {
  const { data, error } = await supabase
    .from('cashflow_config').select('saldo_inicial, saldo_desde, saldo_minimo').limit(1)
  if (error) {
    if (faltaEsquema(error)) return { config: null, faltaMigracion: true }
    throw new Error(error.message)
  }
  return { config: data?.[0] || null, faltaMigracion: false }
}

/** items = [{ mes, concepto, monto }] — monto null borra ese estimado. */
export async function guardarEstimados(items) {
  if (!items?.length) return 0
  const limpio = items.map(i => ({
    mes: mesDe(i.mes),
    concepto: i.concepto,
    monto: i.monto === null || i.monto === undefined || i.monto === '' ? null : Math.max(0, Math.round(Number(i.monto))),
  }))
  const { data, error } = await supabase.rpc('cashflow_guardar_estimados', { p_items: limpio })
  if (error) {
    if (/row-level security/i.test(error.message || '')) {
      throw new Error('Tu usuario no tiene permiso para editar el cash flow (hace falta Finanzas con edición).')
    }
    throw new Error(error.message || 'No se pudieron guardar los estimados.')
  }
  return Number(data || 0)
}

export async function guardarConfigCashflow({ saldo_inicial, saldo_desde, saldo_minimo }) {
  const { error } = await supabase.rpc('cashflow_guardar_config', {
    p_saldo_inicial: Number(saldo_inicial || 0),
    p_saldo_desde: saldo_desde ? mesDe(saldo_desde) : null,
    p_saldo_minimo: Math.max(0, Number(saldo_minimo || 0)),
  })
  if (error) {
    if (/row-level security/i.test(error.message || '')) {
      throw new Error('Tu usuario no tiene permiso para editar el cash flow (hace falta Finanzas con edición).')
    }
    throw new Error(error.message || 'No se pudo guardar.')
  }
}

const SELECT_DETALLE = 'id, fecha, vencimiento, estado, categoria, descripcion, monto, proveedor:proveedores(razon_social)'

/**
 * Los pagos que componen una celda: los pagados en ese mes y los pendientes
 * que vencen en él. En el mes en curso entran también los vencidos impagos
 * (igual que en la tabla).
 */
export async function cargarDetalleCelda({ categorias, mes, esMesEnCurso }) {
  const hasta = finDeMes(mes)
  const pagadosQ = supabase.from('egresos').select(SELECT_DETALLE)
    .eq('estado', 'pagado').in('categoria', categorias)
    .gte('fecha', mes).lte('fecha', hasta)
    .order('fecha', { ascending: true }).limit(300)
  let pendientesQ = supabase.from('egresos').select(SELECT_DETALLE)
    .eq('estado', 'pendiente').in('categoria', categorias)
    .lte('vencimiento', hasta)
    .order('vencimiento', { ascending: true }).limit(300)
  if (!esMesEnCurso) pendientesQ = pendientesQ.gte('vencimiento', mes)
  const [pagados, pendientes] = await Promise.all([pagadosQ, pendientesQ])
  if (pagados.error) throw new Error(pagados.error.message)
  if (pendientes.error) throw new Error(pendientes.error.message)
  return { pagados: pagados.data || [], pendientes: pendientes.data || [] }
}
