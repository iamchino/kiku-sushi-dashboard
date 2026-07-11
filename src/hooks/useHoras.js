import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { rangoSemana } from '../lib/horas'

const FICHAJE_SELECT = '*, empleado:empleados(nombre, apellido), punto:puntos_fichaje(nombre)'

// Administración de horas (solo Finanzas, por RLS) para la semana martes→lunes
// que contiene `refDate`:
//  - fichajes: log de marcas de la semana (+ CRUD para correcciones manuales)
//  - resumen: liquidacion_horas(desde, hasta) — horas y $ por empleado
//  - liquidaciones: filas persistidas de esa semana (estado pendiente/pagado)
//  - puntos: puntos de fichaje (QR) + CRUD (geocerca, token)
export function useHoras(refDate) {
  const [fichajes, setFichajes]           = useState([])
  const [resumen, setResumen]             = useState([])
  const [liquidaciones, setLiquidaciones] = useState([])
  const [puntos, setPuntos]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

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
          .select('*, empleado:empleados(nombre, apellido)')
          .eq('semana_inicio', semana.desde),
        supabase
          .from('puntos_fichaje')
          .select('*')
          .order('created_at', { ascending: true }),
      ])
      for (const r of [fic, res, liq, pun]) if (r.error) throw r.error
      setFichajes(fic.data || [])
      setResumen(res.data || [])
      setLiquidaciones(liq.data || [])
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
    semana, fichajes, resumen, liquidaciones, puntos, loading, error,
    refetch: fetchTodo,
    crearFichaje, actualizarFichaje, eliminarFichaje,
    generarLiquidacion, actualizarLiquidacion, eliminarLiquidacion,
    crearPunto, actualizarPunto, regenerarToken,
  }
}
