import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook para gestionar recetas (BOM) y calcular costos automáticamente.
 *
 * Cada receta tiene ingredientes vinculados al stock.
 * El costo se calcula: Σ(cantidad × precio_unitario / rendimiento)
 */
export function useRecetas() {
  const [recetas,      setRecetas]      = useState([])
  const [stockItems,   setStockItems]   = useState([])
  const [menuItems,    setMenuItems]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  // ── Fetch all data ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resRecetas, resStock, resMenu] = await Promise.all([
      supabase
        .from('recetas')
        .select('*, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, precio_unitario, rendimiento))')
        .order('nombre'),
      supabase
        .from('stock')
        .select('id, nombre, unidad, precio_unitario, rendimiento')
        .order('nombre'),
      supabase
        .from('menu_items')
        .select('id, nombre, precio, tipo, categoria')
        .order('nombre'),
    ])

    if (resRecetas.error) { setError(resRecetas.error.message); setLoading(false); return }
    if (resStock.error)   { setError(resStock.error.message);   setLoading(false); return }

    setRecetas(resRecetas.data || [])
    setStockItems(resStock.data || [])
    setMenuItems(resMenu.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Cálculos derivados ────────────────────────────────────────────────────

  /**
   * Calcula el costo total de una receta (recursivo para sub-recetas).
   */
  const costoReceta = useCallback((receta, allRecetas, visited = new Set()) => {
    if (!receta || !receta.receta_ingredientes) return 0
    if (visited.has(receta.id)) return 0 // evitar recursión infinita
    
    // Clonar visited para la rama actual
    const currentVisited = new Set(visited)
    currentVisited.add(receta.id)

    return receta.receta_ingredientes.reduce((sum, ri) => {
      // 1. Es un ingrediente de stock
      if (ri.stock) {
        const precio = parseFloat(ri.stock.precio_unitario) || 0
        const rend   = parseFloat(ri.stock.rendimiento) || 1
        const cant   = parseFloat(ri.cantidad) || 0
        return sum + cant * (precio / (rend > 0 ? rend : 1))
      }
      
      // 2. Es una sub-receta
      if (ri.subreceta_id) {
        const sub = allRecetas.find(r => r.id === ri.subreceta_id)
        if (!sub) return sum

        const costTotalSub = costoReceta(sub, allRecetas, currentVisited)
        const porcionesSub = parseInt(sub.porciones) || 1
        const costPorcionSub = costTotalSub / porcionesSub
        const cantUsada = parseFloat(ri.cantidad) || 0

        return sum + (cantUsada * costPorcionSub)
      }

      return sum
    }, 0)
  }, [])

  /**
   * Extrae el precio de venta numérico del menu_item vinculado.
   */
  const precioVenta = useCallback((receta, allMenuItems) => {
    if (!receta.menu_item_id) return null
    const mi = allMenuItems.find(m => m.id === receta.menu_item_id)
    if (!mi || !mi.precio) return null
    const num = parseFloat(String(mi.precio).replace(/[^0-9.,]/g, '').replace(',', '.'))
    return isNaN(num) ? null : num
  }, [])

  // Recetas enriquecidas con cálculos
  const recetasConCostos = useMemo(() => {
    return recetas.map(r => {
      const cost = costoReceta(r, recetas)
      const porciones = parseInt(r.porciones) || 1
      const costoPorc = cost / porciones
      const pv = precioVenta(r, menuItems)
      const margen = (pv && pv > 0) ? ((pv - costoPorc) / pv) * 100 : null

      return {
        ...r,
        _costo: cost,
        _costoPorcion: costoPorc,
        _precioVenta: pv,
        _margen: margen,
        _menuItem: menuItems.find(m => m.id === r.menu_item_id) || null,
      }
    })
  }, [recetas, menuItems, costoReceta, precioVenta])

  /**
   * Expone costoIngrediente para la UI (Muestra el costo de una línea)
   */
  const costoIngrediente = useCallback((ri) => {
    if (ri.stock) {
      const precio = parseFloat(ri.stock.precio_unitario) || 0
      const rend   = parseFloat(ri.stock.rendimiento) || 1
      const cant   = parseFloat(ri.cantidad) || 0
      return cant * (precio / (rend > 0 ? rend : 1))
    }
    if (ri.subreceta_id) {
      const sub = recetasConCostos.find(r => r.id === ri.subreceta_id)
      if (!sub) return 0
      const cant = parseFloat(ri.cantidad) || 0
      return cant * sub._costoPorcion
    }
    return 0
  }, [recetasConCostos])

  // ── CRUD Recetas ──────────────────────────────────────────────────────────
  const createReceta = async ({ nombre, menu_item_id, porciones, notas, es_subreceta, ingredientes }) => {
    const { data: receta, error: e1 } = await supabase
      .from('recetas')
      .insert({
        nombre,
        menu_item_id: menu_item_id || null,
        porciones: porciones || 1,
        notas: notas || null,
        es_subreceta: !!es_subreceta
      })
      .select()
      .single()

    if (e1) return e1

    if (ingredientes?.length) {
      const rows = ingredientes.map(ing => ({
        receta_id: receta.id,
        stock_id:  ing.tipo === 'stock' ? ing.id : null,
        subreceta_id: ing.tipo === 'subreceta' ? ing.id : null,
        cantidad:  parseFloat(ing.cantidad) || 0,
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
        stock_id:  ing.tipo === 'stock' ? ing.id : null,
        subreceta_id: ing.tipo === 'subreceta' ? ing.id : null,
        cantidad:  parseFloat(ing.cantidad) || 0,
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
