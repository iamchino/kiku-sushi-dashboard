import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export function costoStockUnitario(stock, allRecetas = [], visited = new Set()) {
  if (stock?.tipo_stock === 'produccion' && stock.receta_id && !visited.has(stock.receta_id)) {
    const recetaProduccion = allRecetas.find(r => r.id === stock.receta_id)
    if (recetaProduccion) {
      const total = costoRecetaTotal(recetaProduccion, allRecetas, visited)
      const porciones = parseFloat(recetaProduccion.porciones) || 1
      if (total > 0) return total / porciones
    }
  }

  const precio = parseFloat(stock?.precio_unitario) || 0
  const rend = parseFloat(stock?.rendimiento) || 1
  return rend > 0 ? precio / rend : precio
}

export function costoRecetaTotal(receta, allRecetas = [], visited = new Set()) {
  if (!receta || !receta.receta_ingredientes) return 0
  if (visited.has(receta.id)) return 0

  const currentVisited = new Set(visited)
  currentVisited.add(receta.id)

  return receta.receta_ingredientes.reduce((sum, ri) => {
    const cant = parseFloat(ri.cantidad) || 0

    if (ri.stock) {
      return sum + cant * costoStockUnitario(ri.stock, allRecetas, currentVisited)
    }

    if (ri.subreceta_id) {
      const sub = allRecetas.find(r => r.id === ri.subreceta_id)
      if (!sub) return sum

      const costTotalSub = costoRecetaTotal(sub, allRecetas, currentVisited)
      const porcionesSub = parseFloat(sub.porciones) || 1
      return sum + cant * (costTotalSub / porcionesSub)
    }

    return sum
  }, 0)
}

function parsePrecioVenta(menuItem) {
  if (!menuItem?.precio) return null
  const num = parseFloat(String(menuItem.precio).replace(/[^0-9.,]/g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

export function useRecetas() {
  const [recetas, setRecetas] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resRecetas, resStock, resMenu] = await Promise.all([
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, precio_unitario, rendimiento, tipo_stock, receta_id, stock_actual, stock_minimo))')
        .order('nombre'),
      supabase
        .from('stock')
        .select('id, nombre, unidad, precio_unitario, rendimiento, tipo_stock, receta_id, stock_actual, stock_minimo')
        .order('nombre'),
      supabase
        .from('menu_items')
        .select('id, nombre, precio, tipo, categoria, menu_item_variantes(*)')
        .order('nombre'),
    ])

    if (resRecetas.error) { setError(resRecetas.error.message); setLoading(false); return }
    if (resStock.error) { setError(resStock.error.message); setLoading(false); return }

    setRecetas(resRecetas.data || [])
    setStockItems((resStock.data || []).map(item => ({
      ...item,
      tipo_stock: item.tipo_stock === 'produccion' ? 'produccion' : 'materia_prima',
    })))
    setMenuItems(resMenu.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const costoReceta = useCallback((receta, allRecetas) =>
    costoRecetaTotal(receta, allRecetas),
  [])

  const precioVenta = useCallback((receta, allMenuItems) => {
    if (!receta.menu_item_id) return null
    const mi = allMenuItems.find(m => m.id === receta.menu_item_id)
    return parsePrecioVenta(mi)
  }, [])

  const recetasConCostos = useMemo(() => {
    return recetas.map(r => {
      const cost = costoReceta(r, recetas)
      const porciones = parseFloat(r.porciones) || 1
      const costoPorc = cost / porciones
      const pv = precioVenta(r, menuItems)
      const margen = (pv && pv > 0) ? ((pv - costoPorc) / pv) * 100 : null
      const mi = menuItems.find(m => m.id === r.menu_item_id) || null
      const variantes = mi?.menu_item_variantes || []

      const ingredientesConCostos = (r.receta_ingredientes || []).map(ri => {
        let costo = 0
        if (ri.stock) {
          costo = (parseFloat(ri.cantidad) || 0) * costoStockUnitario(ri.stock, recetas)
        } else if (ri.subreceta_id) {
          const sub = recetas.find(rec => rec.id === ri.subreceta_id)
          if (sub) {
            const totalSub = costoReceta(sub, recetas)
            const porcionesSub = parseFloat(sub.porciones) || 1
            costo = (parseFloat(ri.cantidad) || 0) * (totalSub / porcionesSub)
          }
        }
        return { ...ri, _costo: costo }
      })

      const margenVariantes = variantes.map(v => {
        const precioVar = parseFloat(v.precio) || 0
        const piezasVar = parseFloat(v.piezas) || 1
        const costoVar = costoPorc * piezasVar
        const margenVar = precioVar > 0 ? ((precioVar - costoVar) / precioVar) * 100 : null
        return {
          id: v.id,
          nombre: v.nombre,
          piezas: piezasVar,
          precio: precioVar,
          costo: costoVar,
          margen: margenVar,
        }
      })

      return {
        ...r,
        receta_ingredientes: ingredientesConCostos,
        _costo: cost,
        _costoPorcion: costoPorc,
        _precioVenta: pv,
        _margen: margenVariantes.length > 0 ? (margenVariantes[0]?.margen ?? margen) : margen,
        _margenVariantes: margenVariantes,
        _menuItem: mi,
      }
    })
  }, [recetas, menuItems, costoReceta, precioVenta])

  const costoIngrediente = useCallback((ri) => {
    if (ri.stock) {
      const cant = parseFloat(ri.cantidad) || 0
      return cant * costoStockUnitario(ri.stock, recetas)
    }
    if (ri.subreceta_id) {
      const sub = recetasConCostos.find(r => r.id === ri.subreceta_id)
      if (!sub) return 0
      const cant = parseFloat(ri.cantidad) || 0
      return cant * sub._costoPorcion
    }
    return 0
  }, [recetas, recetasConCostos])

  const createReceta = async ({ nombre, menu_item_id, porciones, notas, es_subreceta, ingredientes }) => {
    const { data: receta, error: e1 } = await supabase
      .from('recetas')
      .insert({
        nombre,
        menu_item_id: menu_item_id || null,
        porciones: porciones || 1,
        notas: notas || null,
        es_subreceta: !!es_subreceta,
      })
      .select()
      .single()

    if (e1) return e1

    if (ingredientes?.length) {
      const rows = ingredientes.map(ing => ({
        receta_id: receta.id,
        stock_id: ing.tipo === 'stock' ? ing.id : null,
        subreceta_id: ing.tipo === 'subreceta' ? ing.id : null,
        cantidad: parseFloat(ing.cantidad) || 0,
      }))
      const { error: e2 } = await supabase.from('receta_ingredientes').insert(rows)
      if (e2) return e2
    }

    fetchAll()
    return null
  }

  const updateReceta = async (id, { nombre, menu_item_id, porciones, notas, es_subreceta, ingredientes }) => {
    const { error: e1 } = await supabase
      .from('recetas')
      .update({
        nombre,
        menu_item_id: menu_item_id || null,
        porciones: porciones || 1,
        notas: notas || null,
        es_subreceta: !!es_subreceta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (e1) return e1

    const { error: e2 } = await supabase.from('receta_ingredientes').delete().eq('receta_id', id)
    if (e2) return e2

    if (ingredientes?.length) {
      const rows = ingredientes.map(ing => ({
        receta_id: id,
        stock_id: ing.tipo === 'stock' ? ing.id : null,
        subreceta_id: ing.tipo === 'subreceta' ? ing.id : null,
        cantidad: parseFloat(ing.cantidad) || 0,
      }))
      const { error: e3 } = await supabase.from('receta_ingredientes').insert(rows)
      if (e3) return e3
    }

    fetchAll()
    return null
  }

  const deleteReceta = async (id) => {
    const { error } = await supabase.from('recetas').delete().eq('id', id)
    if (!error) fetchAll()
    return error
  }

  return {
    recetas: recetasConCostos,
    stockItems,
    menuItems,
    loading, error,
    fetchAll,
    createReceta, updateReceta, deleteReceta,
    costoIngrediente,
  }
}
