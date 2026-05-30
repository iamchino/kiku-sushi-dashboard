import { useCallback, useEffect, useMemo, useState } from 'react'
import { endOfDay, startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'

export const MEDIOS_ARQUEO = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'tarjeta_credito', label: 'Tarjeta credito' },
  { id: 'tarjeta_debito', label: 'Tarjeta debito' },
]

export const TIPOS_MOVIMIENTO_CAJA = [
  { id: 'ingreso', label: 'Ingreso manual', short: 'Ingreso', sign: 1 },
  { id: 'egreso', label: 'Egreso manual', short: 'Egreso', sign: -1 },
  { id: 'retiro', label: 'Retiro de caja', short: 'Retiro', sign: -1 },
  { id: 'deposito', label: 'Deposito', short: 'Deposito', sign: -1 },
  { id: 'gasto', label: 'Gasto operativo', short: 'Gasto', sign: -1 },
  { id: 'propina', label: 'Propina retirada', short: 'Propina', sign: -1 },
  { id: 'ajuste', label: 'Ajuste', short: 'Ajuste', sign: 1 },
  { id: 'no_venta', label: 'Apertura no venta', short: 'No venta', sign: 0 },
]

const NEGATIVE_TYPES = new Set(['egreso', 'retiro', 'deposito', 'gasto', 'propina'])

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
  if (!movimiento || movimiento.tipo === 'no_venta') return 0
  if (movimiento.tipo === 'ajuste') {
    return movimiento.categoria === 'faltante' ? -1 : 1
  }
  return NEGATIVE_TYPES.has(movimiento.tipo) ? -1 : 1
}

function sum(rows, pick) {
  return rows.reduce((acc, row) => acc + Number(pick(row) || 0), 0)
}

export function useCajaArqueo({ dateFrom = null, dateTo = null } = {}) {
  const [turnoActual, setTurnoActual] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [pagos, setPagos] = useState([])
  const [pedidos, setPedidos] = useState([])
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
          .select('id, mesa, canal, estado, total, created_at')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at', { ascending: false }),
      ])

      if (turnosRes.error && !isMissingSchema(turnosRes.error)) setError(turnosRes.error.message)
      if (movimientosRes.error && !isMissingSchema(movimientosRes.error)) setError(movimientosRes.error.message)
      if (pagosRes.error && !isMissingSchema(pagosRes.error)) setError(pagosRes.error.message)
      if (pedidosRes.error) setError(pedidosRes.error.message)

      if ((turnosRes.error && isMissingSchema(turnosRes.error))
        || (movimientosRes.error && isMissingSchema(movimientosRes.error))) {
        setSetupWarning('Falta ejecutar la migracion de arqueo de caja en Supabase.')
      }

      setTurnoActual(openTurno)
      setTurnos(turnosRes.data || [])
      setMovimientos(movimientosRes.data || [])
      setPagos(pagosRes.data || [])
      setPedidos(pedidosRes.data || [])
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
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [dateFrom, dateTo, fetchData])

  const resumen = useMemo(() => {
    const pagosTurno = turnoActual
      ? pagos.filter(pago => belongsToTurn(pago, turnoActual, 'caja_turno_id'))
      : []
    const movimientosTurno = turnoActual
      ? movimientos.filter(mov => belongsToTurn(mov, turnoActual, 'turno_id'))
      : []

    const ventasPorMedio = MEDIOS_ARQUEO.map(medio => {
      const rows = pagosTurno.filter(pago => pago.medio_pago === medio.id)
      return {
        ...medio,
        total: sum(rows, row => row.monto),
        cantidad: rows.length,
      }
    })

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
    const apertura = Number(turnoActual?.apertura_monto || 0)
    const efectivoEsperado = apertura + pagosEfectivo + movimientosFirmados
    const pagosByPedido = new Set(pagos.map(pago => pago.pedido_id).filter(Boolean))
    const pedidosValidos = pedidos.filter(pedido => pedido.estado !== 'cancelado')
    const pedidosSinPago = pedidosValidos.filter(pedido => !pagosByPedido.has(pedido.id))
    const pagosSinTurno = pagos.filter(pago => !pago.caja_turno_id)

    return {
      pagosTurno,
      movimientosTurno,
      ventasPorMedio,
      apertura,
      pagosEfectivo,
      ventasTotal: sum(pagosTurno, row => row.monto),
      movimientosIngresos,
      movimientosEgresos,
      movimientosNeto: movimientosFirmados,
      efectivoEsperado,
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
    const amount = tipo === 'no_venta' ? 0 : parseAmount(monto)

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
    cierre_monto,
    efectivo_esperado,
    deposito_monto = 0,
    notas_cierre,
    denominaciones_cierre = {},
  }) => {
    if (!turno_id) throw new Error('No hay turno abierto para cerrar.')
    const counted = parseAmount(cierre_monto)
    const expected = parseAmount(efectivo_esperado)

    const { error: updateError } = await supabase
      .from('caja_turnos')
      .update({
        estado: 'cerrado',
        cierre_monto: counted,
        efectivo_esperado: expected,
        diferencia: counted - expected,
        deposito_monto: parseAmount(deposito_monto),
        notas_cierre: notas_cierre || null,
        denominaciones_cierre,
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

  return {
    turnoActual,
    turnos,
    movimientos,
    pagos,
    pedidos,
    resumen,
    loading,
    error,
    setupWarning,
    refetch: fetchData,
    abrirTurno,
    registrarMovimiento,
    cerrarTurno,
    vincularPagosAlTurno,
  }
}
