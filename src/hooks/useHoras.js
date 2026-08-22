import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { rangoSemana, arDateISO, minutosExactos } from '../lib/horas'
import { armarTurnos } from '../lib/turnos'
import { borrarFila } from '../lib/borrar'

const FICHAJE_SELECT = '*, empleado:empleados(nombre, apellido), punto:puntos_fichaje(nombre)'
const LIQ_SELECT = '*, empleado:empleados(nombre, apellido)'

// Las marcas se piden con un margen a cada lado de la semana: un turno que
// empieza el domingo 18:00 termina el lunes 00:08, y sin ese margen la marca
// de salida queda afuera y el turno se ve partido (o directamente abierto).
const MARGEN_MS = 14 * 60 * 60 * 1000
// Para "quién está adentro ahora" miramos más atrás: un turno que quedó
// abierto hace días tiene que verse igual (es una salida que nadie fichó).
const DIAS_ABIERTOS = 7

// Administración de horas (solo Finanzas, por RLS) para la semana lunes→domingo
// que contiene `refDate`:
//  - fichajes: log de marcas de la semana (+ CRUD para correcciones manuales)
//  - horasDia: minutos por empleado y día (vista_jornadas), para el desglose
//             de la tira Lun→Dom. Excluye días ya pagados por jornal, así
//             suma exacto el total del resumen.
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
  const [horasDia, setHorasDia]                   = useState({})
  // Detalle de jornadas por empleado y día ({empleado: {fecha: [{entrada,
  // salida, minutos}]}}): alimenta el "de qué hora a qué hora" al clickear
  // un día en la tira de Liquidación.
  const [jornadasDia, setJornadasDia]             = useState({})
  // Turnos (entrada → salida) de la semana, ya emparejados y atribuidos al día
  // de la ENTRADA: un turno de 18:00 a 00:08 es UN turno del día que empezó.
  const [turnos, setTurnos]                       = useState([])
  // Turnos sin salida: quién está adentro ahora (o se olvidó de fichar).
  const [turnosAbiertos, setTurnosAbiertos]       = useState([])
  // Sueldo base por empleado (para mostrar el monto de los de sueldo fijo:
  // liquidacion_horas devuelve total=0 para ellos y el monto vive en el legajo)
  const [sueldos, setSueldos]                     = useState({})
  const [loading, setLoading]                     = useState(true)
  const [error, setError]                         = useState(null)

  const semana = useMemo(() => rangoSemana(refDate), [refDate])

  const fetchTodo = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const desdeMarcas = new Date(Date.parse(semana.inicioISO) - MARGEN_MS).toISOString()
      const hastaMarcas = new Date(Date.parse(semana.finExclusivoISO) + MARGEN_MS).toISOString()
      const desdeAbiertos = new Date(Date.now() - DIAS_ABIERTOS * 24 * 60 * 60 * 1000).toISOString()

      const [fic, res, liq, pun, jor, emp, rec] = await Promise.all([
        supabase
          .from('fichajes')
          .select(FICHAJE_SELECT)
          .gte('ts', desdeMarcas)
          .lt('ts', hastaMarcas)
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
        // Jornadas cerradas de la semana (todas las de la semana, Finanzas por RLS),
        // para desglosar las horas por día. Se traen los minutos REALES de cada
        // tramo: se suman tal cual, sin bloques ni redondeo, igual que hace la
        // base en vista_jornadas_dia.
        supabase
          .from('vista_jornadas')
          .select('empleado_id, entrada, salida, minutos, minutos_reales')
          .gte('entrada', semana.inicioISO)
          .lt('entrada', semana.finExclusivoISO),
        supabase
          .from('empleados')
          .select('id, sueldo_base, tipo_sueldo')
          .eq('activo', true),
        // Marcas recientes (independientes de la semana que se esté mirando)
        // para saber quién tiene un turno abierto AHORA.
        supabase
          .from('fichajes')
          .select(FICHAJE_SELECT)
          .gte('ts', desdeAbiertos)
          .order('ts', { ascending: false }),
      ])
      for (const r of [fic, res, liq, pun, jor, emp, rec]) if (r.error) throw r.error
      const marcas = fic.data || []
      setFichajes(marcas)
      setResumen(res.data || [])
      const todas = liq.data || []
      const dias = todas.filter(l => l.tipo === 'dia')
      setLiquidaciones(todas.filter(l => (l.tipo || 'semana') === 'semana'))
      setLiquidacionesDia(dias)
      setPuntos(pun.data || [])
      setSueldos(Object.fromEntries((emp.data || []).map(e => [e.id, Number(e.sueldo_base) || 0])))

      // Minutos por empleado y día (solo jornadas cerradas). Excluimos los días
      // ya pagados como jornal: así la tira Lun→Dom suma exactamente el total
      // "pendiente de cierre" que muestra cada fila (el resumen los excluye igual).
      const jornalDias = new Set(dias.map(l => `${l.empleado_id}|${l.semana_inicio}`))
      const mapa = {}
      const detalle = {}
      for (const j of (jor.data || [])) {
        if (!j.salida) continue
        const fecha = arDateISO(j.entrada)
        if (jornalDias.has(`${j.empleado_id}|${fecha}`)) continue
        ;(mapa[j.empleado_id] ||= {})
        // Se acumulan los minutos reales del día: lo fichado es lo que se paga.
        mapa[j.empleado_id][fecha] = (mapa[j.empleado_id][fecha] || 0) + (j.minutos_reales ?? j.minutos ?? 0)
        ;(detalle[j.empleado_id] ||= {})
        ;(detalle[j.empleado_id][fecha] ||= []).push(j)
      }
      // Sin redondeo: el total del día son los minutos exactos fichados.
      for (const porFecha of Object.values(mapa)) {
        for (const fecha of Object.keys(porFecha)) {
          porFecha[fecha] = minutosExactos(porFecha[fecha])
        }
      }
      // Turnos emparejados de la semana. El día de un turno es el día de la
      // ENTRADA en hora de Argentina: si entró 18:00 y salió 00:08, es UN
      // turno del día que empezó, no dos días distintos.
      const todosLosTurnos = armarTurnos(marcas)
      const deLaSemana = todosLosTurnos.filter(t => t.dia >= semana.desde && t.dia <= semana.hasta)
      setTurnos(deLaSemana)
      setTurnosAbiertos(armarTurnos(rec.data || []).filter(t => t.abierto))

      // Los turnos sin salida entran al desglose por día para que se vean,
      // pero NO suman minutos: mientras no haya salida no hay horas que pagar.
      for (const t of deLaSemana) {
        if (t.salida) continue
        if (jornalDias.has(`${t.empleado_id}|${t.dia}`)) continue
        ;(detalle[t.empleado_id] ||= {})
        ;(detalle[t.empleado_id][t.dia] ||= []).push({
          entrada: t.entrada,
          salida: null,
          minutos: null,
          minutos_reales: null,
          abierta: t.abierto,
          transcurrido: t.transcurrido,
        })
      }

      for (const porEmpleado of Object.values(detalle)) {
        for (const lista of Object.values(porEmpleado)) {
          lista.sort((a, b) => new Date(a.entrada) - new Date(b.entrada))
        }
      }
      setHorasDia(mapa)
      setJornadasDia(detalle)
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
    await borrarFila('fichajes', id, 'la marca')
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
    await borrarFila('liquidaciones', liq.id, 'el jornal')
    await fetchTodo()
  }, [fetchTodo])

  const actualizarLiquidacion = useCallback(async (id, form) => {
    const { error: e } = await supabase.from('liquidaciones').update(form).eq('id', id)
    if (e) throw e
    await fetchTodo()
  }, [fetchTodo])

  const eliminarLiquidacion = useCallback(async (id) => {
    await borrarFila('liquidaciones', id, 'la liquidación')
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
    semana, fichajes, turnos, turnosAbiertos, resumen, liquidaciones, liquidacionesDia,
    puntos, horasDia, jornadasDia, sueldos, loading, error,
    refetch: fetchTodo,
    crearFichaje, actualizarFichaje, eliminarFichaje,
    generarLiquidacion, generarLiquidacionDia, anularLiquidacionDia,
    actualizarLiquidacion, eliminarLiquidacion,
    crearPunto, actualizarPunto, regenerarToken,
  }
}
