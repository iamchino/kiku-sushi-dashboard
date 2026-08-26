import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { editarPago, anularPago, historialDePago } from '../lib/pagos'

const SELECT = '*, proveedor:proveedores(razon_social), empleado:empleados(nombre, apellido)'

// Ledger de egresos. Admin-only por RLS.
//  - egresos:    movimientos cuya `fecha` cae dentro del rango [desde, hasta]
//  - pendientes: cuentas por pagar (estado = 'pendiente') sin importar la fecha
export function useEgresos(desde, hasta) {
  const [egresos, setEgresos]       = useState([])
  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const fetchEgresos = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const rangoQuery = supabase
        .from('egresos')
        .select(SELECT)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })

      if (desde) rangoQuery.gte('fecha', desde)
      if (hasta) rangoQuery.lte('fecha', hasta)

      const pendientesQuery = supabase
        .from('egresos')
        .select(SELECT)
        .eq('estado', 'pendiente')
        .order('vencimiento', { ascending: true, nullsFirst: false })

      const [rango, pend] = await Promise.all([rangoQuery, pendientesQuery])
      if (rango.error) throw rango.error
      if (pend.error) throw pend.error
      setEgresos(rango.data || [])
      setPendientes(pend.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { fetchEgresos() }, [fetchEgresos])

  const crearEgreso = useCallback(async (form) => {
    const { data, error: e } = await supabase
      .from('egresos')
      .insert([form])
      .select(SELECT)
      .single()
    if (e) throw e
    await fetchEgresos()
    return data
  }, [fetchEgresos])

  // Editar y anular pasan por los RPC de pagos: un egreso que salió de una
  // caja tiene un movimiento espejo en `caja_movimientos` o en
  // `caja_fuerte_movimientos`, y tocar solo el egreso dejaba el arqueo y el
  // saldo de la caja fuerte mal, en silencio. Los RPC mueven las dos mitades
  // juntas y dejan el cambio en el historial del pago.
  //
  // Se acepta el id suelto o la fila entera; con la fila se puede avisar
  // mejor cuando falta correr la migración.
  const actualizarEgreso = useCallback(async (idOFila, form, motivo) => {
    const pago = typeof idOFila === 'string'
      ? (egresos.find(e => e.id === idOFila) || pendientes.find(e => e.id === idOFila) || { id: idOFila })
      : idOFila
    const data = await editarPago(pago, form, motivo)
    await fetchEgresos()
    return data
  }, [fetchEgresos, egresos, pendientes])

  const eliminarEgreso = useCallback(async (idOFila, motivo) => {
    const pago = typeof idOFila === 'string'
      ? (egresos.find(e => e.id === idOFila) || pendientes.find(e => e.id === idOFila) || { id: idOFila })
      : idOFila
    await anularPago(pago, motivo)
    await fetchEgresos()
  }, [fetchEgresos, egresos, pendientes])

  return {
    egresos, pendientes, loading, error,
    refetch: fetchEgresos,
    crearEgreso, actualizarEgreso, eliminarEgreso, historialDePago,
  }
}
