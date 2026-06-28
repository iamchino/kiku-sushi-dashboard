import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Convierte 'YYYY-MM-DD' (local) a límites ISO en UTC, sin perder horas de la noche.
function rangoISO(desde, hasta) {
  const start = new Date(`${desde}T00:00:00`).toISOString()
  const end   = new Date(`${hasta}T23:59:59.999`).toISOString()
  return { start, end }
}

// Resumen financiero del período [desde, hasta] (ambos 'YYYY-MM-DD').
//   ingresos  → cobros registrados en `pagos`
//   egresos   → tabla `egresos` (solo estado 'pagado' impacta el resultado)
//   turnos    → cierres de caja (caja_turnos) del período
export function useFinanzas(desde, hasta) {
  const [pagos, setPagos]           = useState([])
  const [egresos, setEgresos]       = useState([])
  const [turnos, setTurnos]         = useState([])
  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const fetchData = useCallback(async () => {
    if (!desde || !hasta) return
    setLoading(true); setError(null)
    const { start, end } = rangoISO(desde, hasta)
    try {
      const [pagosRes, egresosRes, turnosRes, pendRes] = await Promise.all([
        supabase.from('pagos')
          .select('monto, medio_pago, created_at')
          .gte('created_at', start).lte('created_at', end),
        supabase.from('egresos')
          .select('monto, categoria, estado, fecha')
          .gte('fecha', desde).lte('fecha', hasta),
        supabase.from('caja_turnos')
          .select('*')
          .eq('estado', 'cerrado')
          .gte('business_date', desde).lte('business_date', hasta)
          .order('business_date', { ascending: false }),
        supabase.from('egresos')
          .select('id, descripcion, monto, vencimiento, categoria, proveedor:proveedores(razon_social)')
          .eq('estado', 'pendiente')
          .order('vencimiento', { ascending: true, nullsFirst: false }),
      ])
      if (pagosRes.error)   throw pagosRes.error
      if (egresosRes.error) throw egresosRes.error
      if (turnosRes.error)  throw turnosRes.error
      if (pendRes.error)    throw pendRes.error
      setPagos(pagosRes.data || [])
      setEgresos(egresosRes.data || [])
      setTurnos(turnosRes.data || [])
      setPendientes(pendRes.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  const resumen = useMemo(() => {
    const ingresos = pagos.reduce((s, p) => s + Number(p.monto || 0), 0)
    const egresosPagados = egresos.filter(e => e.estado === 'pagado')
    const totalEgresos = egresosPagados.reduce((s, e) => s + Number(e.monto || 0), 0)
    const resultado = ingresos - totalEgresos
    const margen = ingresos > 0 ? (resultado / ingresos) * 100 : 0

    const porCategoria = Object.values(
      egresosPagados.reduce((acc, e) => {
        const k = e.categoria || 'otros'
        acc[k] = acc[k] || { categoria: k, total: 0 }
        acc[k].total += Number(e.monto || 0)
        return acc
      }, {})
    ).sort((a, b) => b.total - a.total)

    const porMedio = Object.values(
      pagos.reduce((acc, p) => {
        const k = p.medio_pago || 'efectivo'
        acc[k] = acc[k] || { medio: k, total: 0 }
        acc[k].total += Number(p.monto || 0)
        return acc
      }, {})
    ).sort((a, b) => b.total - a.total)

    const totalPendiente = pendientes.reduce((s, e) => s + Number(e.monto || 0), 0)

    return {
      ingresos, totalEgresos, resultado, margen,
      porCategoria, porMedio, totalPendiente,
      cantPedidos: pagos.length,
    }
  }, [pagos, egresos, pendientes])

  return { resumen, turnos, pendientes, loading, error, refetch: fetchData }
}
