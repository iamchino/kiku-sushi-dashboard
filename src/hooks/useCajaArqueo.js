import { useCallback, useEffect, useMemo, useState } from 'react'
import { endOfDay, startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'

// Medios cobrados (provienen de la tabla pagos). Se usan en la conciliacion
// y en el cierre por medio.
export const MEDIOS_ARQUEO = [
  { id: 'efectivo', label: 'Efectivo', short: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia', short: 'Transfer.' },
  { id: 'tarjeta_debito', label: 'Tarjeta debito', short: 'Debito' },
  { id: 'tarjeta_credito', label: 'Tarjeta credito', short: 'Credito' },
]

// Medios disponibles al registrar un movimiento manual. Incluye nota de credito
// (cuando queda saldo a favor de algun egreso), que no existe como pago.
export const MEDIOS_MOVIMIENTO = [
  { id: 'efectivo', label: 'Efectivo', short: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia', short: 'Transfer.' },
  { id: 'tarjeta_debito', label: 'Tarjeta debito', short: 'Debito' },
  { id: 'tarjeta_credito', label: 'Tarjeta credito', short: 'Credito' },
  { id: 'nota_credito', label: 'Nota de credito', short: 'NC' },
]

export const TIPOS_MOVIMIENTO_CAJA = [
  { id: 'ingreso', label: 'Ingreso', short: 'Ingreso', sign: 1 },
  { id: 'egreso', label: 'Egreso', short: 'Egreso', sign: -1 },
  { id: 'ajuste', label: 'Ajuste', short: 'Ajuste', sign: 1 },
]

const NEGATIVE_TYPES = new Set(['egreso'])

function parseAmount(value) {
  const cleaned = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function toRange(dateFrom, dateTo) {
  const from = dateFrom
    ? startOfDay(new Date(`${dateFrom}T00:00:00`))
    : startOfDay(new Date())
  const to = dateTo
    ? endOfDay(new Date(`${dateTo}T00:00:00`))
    : endOfDay(new Date())
  return { start: from.toISOString(), end: to.toISOString() }
}

function isMissingSchema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST205|42P01|42703|schema cache|Could not find|does not exist|column .* not found/i.test(msg)
}

function isInsideTurn(row, turno) {
  if (!turno || !row?.created_at) return false
  const created = new Date(row.created_at).getTime()
  const start = new Date(turno.apertura_at).getTime()
  const end = turno.cierre_at ? new Date(turno.cierre_at).getTime() : Date.now() + 60000
  return created >= start && created <= end
}

function belongsToTurn(row, turno, fieldName) {
  if (!turno || !row) return false
  if (row[fieldName]) return row[fieldName] === turno.id
  return isInsideTurn(row, turno)
}

function movimientoSign(movimiento) {
  if (!movimiento) return 0
  if (movimiento.tipo === 'ajuste') {
    return movimiento.categoria === 'faltante' ? -1 : 1
  }
  return NEGATIVE_TYPES.has(movimiento.tipo) ? -1 : 1
}

function sum(rows, pick) {
  return rows.reduce((acc, row) => acc + Number(pick(row) || 0), 0)
}

/**
 * Calcula el desglose por medio (ventas, movimientos, apertura, esperado) de UN
 * turno cualquiera a partir de los pagos y movimientos cargados. Reutilizable
 * tanto para el turno activo como para un turno reabierto que se está editando.
 */
function resumenDeTurno(turno, pagos, movimientos) {
  const pagosTurno = turno
    ? pagos.filter(pago => belongsToTurn(pago, turno, 'caja_turno_id'))
    : []
  const movimientosTurno = turno
    ? movimientos.filter(mov => belongsToTurn(mov, turno, 'turno_id'))
    : []

  const apertura = Number(turno?.apertura_monto || 0)

  const esperadoPorMedio = MEDIOS_ARQUEO.map(medio => {
    const ventasRows = pagosTurno.filter(pago => pago.medio_pago === medio.id)
    const movsRows = movimientosTurno.filter(mov => (mov.medio_pago || 'efectivo') === medio.id)
    const ventas = sum(ventasRows, row => row.monto)
    const movs = movsRows.reduce((acc, mov) => (
      acc + movimientoSign(mov) * Number(mov.monto || 0)
    ), 0)
    const aperturaMedio = medio.id === 'efectivo' ? apertura : 0
    return {
      ...medio,
      ventas,
      movimientos: movs,
      apertura: aperturaMedio,
      cantidad: ventasRows.length,
      esperado: aperturaMedio + ventas + movs,
    }
  })

  const ventasPorMedio = esperadoPorMedio.map(medio => ({
    id: medio.id,
    label: medio.label,
    short: medio.short,
    total: medio.ventas,
    cantidad: medio.cantidad,
  }))

  return {
    pagosTurno,
    movimientosTurno,
    apertura,
    esperadoPorMedio,
    ventasPorMedio,
    efectivoEsperado: esperadoPorMedio.find(medio => medio.id === 'efectivo')?.esperado || apertura,
    totalEsperado: sum(esperadoPorMedio, medio => medio.esperado),
  }
}

export function useCajaArqueo({ dateFrom = null, dateTo = null } = {}) {
  const [turnoActual, setTurnoActual] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [pagos, setPagos] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [auditoria, setAuditoria] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [setupWarning, setSetupWarning] = useState(null)

  const range = useMemo(() => toRange(dateFrom, dateTo), [dateFrom, dateTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSetupWarning(null)

    try {
      const openTurnoRes = await supabase
        .from('caja_turnos')
        .select('*')
        .eq('estado', 'abierto')
        .order('apertura_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let openTurno = openTurnoRes.data || null
      if (openTurnoRes.error) {
        openTurno = null
        if (isMissingSchema(openTurnoRes.error)) {
          setSetupWarning('Falta ejecutar la migracion de arqueo de caja en Supabase.')
        } else {
          setError(openTurnoRes.error.message)
        }
      }

      const effectiveStart = openTurno?.apertura_at && new Date(openTurno.apertura_at) < new Date(range.start)
        ? openTurno.apertura_at
        : range.start

      const [turnosRes, movimientosRes, pagosRes, pedidosRes] = await Promise.all([
        supabase
          .from('caja_turnos')
          .select('*')
          .gte('apertura_at', effectiveStart)
          .lte('apertura_at', range.end)
          .order('apertura_at', { ascending: false }),
        supabase
          .from('caja_movimientos')
          .select('*')
          .gte('created_at', effectiveStart)
          .lte('created_at', range.end)
          .order('created_at', { ascending: false }),
        supabase
          .from('pagos_arqueo')
          .select('*')
          .gte('created_at', effectiveStart)
          .lte('created_at', range.end)
          .order('created_at', { ascending: false }),
        supabase
          .from('pedidos')
          .select('id, mesa, canal, estado, total, created_at, afecta_caja')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at', { ascending: false }),
      ])

      // Si falta la columna afecta_caja (migración no aplicada), reintentamos
      // el query de pedidos sin esa columna para no romper el arqueo.
      if (pedidosRes.error && /afecta_caja/i.test(pedidosRes.error.message || '')) {
        const retryPedidos = await supabase
          .from('pedidos')
          .select('id, mesa, canal, estado, total, created_at')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at', { ascending: false })
        pedidosRes.data = retryPedidos.data
        pedidosRes.error = retryPedidos.error
      }

      if (turnosRes.error && !isMissingSchema(turnosRes.error)) setError(turnosRes.error.message)
      if (movimientosRes.error && !isMissingSchema(movimientosRes.error)) setError(movimientosRes.error.message)
      if (pagosRes.error && !isMissingSchema(pagosRes.error)) setError(pagosRes.error.message)
      if (pedidosRes.error) setError(pedidosRes.error.message)

      if ((turnosRes.error && isMissingSchema(turnosRes.error))
        || (movimientosRes.error && isMissingSchema(movimientosRes.error))) {
        setSetupWarning('Falta ejecutar la migracion de arqueo de caja en Supabase.')
      }

      // Turnos REABIERTOS: pueden ser de una fecha fuera del rango actual.
      // Los traemos siempre (junto con sus movimientos y pagos) para poder
      // editarlos aunque el usuario esté viendo otro rango de fechas.
      let turnosList = turnosRes.data || []
      let movimientosList = movimientosRes.data || []
      let pagosList = pagosRes.data || []

      const reabiertosRes = await supabase
        .from('caja_turnos')
        .select('*')
        .eq('estado', 'reabierto')
        .order('apertura_at', { ascending: false })

      if (reabiertosRes.error && !isMissingSchema(reabiertosRes.error)) {
        setError(reabiertosRes.error.message)
      }

      const reabiertos = reabiertosRes.data || []
      const reabiertosFueraDeRango = reabiertos.filter(
        t => !turnosList.some(x => x.id === t.id),
      )

      if (reabiertosFueraDeRango.length > 0) {
        turnosList = [...reabiertosFueraDeRango, ...turnosList]
        const ids = reabiertosFueraDeRango.map(t => t.id)

        const [movExtra, pagExtra] = await Promise.all([
          supabase.from('caja_movimientos').select('*').in('turno_id', ids),
          supabase.from('pagos_arqueo').select('*').in('caja_turno_id', ids),
        ])

        const movById = new Map(movimientosList.map(m => [m.id, m]))
        ;(movExtra.data || []).forEach(m => movById.set(m.id, m))
        movimientosList = [...movById.values()]

        const pagById = new Map(pagosList.map(p => [p.id, p]))
        ;(pagExtra.data || []).forEach(p => pagById.set(p.id, p))
        pagosList = [...pagById.values()]
      }

      setTurnoActual(openTurno)
      setTurnos(turnosList)
      setMovimientos(movimientosList)
      setPagos(pagosList)
      setPedidos(pedidosRes.data || [])

      // Auditoría de los turnos visibles (puede no existir si falta la migración).
      const turnoIds = turnosList.map(t => t.id)
      if (turnoIds.length > 0) {
        const auditoriaRes = await supabase
          .from('caja_turnos_auditoria')
          .select('*')
          .in('turno_id', turnoIds)
          .order('created_at', { ascending: false })
        if (auditoriaRes.error) {
          if (!isMissingSchema(auditoriaRes.error)) setError(auditoriaRes.error.message)
          setAuditoria([])
        } else {
          setAuditoria(auditoriaRes.data || [])
        }
      } else {
        setAuditoria([])
      }
    } catch (err) {
      setError(err.message || 'No se pudo cargar arqueo de caja.')
    } finally {
      setLoading(false)
    }
  }, [range.end, range.start])

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`caja-arqueo-${dateFrom || 'hoy'}-${dateTo || 'hoy'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_turnos' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_movimientos' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_turnos_auditoria' }, fetchData)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [dateFrom, dateTo, fetchData])

  const resumen = useMemo(() => {
    const base = resumenDeTurno(turnoActual, pagos, movimientos)
    const { pagosTurno, movimientosTurno, apertura, esperadoPorMedio, ventasPorMedio } = base

    const pagosEfectivo = ventasPorMedio.find(medio => medio.id === 'efectivo')?.total || 0
    const movimientosFirmados = movimientosTurno.reduce((acc, mov) => (
      acc + movimientoSign(mov) * Number(mov.monto || 0)
    ), 0)
    const movimientosIngresos = sum(
      movimientosTurno.filter(mov => movimientoSign(mov) > 0),
      mov => mov.monto,
    )
    const movimientosEgresos = sum(
      movimientosTurno.filter(mov => movimientoSign(mov) < 0),
      mov => mov.monto,
    )
    const efectivoEsperado = esperadoPorMedio.find(medio => medio.id === 'efectivo')?.esperado || apertura
    const totalEsperado = sum(esperadoPorMedio, medio => medio.esperado)
    const pagosByPedido = new Set(pagos.map(pago => pago.pedido_id).filter(Boolean))
    // Excluimos cancelados y las órdenes marcadas como "no afecta caja"
    // (cobradas fuera del turno): no deben figurar como pedidos sin pago.
    const pedidosValidos = pedidos.filter(
      pedido => pedido.estado !== 'cancelado' && pedido.afecta_caja !== false,
    )
    const pedidosSinPago = pedidosValidos.filter(pedido => !pagosByPedido.has(pedido.id))
    const pagosSinTurno = pagos.filter(pago => !pago.caja_turno_id)

    return {
      pagosTurno,
      movimientosTurno,
      ventasPorMedio,
      esperadoPorMedio,
      apertura,
      pagosEfectivo,
      ventasTotal: sum(pagosTurno, row => row.monto),
      movimientosIngresos,
      movimientosEgresos,
      movimientosNeto: movimientosFirmados,
      efectivoEsperado,
      totalEsperado,
      pedidosSinPago,
      pedidosSinPagoTotal: sum(pedidosSinPago, pedido => pedido.total),
      pagosSinTurno,
    }
  }, [movimientos, pagos, pedidos, turnoActual])

  const abrirTurno = useCallback(async ({
    caja_nombre = 'Caja principal',
    business_date,
    apertura_monto,
    notas_apertura,
    denominaciones_apertura = {},
  }) => {
    const { error: insertError } = await supabase
      .from('caja_turnos')
      .insert({
        caja_nombre: caja_nombre || 'Caja principal',
        business_date,
        apertura_monto: parseAmount(apertura_monto),
        notas_apertura: notas_apertura || null,
        denominaciones_apertura,
      })

    if (insertError) throw insertError
    await fetchData()
  }, [fetchData])

  const registrarMovimiento = useCallback(async ({
    turno_id,
    tipo,
    medio_pago = 'efectivo',
    monto,
    categoria,
    descripcion,
  }) => {
    if (!turno_id) throw new Error('Primero hay que abrir un turno de caja.')
    const amount = parseAmount(monto)

    const { error: insertError } = await supabase
      .from('caja_movimientos')
      .insert({
        turno_id,
        tipo,
        medio_pago,
        monto: amount,
        categoria: categoria || null,
        descripcion: descripcion || TIPOS_MOVIMIENTO_CAJA.find(item => item.id === tipo)?.label || 'Movimiento de caja',
      })

    if (insertError) throw insertError
    await fetchData()
  }, [fetchData])

  const cerrarTurno = useCallback(async ({
    turno_id,
    contado_por_medio = {},
    esperado_por_medio = {},
    notas_cierre,
  }) => {
    if (!turno_id) throw new Error('No hay turno abierto para cerrar.')

    // Total contado y esperado sumando TODOS los medios (no solo efectivo).
    const counted = MEDIOS_ARQUEO.reduce(
      (acc, medio) => acc + parseAmount(contado_por_medio[medio.id]), 0,
    )
    const expected = MEDIOS_ARQUEO.reduce(
      (acc, medio) => acc + parseAmount(esperado_por_medio[medio.id]), 0,
    )

    // Detalle por medio guardado en el jsonb de cierre.
    const detalleMedios = {}
    MEDIOS_ARQUEO.forEach(medio => {
      detalleMedios[medio.id] = {
        esperado: parseAmount(esperado_por_medio[medio.id]),
        contado: parseAmount(contado_por_medio[medio.id]),
      }
    })

    const { error: updateError } = await supabase
      .from('caja_turnos')
      .update({
        estado: 'cerrado',
        cierre_monto: counted,
        efectivo_esperado: expected,
        diferencia: counted - expected,
        notas_cierre: notas_cierre || null,
        denominaciones_cierre: { medios: detalleMedios },
        cierre_at: new Date().toISOString(),
        cierre_usuario_id: (await supabase.auth.getUser()).data?.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', turno_id)

    if (updateError) throw updateError
    await fetchData()
  }, [fetchData])

  const vincularPagosAlTurno = useCallback(async () => {
    if (!turnoActual?.id) throw new Error('No hay turno abierto.')
    const { error: updateError } = await supabase
      .from('pagos')
      .update({ caja_turno_id: turnoActual.id })
      .is('caja_turno_id', null)
      .gte('created_at', turnoActual.apertura_at)
      .lte('created_at', new Date().toISOString())

    if (updateError) throw updateError
    await fetchData()
  }, [fetchData, turnoActual])

  /**
   * Adjudica pagos puntuales (por id) al turno abierto. A diferencia de
   * vincularPagosAlTurno, NO filtra por fecha: sirve para enganchar pedidos
   * que se cobraron ANTES de abrir el turno (cuando no había ninguno abierto).
   * Recibe un id o un array de ids.
   */
  const asignarPagosAlTurno = useCallback(async (pagoIds) => {
    if (!turnoActual?.id) throw new Error('No hay turno abierto.')
    const ids = (Array.isArray(pagoIds) ? pagoIds : [pagoIds]).filter(Boolean)
    if (ids.length === 0) throw new Error('No hay pagos para asignar.')

    // 1) Vía preferida: RPC security definer. Valida admin y hace el update
    //    server-side, evitando el desfase vista(sin RLS)/tabla(con RLS) que hacía
    //    que un no-admin "asignara" sin que cambiara nada.
    const rpc = await supabase.rpc('asignar_pagos_a_turno', {
      p_turno_id: turnoActual.id,
      p_pago_ids: ids,
    })

    if (!rpc.error) {
      if (Number(rpc.data) === 0) {
        throw new Error('No se asignó ningún pago. Es posible que ya estén asignados o que no se encuentren.')
      }
      await fetchData()
      return
    }

    // 2) Si la RPC no está deployada todavía, caemos al update directo y
    //    verificamos cuántas filas cambiaron para no fallar en silencio.
    if (isMissingSchema(rpc.error)) {
      const { data, error: updateError } = await supabase
        .from('pagos')
        .update({ caja_turno_id: turnoActual.id })
        .in('id', ids)
        .select('id')
      if (updateError) throw updateError
      if (!data || data.length === 0) {
        throw new Error('No se pudo asignar ningún pago. Verificá que tu usuario tenga permisos de administrador de caja.')
      }
      await fetchData()
      return
    }

    throw rpc.error
  }, [fetchData, turnoActual])

  // ── Reapertura de turnos cerrados ──────────────────────────────────────────

  /** Reabre un turno cerrado (RPC: valida admin + motivo, deja auditoría). */
  const reabrirTurno = useCallback(async ({ turno_id, motivo }) => {
    if (!turno_id) throw new Error('Falta el turno a reabrir.')
    if (!String(motivo || '').trim()) throw new Error('El motivo de reapertura es obligatorio.')

    const { error: rpcErr } = await supabase.rpc('reabrir_turno', {
      p_turno_id: turno_id,
      p_motivo: String(motivo).trim(),
    })
    if (rpcErr) {
      if (isMissingSchema(rpcErr)) {
        throw new Error('Falta aplicar la migración de reapertura de turnos en Supabase.')
      }
      throw rpcErr
    }
    await fetchData()
  }, [fetchData])

  /** Edita un movimiento manual existente (queda auditado si el turno está reabierto). */
  const editarMovimiento = useCallback(async ({ id, tipo, medio_pago, monto, categoria, descripcion }) => {
    if (!id) throw new Error('Falta el movimiento a editar.')
    const patch = {}
    if (tipo !== undefined) patch.tipo = tipo
    if (medio_pago !== undefined) patch.medio_pago = medio_pago
    if (monto !== undefined) patch.monto = parseAmount(monto)
    if (categoria !== undefined) patch.categoria = categoria || null
    if (descripcion !== undefined) patch.descripcion = descripcion

    const { error: updateError } = await supabase
      .from('caja_movimientos')
      .update(patch)
      .eq('id', id)

    if (updateError) throw updateError
    await fetchData()
  }, [fetchData])

  /** Elimina un movimiento manual (queda auditado si el turno está reabierto). */
  const eliminarMovimiento = useCallback(async (id) => {
    if (!id) throw new Error('Falta el movimiento a eliminar.')
    const { error: delError } = await supabase
      .from('caja_movimientos')
      .delete()
      .eq('id', id)

    if (delError) throw delError
    await fetchData()
  }, [fetchData])

  /** Reasigna un pago a un turno (típicamente uno reabierto que se está corrigiendo). */
  const reasignarPago = useCallback(async ({ pago_id, turno_id }) => {
    if (!pago_id) throw new Error('Falta el pago a reasignar.')
    const { error: updateError } = await supabase
      .from('pagos')
      .update({ caja_turno_id: turno_id || null })
      .eq('id', pago_id)

    if (updateError) throw updateError
    await fetchData()
  }, [fetchData])

  /** Calcula el desglose por medio de un turno cualquiera (p.ej. uno reabierto). */
  const calcularResumenTurno = useCallback(
    (turno) => resumenDeTurno(turno, pagos, movimientos),
    [pagos, movimientos],
  )

  /** Devuelve la auditoría (eventos) de un turno, más reciente primero. */
  const auditoriaDeTurno = useCallback(
    (turnoId) => auditoria.filter(a => a.turno_id === turnoId),
    [auditoria],
  )

  return {
    turnoActual,
    turnos,
    movimientos,
    pagos,
    pedidos,
    auditoria,
    resumen,
    loading,
    error,
    setupWarning,
    refetch: fetchData,
    abrirTurno,
    registrarMovimiento,
    cerrarTurno,
    vincularPagosAlTurno,
    asignarPagosAlTurno,
    reabrirTurno,
    editarMovimiento,
    eliminarMovimiento,
    reasignarPago,
    calcularResumenTurno,
    auditoriaDeTurno,
  }
}
