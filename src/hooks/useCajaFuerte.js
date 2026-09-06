import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Caja fuerte: el efectivo del negocio fuera de la caja registradora.
// Entra por retiros al cierre de turno (retirar_a_caja_fuerte) y sale por
// pagos (registrar_pago con origen 'caja_fuerte') o ajustes. Todo por RPC:
// la tabla no acepta escrituras directas.
// Opciones: { desde, hasta } en 'YYYY-MM-DD' acotan los MOVIMIENTOS al
// período (el saldo siempre es el actual, no tiene sentido "a fecha").
// `verSaldo`: quien puede OPERAR la caja fuerte (depositar, pagar desde ella)
// no necesariamente puede VER cuanto hay. Con verSaldo=false no se piden ni el
// saldo ni los movimientos —las RPC lo rechazarian y la RLS devolveria cero
// filas— y el arrastre pendiente se resuelve por apertura_sugerida(), que es
// security definer y devuelve solo el agregado.
export function useCajaFuerte({ desde = null, hasta = null, verSaldo = true } = {}) {
  const [movimientos, setMovimientos] = useState([])
  const [saldo, setSaldo]     = useState(null)
  const [turnoAbierto, setTurnoAbierto] = useState(null)
  const [ultimoCierre, setUltimoCierre] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let movsQuery = supabase
        .from('caja_fuerte_movimientos')
        .select('*, egreso:egresos(descripcion, categoria, medio_pago), turno:caja_turnos(business_date)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (desde) movsQuery = movsQuery.gte('created_at', new Date(`${desde}T00:00:00`).toISOString())
      if (hasta) movsQuery = movsQuery.lte('created_at', new Date(`${hasta}T23:59:59.999`).toISOString())

      const [movs, saldoRes, turnoRes] = await Promise.all([
        verSaldo ? movsQuery : Promise.resolve({ data: [], error: null }),
        verSaldo ? supabase.rpc('saldo_caja_fuerte') : Promise.resolve({ data: null, error: null }),
        supabase.from('caja_turnos').select('id').eq('estado', 'abierto').limit(1).maybeSingle(),
      ])
      if (movs.error) throw movs.error
      if (saldoRes.error) throw saldoRes.error
      setMovimientos(movs.data || [])
      setSaldo(verSaldo ? Number(saldoRes.data ?? 0) : null)
      setTurnoAbierto(turnoRes.error ? null : turnoRes.data)

      // Último cierre: cuánto efectivo dejó y cuánto ya se depositó después.
      // Es lo que se puede retirar con la caja cerrada (y lo que el arrastre
      // le sugiere a la próxima apertura). Best-effort.
      // Sin permiso de ver la caja fuerte, los depositos no se pueden contar
      // desde el cliente (la RLS devuelve cero, sin error, y "lo que queda por
      // retirar" saldria inflado). La RPC hace la cuenta del lado del servidor
      // y devuelve solo el numero.
      if (!verSaldo) {
        try {
          const { data: sug, error: e } = await supabase.rpc('apertura_sugerida')
          setUltimoCierre(!e && sug
            ? { fecha: sug.fecha, efectivo: null, depositado: null, disponible: Number(sug.monto || 0) }
            : null)
        } catch { setUltimoCierre(null) }
        return
      }

      try {
        const { data: ult } = await supabase
          .from('caja_turnos')
          .select('id, business_date, cierre_at, denominaciones_cierre')
          .eq('estado', 'cerrado')
          .order('cierre_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (ult) {
          const efectivo = Number(ult.denominaciones_cierre?.medios?.efectivo?.contado
            ?? ult.denominaciones_cierre?.medios?.efectivo?.esperado ?? NaN)
          const { data: deps } = await supabase
            .from('caja_fuerte_movimientos')
            .select('monto')
            .eq('turno_id', ult.id)
            .eq('tipo', 'deposito')
            .gt('created_at', ult.cierre_at)
          const depositado = (deps || []).reduce((a, d) => a + Number(d.monto || 0), 0)
          setUltimoCierre({
            fecha: ult.business_date,
            efectivo: Number.isFinite(efectivo) ? efectivo : null,
            depositado,
            disponible: Number.isFinite(efectivo) ? Math.max(0, efectivo - depositado) : null,
          })
        } else {
          setUltimoCierre(null)
        }
      } catch { setUltimoCierre(null) }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, verSaldo])

  useEffect(() => { cargar() }, [cargar])

  const invocar = async (fn, args) => {
    const { data, error: e } = await supabase.rpc(fn, args)
    if (e) throw new Error(e.message)
    await cargar()
    return data
  }

  /**
   * Retira efectivo de la caja y lo deposita acá. Atómico.
   * Con turno abierto descuenta el arqueo; con la caja cerrada sale del
   * efectivo del último cierre (la próxima apertura deja de arrastrarlo).
   */
  const retirar = useCallback((monto, notas) =>
    invocar('retirar_a_caja_fuerte', { p_monto: Number(monto), p_notas: notas || null }), []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Ajuste manual: 'sobrante' suma, 'faltante' resta. */
  const ajustar = useCallback((monto, direccion, descripcion) =>
    invocar('ajustar_caja_fuerte', { p_monto: Number(monto), p_direccion: direccion, p_descripcion: descripcion }), []) // eslint-disable-line react-hooks/exhaustive-deps

  return { movimientos, saldo, turnoAbierto, ultimoCierre, loading, error, retirar, ajustar, recargar: cargar }
}
