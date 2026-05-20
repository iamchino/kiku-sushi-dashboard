import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export function calcularIngredientesCrudos(receta, cantidadPorciones, allRecetas, visited = new Set()) {
  if (!receta || visited.has(receta.id)) return []

  const newVisited = new Set(visited)
  newVisited.add(receta.id)

  const porciones = parseFloat(receta.porciones) || 1
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
        tipo_stock: ri.stock.tipo_stock === 'produccion' ? 'produccion' : 'materia_prima',
      })
    } else if (ri.subreceta_id) {
      const sub = allRecetas.find(r => r.id === ri.subreceta_id)
      if (sub) result.push(...calcularIngredientesCrudos(sub, cant * factor, allRecetas, newVisited))
    }
  }

  return result
}

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

export function useProduccion() {
  const [lista, setLista] = useState(null)
  const [tareas, setTareas] = useState([])
  const [recetas, setRecetas] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resLista, resRecetas, resStock] = await Promise.all([
      supabase
        .from('produccion_listas')
        .select('*, produccion_tareas(*)')
        .eq('fecha', fecha)
        .maybeSingle(),
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, stock_actual, stock_minimo, precio_unitario, rendimiento, tipo_stock, receta_id))')
        .order('nombre'),
      supabase
        .from('stock')
        .select('id, nombre, unidad, stock_actual, stock_minimo, tipo_stock, receta_id')
        .order('nombre'),
    ])

    if (resLista.error) { setError(resLista.error.message); setLoading(false); return }
    if (resRecetas.error) { setError(resRecetas.error.message); setLoading(false); return }
    if (resStock.error) { setError(resStock.error.message); setLoading(false); return }

    setLista(resLista.data || null)
    setTareas((resLista.data?.produccion_tareas || [])
      .sort((a, b) => (a.prioridad || 0) - (b.prioridad || 0)))
    setRecetas(resRecetas.data || [])
    setStockItems((resStock.data || []).map(item => ({
      ...item,
      tipo_stock: item.tipo_stock === 'produccion' ? 'produccion' : 'materia_prima',
    })))
    setLoading(false)
  }, [fecha])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('produccion-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produccion_listas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produccion_tareas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, fetchData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchData])

  const stats = useMemo(() => {
    const total = tareas.length
    const completadas = tareas.filter(t => t.estado === 'completada').length
    const pendientes = tareas.filter(t => t.estado === 'pendiente').length
    const enProgreso = tareas.filter(t => t.estado === 'en_progreso').length
    return { total, completadas, pendientes, enProgreso, porcentaje: total ? Math.round((completadas / total) * 100) : 0 }
  }, [tareas])

  const subRecetas = useMemo(() =>
    recetas
      .filter(r => r.es_subreceta || stockItems.some(s => s.tipo_stock === 'produccion' && s.receta_id === r.id))
      .map(r => ({
        ...r,
        _stockProduccion: stockItems.find(s => s.tipo_stock === 'produccion' && s.receta_id === r.id) || null,
      })),
  [recetas, stockItems])

  const createLista = async (fechaLista, titulo, notas) => {
    const { data: session } = await supabase.auth.getSession()
    const { data, error: e } = await supabase
      .from('produccion_listas')
      .insert({
        fecha: fechaLista || fecha,
        titulo: titulo || `Produccion ${new Date(fechaLista || fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}`,
        notas: notas || null,
        creado_por: session?.session?.user?.id || null,
      })
      .select()
      .single()
    if (e) return { error: e }
    setLista(data)
    return { data }
  }

  const addTarea = async ({ receta_id, descripcion, cantidad, prioridad }) => {
    if (!lista) return { error: { message: 'No hay lista creada para este dia.' } }
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

  const completarTarea = async (tareaId, nombre, cantidadReal, notasEquipo) => {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea) return { error: { message: 'Tarea no encontrada' } }

    const receta = recetas.find(r => r.id === tarea.receta_id) || null
    const consumos = receta
      ? mergeIngredientes(calcularIngredientesCrudos(receta, cantidadReal, recetas))
          .filter(ing => ing.cantidad > 0)
          .map(ing => ({
            stock_id: ing.stock_id,
            nombre: ing.nombre,
            unidad: ing.unidad,
            cantidad: ing.cantidad,
          }))
      : []

    const stockProduccion = stockItems.find(s =>
      s.tipo_stock === 'produccion' && s.receta_id === tarea.receta_id
    )

    const { error: e } = await supabase.rpc('completar_tarea_produccion', {
      p_tarea_id: tareaId,
      p_completada_por: nombre,
      p_cantidad_real: parseFloat(cantidadReal) || 0,
      p_notas_equipo: notasEquipo || null,
      p_consumos: consumos,
      p_produccion_stock_id: stockProduccion?.id || null,
      p_produccion_cantidad: stockProduccion ? (parseFloat(cantidadReal) || 0) : null,
    })

    if (!e) fetchData()
    return { error: e }
  }

  const revertirTarea = async (tareaId) => {
    const tarea = tareas.find(t => t.id === tareaId)
    if (!tarea) return { error: { message: 'Tarea no encontrada' } }

    const { error: e } = await supabase.rpc('revertir_tarea_produccion', {
      p_tarea_id: tareaId,
    })

    if (!e) fetchData()
    return { error: e }
  }

  return {
    lista, tareas, recetas, stockItems, subRecetas, stats,
    loading, error, fecha, setFecha,
    createLista, addTarea, updateTarea, deleteTarea,
    completarTarea, revertirTarea, fetchData,
  }
}
