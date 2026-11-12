import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { borrarFila } from '../lib/borrar'
import { faltaMigracionCuentas } from '../lib/cuentasCorrientes'
import { parseCurrencyValue } from '../lib/orders'

// Datos de la sección Dinero → Cuentas corrientes.
//
//   cuentas      → vista cuentas_corrientes_saldos (cuenta + consumido + saldo)
//   movimientos  → cuenta_corriente_movimientos de la cuenta seleccionada
//
// Los movimientos que vienen de un cobro (pago_id) son de solo lectura: los
// mantiene un trigger de la base. Acá solo se cargan, editan y borran los
// manuales.

const limpio = (v) => {
  const t = String(v ?? '').trim()
  return t === '' ? null : t
}

function normalizar(c) {
  return {
    ...c,
    monto_acordado: Number(c.monto_acordado || 0),
    consumido: Number(c.consumido || 0),
    saldo: Number(c.saldo || 0),
    movimientos: Number(c.movimientos || 0),
  }
}

function errorLegible(error, queEs) {
  const msg = String(error?.message || error || '')
  if (/cuentas_corrientes_nombre_unico/.test(msg)) return 'Ya hay una cuenta con ese nombre.'
  if (/cuentas_corrientes_cuit_check/.test(msg)) return 'El CUIT tiene que tener 11 números, sin guiones.'
  if (/cuentas_corrientes_vigencia_check/.test(msg)) return 'La vigencia "hasta" no puede ser anterior a "desde".'
  if (/foreign key|violates/.test(msg) && /movimientos|pagos/.test(msg)) {
    return 'La cuenta ya tiene consumos cargados, así que no se puede borrar. Desactivala: deja de ofrecerse al cobrar y el historial queda.'
  }
  if (/row-level security/i.test(msg)) return `Tu usuario no tiene permiso para ${queEs}.`
  return msg || `No se pudo ${queEs}.`
}

export function useCuentasCorrientes() {
  const [cuentas, setCuentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [faltaMigracion, setFaltaMigracion] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('cuentas_corrientes_saldos')
      .select('*')
      .order('nombre', { ascending: true })
    if (err) {
      setFaltaMigracion(faltaMigracionCuentas(err))
      setError(err.message)
      setCuentas([])
    } else {
      setFaltaMigracion(false)
      setError(null)
      setCuentas((data || []).map(normalizar))
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cargarMovimientos = useCallback(async (cuentaId) => {
    if (!cuentaId) return []
    const { data, error: err } = await supabase
      .from('cuenta_corriente_movimientos')
      .select('id, cuenta_id, fecha, detalle, numero_operacion, monto, pedido_id, pago_id, created_at')
      .eq('cuenta_id', cuentaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) throw new Error(err.message)
    return data || []
  }, [])

  /** Alta (sin id) o edición (con id) de una cuenta. */
  const guardarCuenta = useCallback(async (form, id = null) => {
    const fila = {
      nombre: String(form.nombre || '').trim(),
      monto_acordado: Math.max(0, parseCurrencyValue(form.monto_acordado)),
      vigencia_desde: limpio(form.vigencia_desde),
      vigencia_hasta: limpio(form.vigencia_hasta),
      notas: limpio(form.notas),
      razon_social: limpio(form.razon_social),
      cuit: limpio(String(form.cuit || '').replace(/\D/g, '')),
      condicion_iva: form.condicion_iva ? Number(form.condicion_iva) : null,
      domicilio: limpio(form.domicilio),
      activa: form.activa !== false,
    }
    const consulta = id
      ? supabase.from('cuentas_corrientes').update(fila).eq('id', id).select('id')
      : supabase.from('cuentas_corrientes').insert(fila).select('id')
    const { data, error: err } = await consulta
    if (err) throw new Error(errorLegible(err, 'guardar la cuenta'))
    // RLS no da error cuando bloquea un update: actualiza cero filas.
    if (!data || data.length === 0) throw new Error('No se guardó: tu usuario no tiene permiso para editar cuentas corrientes.')
    await cargar()
    return data[0].id
  }, [cargar])

  const cambiarActiva = useCallback(async (id, activa) => {
    const { data, error: err } = await supabase
      .from('cuentas_corrientes').update({ activa }).eq('id', id).select('id')
    if (err) throw new Error(errorLegible(err, 'cambiar el estado de la cuenta'))
    if (!data || data.length === 0) throw new Error('No se guardó: tu usuario no tiene permiso para editar cuentas corrientes.')
    await cargar()
  }, [cargar])

  const borrarCuenta = useCallback(async (id) => {
    try {
      await borrarFila('cuentas_corrientes', id, 'la cuenta')
    } catch (err) {
      throw new Error(errorLegible(err, 'borrar la cuenta'), { cause: err })
    }
    await cargar()
  }, [cargar])

  /**
   * Alta o edición de un movimiento manual. `form.monto` siempre en positivo;
   * `form.tipo` = 'consumo' (baja el saldo) o 'devolucion' (lo sube).
   */
  const guardarMovimiento = useCallback(async (cuentaId, form, id = null) => {
    const valor = Math.abs(parseCurrencyValue(form.monto))
    if (!(valor > 0)) throw new Error('Ingresá un monto mayor a cero.')
    const fila = {
      cuenta_id: cuentaId,
      fecha: form.fecha,
      detalle: limpio(form.detalle),
      numero_operacion: limpio(form.numero_operacion),
      monto: form.tipo === 'devolucion' ? -valor : valor,
    }
    const consulta = id
      ? supabase.from('cuenta_corriente_movimientos').update(fila).eq('id', id).select('id')
      : supabase.from('cuenta_corriente_movimientos').insert(fila).select('id')
    const { data, error: err } = await consulta
    if (err) throw new Error(errorLegible(err, 'guardar el consumo'))
    if (!data || data.length === 0) {
      throw new Error('No se guardó. Si el consumo viene de un cobro de caja se corrige desde Caja, no acá; si no, a tu usuario le falta permiso de edición.')
    }
    await cargar()
  }, [cargar])

  const borrarMovimiento = useCallback(async (id) => {
    try {
      await borrarFila('cuenta_corriente_movimientos', id, 'el consumo')
    } catch (err) {
      throw new Error(errorLegible(err, 'borrar el consumo'), { cause: err })
    }
    await cargar()
  }, [cargar])

  return {
    cuentas, loading, error, faltaMigracion,
    recargar: cargar, cargarMovimientos,
    guardarCuenta, cambiarActiva, borrarCuenta,
    guardarMovimiento, borrarMovimiento,
  }
}
