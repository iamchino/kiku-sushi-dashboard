import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Aplana recursivamente una receta hasta obtener solo ingredientes crudos de stock.
 * @param {object} receta - La receta a resolver
 * @param {number} cantidadPorciones - Cuántas porciones producir
 * @param {array}  allRecetas - Todas las recetas (para resolver sub-recetas)
 * @param {Set}    visited - Control de recursión infinita
 * @returns {array} [{stock_id, nombre, unidad, cantidad, stock_actual}]
 */
export function calcularIngredientesCrudos(receta, cantidadPorciones, allRecetas, visited = new Set()) {
  if (!receta || visited.has(receta.id)) return []
  const newVisited = new Set(visited)
  newVisited.add(receta.id)

  const porciones = parseInt(receta.porciones) || 1
  const factor = cantidadPorciones / porciones
  const result = []

  for (const ri of (receta.receta_ingredientes || [])) {
    const cant = parseFloat(ri.cantidad) || 0

    if (ri.stock_id && ri.stock) {
      result.push({
        stock_id: ri.stock_id,
        nombre: ri.stock.nombre,
        unidad: ri.stock.unidad,
        cantidad: cant * factor,
        stock_actual: parseFloat(ri.stock.stock_actual) || 0,
      })
    } else if (ri.subreceta_id) {
      const sub = allRecetas.find(r => r.id === ri.subreceta_id)
      if (sub) {
        const subResults = calcularIngredientesCrudos(sub, cant * factor, allRecetas, newVisited)
        result.push(...subResults)
      }
    }
  }

  return result
}

/**
 * Agrupa ingredientes duplicados (mismo stock_id) sumando cantidades.
 */
export function mergeIngredientes(ingredientes) {
  const map = {}
  for (const ing of ingredientes) {
    if (map[ing.stock_id]) {
      map[ing.stock_id].cantidad += ing.cantidad
    } else {
      map[ing.stock_id] = { ...ing }
    }
  }
  return Object.values(map)
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useProduccion() {
  const [lista, setLista]       = useState(null)
  const [tareas, setTareas]     = useState([])
  const [recetas, setRecetas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [fecha, setFecha]       = useState(() => {
    const hoy = new Date()
    return hoy.toISOString().split('T')[0]
  })

  // ── Fetch lista + recetas ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resLista, resRecetas] = await Promise.all([
      supabase
        .from('produccion_listas')
        .select('*, produccion_tareas(*)')
        .eq('fecha', fecha)
        .maybeSingle(),
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, stock_actual, stock_minimo, precio_unitario, rendimiento))')
        .order('nombre'),
    ])

    if (resLista.error) { setError(resLista.error.message); setLoading(false); return }
    if (resRecetas.error) { setError(resRecetas.error.message); setLoading(false); return }

    setLista(resLista.data || null)
    const tareasOrdenadas = (resLista.data?.produccion_tareas || [])
      .sort((a, b) => (a.prioridad || 0) - (b.prioridad || 0))
    setTareas(tareasOrdenadas)
    setRecetas(resRecetas.data || [])
    setLoading(false)
  }, [fecha])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('produccion-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produccion_listas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produccion_tareas' }, fetchData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchData])

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = tareas.length
    const completadas = tareas.filter(t => t.estado === 'completada').length
    const pendientes = tareas.filter(t => t.estado === 'pendiente').length
    const enProgreso = tareas.filter(t => t.estado === 'en_progreso').length
    return { total, completadas, pendientes, enProgreso, porcentaje: total ? Math.round((completadas / total) * 100) : 0 }
  }, [tareas])

  // ── Sub-recetas para el dropdown ────────────────────────────────────────
  const subRecetas = useMemo(() =>
    recetas.filter(r => r.es_subreceta),
  [recetas])

  // ── CRUD Listas ─────────────────────────────────────────────────────────
  const createLista = async (fechaLista, titulo, notas) => {
    const { data: session } = await supabase.auth.getSession()
    const { data, error: e } = await supabase
      .from('produccion_listas')
      .insert({
        fecha: fechaLista || fecha,
        titulo: titulo || `Producción ${new Date(fechaLista || fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}`,
        notas: notas || null,
        creado_por: session?.session?.user?.id || null,
      })
      .select()
      .single()
    if (e) return { error: e }
    setLista(data)
    return { data }
  }

  // ── CRUD Tareas ─────────────────────────────────────────────────────────
  const addTarea = async ({ receta_id, descripcion, cantidad, prioridad }) => {
    if (!lista) return { error: { message: 'No hay lista creada para este día.' } }
    const { error: e } = await supabase.from('produccion_tareas').insert({
      lista_id: lista.id,
      receta_id: receta_id || null,
      descripcion,
      cantidad: parseFloat(cantidad) || 1,
      prioridad: prioridad ?? tareas.length,
    })
    if (!e) fetchData()
    return { error: e }
  }

  const updateTarea = async (id, payload) => {
    const { error: e } = await supabase.from('produccion_tareas').update(payload).eq('id', id)
    if (!e) fetchData()
    return { error: e }
  }

  const deleteTarea = async (id) => {
    const { error: e } = await supabase.from('produccion_tareas').delete().eq('id', id)
    if (!e) fetchData()
    return { error: e }
  }

  // ── Completar tarea + descontar stock ───────────────────────────────────
  const completarTarea = async (tareaId, nombre, cantidadReal, notasEquipo) => {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea) return { error: { message: 'Tarea no encontrada' } }

    let descuentoDetalle = []

    // Si tiene receta vinculada → descontar stock
    if (tarea.receta_id) {
      const receta = recetas.find(r => r.id === tarea.receta_id)
      if (receta) {
        const ingredientes = mergeIngredientes(
          calcularIngredientesCrudos(receta, cantidadReal, recetas)
        )

        // Descontar cada ingrediente atómicamente
        for (const ing of ingredientes) {
          if (ing.cantidad <= 0) continue
          const { error: rpcErr } = await supabase.rpc('descontar_stock_produccion', {
            p_stock_id: ing.stock_id,
            p_cantidad: ing.cantidad,
            p_notas: `Producción: ${tarea.descripcion} (×${cantidadReal}) — ${nombre}`,
          })
          if (rpcErr) {
            console.error('Error descontando stock:', rpcErr)
            // Continuamos con los demás ingredientes
          }
          descuentoDetalle.push({
            stock_id: ing.stock_id,
            nombre: ing.nombre,
            unidad: ing.unidad,
            cantidad: ing.cantidad,
          })
        }
      }
    }

    // Marcar tarea como completada
    const { error: e } = await supabase.from('produccion_tareas').update({
      estado: 'completada',
      completada_por: nombre,
      completada_at: new Date().toISOString(),
      cantidad_real: cantidadReal,
      stock_descontado: descuentoDetalle.length > 0,
      descuento_detalle: descuentoDetalle.length > 0 ? descuentoDetalle : null,
      notas_equipo: notasEquipo || null,
    }).eq('id', tareaId)

    if (!e) fetchData()
    return { error: e }
  }

  // ── Revertir tarea (admin) ──────────────────────────────────────────────
  const revertirTarea = async (tareaId) => {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea) return { error: { message: 'Tarea no encontrada' } }

    // Devolver stock si fue descontado
    if (tarea.stock_descontado && tarea.descuento_detalle) {
      for (const det of tarea.descuento_detalle) {
        await supabase.rpc('revertir_stock_produccion', {
          p_stock_id: det.stock_id,
          p_cantidad: det.cantidad,
          p_notas: `Revertido: ${tarea.descripcion} — ${tarea.completada_por}`,
        })
      }
    }

    const { error: e } = await supabase.from('produccion_tareas').update({
      estado: 'pendiente',
      completada_por: null,
      completada_at: null,
      cantidad_real: null,
      stock_descontado: false,
      descuento_detalle: null,
      notas_equipo: null,
    }).eq('id', tareaId)

    if (!e) fetchData()
    return { error: e }
  }

  return {
    lista, tareas, recetas, subRecetas, stats,
    loading, error, fecha, setFecha,
    createLista, addTarea, updateTarea, deleteTarea,
    completarTarea, revertirTarea, fetchData,
  }
}
