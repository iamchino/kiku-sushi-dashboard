// Lecturas de la base para las cuentas corrientes (canjes). La lógica pura
// está en cuentasCorrientes.js.
//
// Todo lo de acá tolera que la migración 20261112000000 todavía no esté
// aplicada: sin ella no hay cuentas y el medio simplemente no se ofrece.
import { supabase } from './supabase'
import {
  MEDIO_CUENTA_CORRIENTE, faltaMigracionCuentas, normalizarCuenta, problemaCuentaCorriente,
} from './cuentasCorrientes'

/**
 * Cuentas activas con su saldo, para el selector de cobro. La devuelve una
 * función de la base (la caja no ve la sección Cuentas corrientes). Si la
 * migración no corrió o el usuario no cobra, devuelve [].
 */
export async function cargarCuentasParaCobro() {
  const { data, error } = await supabase.rpc('cuentas_corrientes_para_cobro')
  if (error) {
    if (faltaMigracionCuentas(error)) return []
    throw new Error(error.message || 'No se pudieron leer las cuentas corrientes.')
  }
  return (data || []).map(normalizarCuenta)
}

/**
 * Validación con datos frescos de la base, para correr justo antes de cobrar
 * (y antes de facturar): saldos al momento y lo que este pedido ya tenía
 * cargado. Sin líneas a cuenta corriente no consulta nada.
 */
export async function validarCobroCuentaCorriente(pedidoId, pagos = []) {
  if (!pagos.some(p => p.medio_pago === MEDIO_CUENTA_CORRIENTE)) return null
  const cuentas = await cargarCuentasParaCobro()
  let previos = []
  if (pedidoId) {
    const { data, error } = await supabase
      .from('pagos')
      .select('monto, cuenta_corriente_id')
      .eq('pedido_id', pedidoId)
      .eq('medio_pago', MEDIO_CUENTA_CORRIENTE)
    if (!error) previos = data || []
  }
  return problemaCuentaCorriente(pagos, cuentas, previos)
}

// ─── Lecturas para Caja y el reporte contable ───────────────────────────────
// Solo devuelven datos a quien tiene la sección Cuentas corrientes (RLS). Para
// el resto —o si la migración no corrió— quedan vacías y nadie se entera.

/** Map pago_id → nombre de la cuenta, para mostrar a quién se cargó cada cobro. */
export async function cargarCuentasDePagos(pagoIds = []) {
  const ids = [...new Set(pagoIds.filter(Boolean))]
  const mapa = new Map()
  if (ids.length === 0) return mapa
  // De a tandas: un .in() con cientos de uuids no entra en la URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('cuenta_corriente_movimientos')
      .select('pago_id, cuenta:cuentas_corrientes(nombre)')
      .in('pago_id', ids.slice(i, i + 100))
    if (error) return mapa
    ;(data || []).forEach(m => { if (m.cuenta?.nombre) mapa.set(m.pago_id, m.cuenta.nombre) })
  }
  return mapa
}

/**
 * Estado de todas las cuentas + sus movimientos del período, para el Excel de
 * los contadores. { cuentas: [...saldos], movimientos: [...del período] }.
 */
export async function cargarEstadoCuentas(desde, hasta) {
  const vacio = { cuentas: [], movimientos: [] }
  const cuentasRes = await supabase
    .from('cuentas_corrientes_saldos')
    .select('*')
    .order('nombre', { ascending: true })
  if (cuentasRes.error) return vacio
  const cuentas = (cuentasRes.data || []).map(normalizarCuenta)
  if (cuentas.length === 0) return vacio

  let consulta = supabase
    .from('cuenta_corriente_movimientos')
    .select('id, cuenta_id, fecha, detalle, numero_operacion, monto, pedido_id, pago_id, created_at')
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true })
  if (desde) consulta = consulta.gte('fecha', desde)
  if (hasta) consulta = consulta.lte('fecha', hasta)
  const movsRes = await consulta
  return { cuentas, movimientos: movsRes.error ? [] : (movsRes.data || []) }
}
