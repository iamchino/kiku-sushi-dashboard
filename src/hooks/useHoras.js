import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { rangoSemana } from '../lib/horas'

const FICHAJE_SELECT = '*, empleado:empleados(nombre, apellido), punto:puntos_fichaje(nombre)'
const LIQ_SELECT = '*, empleado:empleados(nombre, apellido)'

// Administración de horas (solo Finanzas, por RLS) para la semana martes→lunes
// que contiene `refDate`:
//  - fichajes: log de marcas de la semana (+ CRUD para correcciones manuales)
//  - resumen: liquidacion_horas(desde, hasta) — horas y $ pendientes de cierre
//             semanal (excluye días ya pagados por jornal)
//  - liquidaciones: cierres SEMANALES de esa semana (pendiente/pagado)
//  - liquidacionesDia: jornales (tipo 'dia') con fecha dentro de la semana
//  - puntos: puntos de fichaje (QR) + CRUD (geocerca, token)
export function useHoras(refDate) {
  const [fichajes, setFichajes]                   = useState([])
  const [resumen, setResumen]                     = useState([])
  const [liquidaciones, setLiquidaciones]         = useState([])
  const [liquidacionesDia, setLiquidacionesDia]   = useState([])
  const [puntos, setPuntos]                       = useState([])
  const [loading, setLoading]                     = useState(true)
  const [error, setError]                         = useState(null)

  const semana = useMemo(() => rangoSemana(refDate), [refDate])

  const fetchTodo = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [fic, res, liq, pun] = await Promise.all([
        supabase
          .from('fichajes')
          .select(FICHAJE_SELECT)
          .gte('ts', semana.inicioISO)
          .lt('ts', semana.finExclusivoISO)
          .order('ts', { ascending: false }),
        supabase.rpc('liquidacion_horas', { p_desde: semana.desde, p_hasta: semana.hasta }),
        supabase
          .from('liquidaciones')
          .select(LIQ_SELECT)
          .or(`and(tipo.eq.semana,semana_inicio.eq.${semana.desde}),and(tipo.eq.dia,semana_inicio.gte.${semana.desde},semana_inicio.lte.${semana.hasta})`)
          .order('semana_inicio', { ascending: true }),
        supabase
          .from('puntos_fichaje')
          .select('*')
          .order('created_at', { ascending: true }),
      ])
      for (const r of [fic, res, liq, pun]) if (r.error) throw r.error
      setFichajes(fic.data || [])
      setResumen(res.data || [])
      const todas = liq.data || []
      setLiquidaciones(todas.filter(l => (l.tipo || 'semana') === 'semana'))
      setLiquidacionesDia(todas.filter(l => l.tipo === 'dia'))
      setPuntos(pun.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [semana.desde, semana.hasta, semana.inicioISO, semana.finExclusivoISO])

  useEffect(() => { fetchTodo() }, [fetchTodo])

  // ── Fichajes: corrección manual ─────────────────────────────────────────────
  const crearFichaje = useCallback(async (form) => {
    const { error: e } = await supabase
      .from('fichajes')
      .insert([{ ...form, origen: 'manual' }])
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const actualizarFichaje = useCallback(async (id, form) => {
    const { error: e } = await supabase
      .from('fichajes')
      .update({ ...form, origen: 'manual' })
      .eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const eliminarFichaje = useCallback(async (id) => {
    const { error: e } = await supabase.from('fichajes').delete().eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  // ── Liquidación semanal ─────────────────────────────────────────────────────
  // Materializa la semana visible → filas 'pendiente' en `liquidaciones`.
  const generarLiquidacion = useCallback(async () => {
    const { error: e } = await supabase.rpc('generar_liquidacion_semanal', {
      p_fecha: semana.desde,
    })
    if (e) throw e
    await fetchTodo()
  }, [semana.desde, fetchTodo])

  // ── Liquidación diaria (jornal) ─────────────────────────────────────────────
  // Genera (o recalcula si no está paga) la fila 'dia' y la devuelve.
  const generarLiquidacionDia = useCallback(async (empleadoId, fecha) => {
    const { data, error: e } = await supabase.rpc('generar_liquidacion_dia', {
      p_empleado_id: empleadoId,
      p_fecha: fecha,
    })
    if (e) throw new Error(e.message)
    const fila = Array.isArray(data) ? data[0] : data
    if (!fila) throw new Error('Ese jornal ya está pagado.')
    await fetchTodo()
    return fila
  }, [fetchTodo])

  // Anula un jornal: borra el egreso vinculado (si existe) y la fila.
  const anularLiquidacionDia = useCallback(async (liq) => {
    if (liq.egreso_id) {
      const { error: e0 } = await supabase.from('egresos').delete().eq('id', liq.egreso_id)
      if (e0) throw e0
    }
    const { error: e } = await supabase.from('liquidaciones').delete().eq('id', liq.id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const actualizarLiquidacion = useCallback(async (id, form) => {
    const { error: e } = await supabase.from('liquidaciones').update(form).eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const eliminarLiquidacion = useCallback(async (id) => {
    const { error: e } = await supabase.from('liquidaciones').delete().eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  // ── Puntos de fichaje (QR + geocerca) ───────────────────────────────────────
  const crearPunto = useCallback(async (form) => {
    const token = crypto.randomUUID().replaceAll('-', '')
    const { error: e } = await supabase.from('puntos_fichaje').insert([{ ...form, token }])
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const actualizarPunto = useCallback(async (id, form) => {
    const { error: e } = await supabase.from('puntos_fichaje').update(form).eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const regenerarToken = useCallback(async (id) => {
    const token = crypto.randomUUID().replaceAll('-', '')
    const { error: e } = await supabase.from('puntos_fichaje').update({ token }).eq('id', id)
    if (e) throw e
    await fetchTodo()
    return token
  }, [fetchTodo])

  return {
    semana, fichajes, resumen, liquidaciones, liquidacionesDia, puntos, loading, error,
    refetch: fetchTodo,
    crearFichaje, actualizarFichaje, eliminarFichaje,
    generarLiquidacion, generarLiquidacionDia, anularLiquidacionDia,
    actualizarLiquidacion, eliminarLiquidacion,
    crearPunto, actualizarPunto, regenerarToken,
  }
}
