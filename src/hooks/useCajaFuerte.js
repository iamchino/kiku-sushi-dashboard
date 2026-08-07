import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Caja fuerte: el efectivo del negocio fuera de la caja registradora.
// Entra por retiros al cierre de turno (retirar_a_caja_fuerte) y sale por
// pagos (registrar_pago con origen 'caja_fuerte') o ajustes. Todo por RPC:
// la tabla no acepta escrituras directas.
export function useCajaFuerte() {
  const [movimientos, setMovimientos] = useState([])
  const [saldo, setSaldo]     = useState(null)
  const [turnoAbierto, setTurnoAbierto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [movs, saldoRes, turnoRes] = await Promise.all([
        supabase
          .from('caja_fuerte_movimientos')
          .select('*, egreso:egresos(descripcion, categoria, medio_pago), turno:caja_turnos(business_date)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.rpc('saldo_caja_fuerte'),
        supabase.from('caja_turnos').select('id').eq('estado', 'abierto').limit(1).maybeSingle(),
      ])
      if (movs.error) throw movs.error
      if (saldoRes.error) throw saldoRes.error
      setMovimientos(movs.data || [])
      setSaldo(Number(saldoRes.data ?? 0))
      setTurnoAbierto(turnoRes.error ? null : turnoRes.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const invocar = async (fn, args) => {
    const { data, error: e } = await supabase.rpc(fn, args)
    if (e) throw new Error(e.message)
    await cargar()
    return data
  }

  /** Retira efectivo del turno abierto y lo deposita acá. Atómico. */
  const retirar = useCallback((monto, notas) =>
    invocar('retirar_a_caja_fuerte', { p_monto: Number(monto), p_notas: notas || null }), []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Ajuste manual: 'sobrante' suma, 'faltante' resta. */
  const ajustar = useCallback((monto, direccion, descripcion) =>
    invocar('ajustar_caja_fuerte', { p_monto: Number(monto), p_direccion: direccion, p_descripcion: descripcion }), []) // eslint-disable-line react-hooks/exhaustive-deps

  return { movimientos, saldo, turnoAbierto, loading, error, retirar, ajustar, recargar: cargar }
}
