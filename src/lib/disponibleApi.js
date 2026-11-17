import { supabase } from './supabase'
import { isMissingSchema, resumenDeTurno } from '../hooks/useCajaArqueo'

// Datos del recuadro "Disponible hoy" (Finanzas → Resumen). Cada parte se pide
// por separado y ninguna frena a las otras: si falla la caja, igual se ven la
// caja fuerte y los bancos. La cuenta de cada caja NO se rehace acá: se usa la
// misma del arqueo (resumenDeTurno) y las mismas RPC de siempre.

/**
 * Caja del día. Con turno abierto, el efectivo esperado (igual que en Arqueo);
 * con la caja cerrada, lo que quedó en el cajón del último cierre.
 * `ver` = el usuario ve Caja. Sin ese permiso el RLS devuelve cero filas —sin
 * error— y parecería que la caja está vacía: por eso ni se consulta.
 */
export async function cargarCajaDelDia(ver = true) {
  if (!ver) return { visible: false }
  const turnoRes = await supabase
    .from('caja_turnos').select('*')
    .eq('estado', 'abierto')
    .order('apertura_at', { ascending: false })
    .limit(1).maybeSingle()
  if (turnoRes.error) return { visible: false }
  const turno = turnoRes.data

  if (turno) {
    // Lo vinculado al turno + lo cargado desde la apertura sin vínculo (el
    // arqueo cuenta las dos cosas).
    const [movTurno, movFecha, pagTurno, pagFecha] = await Promise.all([
      supabase.from('caja_movimientos').select('*').eq('turno_id', turno.id),
      supabase.from('caja_movimientos').select('*').gte('created_at', turno.apertura_at),
      supabase.from('pagos_arqueo').select('*').eq('caja_turno_id', turno.id),
      supabase.from('pagos_arqueo').select('*').gte('created_at', turno.apertura_at),
    ])
    if (movTurno.error || pagTurno.error) return { visible: false }
    const unir = (a, b) => [...new Map([...(a.data || []), ...(b.error ? [] : (b.data || []))].map(r => [r.id, r])).values()]
    const resumen = resumenDeTurno(turno, unir(pagTurno, pagFecha), unir(movTurno, movFecha))
    return { visible: true, abierta: true, monto: resumen.efectivoEsperado, fecha: turno.business_date }
  }

  // Caja cerrada: el efectivo contado al cerrar menos lo que después se guardó
  // en la caja fuerte. Lo calcula la base (security definer).
  const { data, error } = await supabase.rpc('apertura_sugerida')
  if (error) return { visible: true, abierta: false, monto: null, fecha: null }
  return { visible: true, abierta: false, monto: data ? Number(data.monto || 0) : 0, fecha: data?.fecha || null }
}

/** Saldo de la caja fuerte. `ver` = el usuario ve la caja fuerte. */
export async function cargarSaldoCajaFuerte(ver = true) {
  if (!ver) return { visible: false }
  const { data, error } = await supabase.rpc('saldo_caja_fuerte')
  if (error) return { visible: false }
  return { visible: true, saldo: Number(data ?? 0) }
}

/**
 * Último saldo informado de cada cuenta del negocio.
 * { disponible: false } = falta correr el SQL 59.
 */
export async function cargarSaldosDeCuentas() {
  const { data, error } = await supabase.rpc('cuentas_negocio_saldos_vigentes')
  if (error) {
    if (isMissingSchema(error)) return { disponible: false, filas: [] }
    throw new Error(error.message || 'No se pudieron leer los saldos de las cuentas.')
  }
  return { disponible: true, filas: data || [] }
}

/** Todo junto, para el recuadro. */
export async function cargarDisponible({ verCaja = true, verCajaFuerte = true } = {}) {
  const [caja, cajaFuerte, cuentas] = await Promise.all([
    cargarCajaDelDia(verCaja).catch(() => ({ visible: false })),
    cargarSaldoCajaFuerte(verCajaFuerte).catch(() => ({ visible: false })),
    cargarSaldosDeCuentas().catch(() => ({ disponible: true, filas: [], error: true })),
  ])
  return { caja, cajaFuerte, cuentas }
}

/** Guarda el saldo de una cuenta tal como figura en el banco. */
export async function informarSaldoDeCuenta({ cuentaId, saldo, fecha, nota }) {
  const { data, error } = await supabase.rpc('cuenta_negocio_informar_saldo', {
    p_cuenta_id: cuentaId,
    p_saldo: saldo,
    p_fecha: fecha || null,
    p_nota: nota || null,
  })
  if (error) {
    if (isMissingSchema(error)) throw new Error('Para cargar saldos falta correr el SQL 59 en Supabase.')
    throw new Error(error.message || 'No se pudo guardar el saldo.')
  }
  return data
}
