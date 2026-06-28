import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

  const actualizarEgreso = useCallback(async (id, form) => {
    const { data, error: e } = await supabase
      .from('egresos')
      .update(form)
      .eq('id', id)
      .select(SELECT)
      .single()
    if (e) throw e
    await fetchEgresos()
    return data
  }, [fetchEgresos])

  const eliminarEgreso = useCallback(async (id) => {
    const { error: e } = await supabase
      .from('egresos')
      .delete()
      .eq('id', id)
    if (e) throw e
    await fetchEgresos()
  }, [fetchEgresos])

  return {
    egresos, pendientes, loading, error,
    refetch: fetchEgresos,
    crearEgreso, actualizarEgreso, eliminarEgreso,
  }
}
