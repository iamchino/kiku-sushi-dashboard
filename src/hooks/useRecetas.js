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
        .select('*, receta_ingredientes(*, stock(id, nombre, unidad, precio_unitario, rendimiento))')
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
   * Calcula el costo de un ingrediente dentro de una receta.
   * costo = cantidad × (precio_unitario / rendimiento)
   */
  const costoIngrediente = (ri) => {
    if (!ri.stock) return 0
    const precio = parseFloat(ri.stock.precio_unitario) || 0
    const rend   = parseFloat(ri.stock.rendimiento) || 1
    const cant   = parseFloat(ri.cantidad) || 0
    return cant * (precio / (rend > 0 ? rend : 1))
  }

  /**
   * Calcula el costo total de una receta.
   */
  const costoReceta = (receta) => {
    if (!receta.receta_ingredientes) return 0
    return receta.receta_ingredientes.reduce((sum, ri) => sum + costoIngrediente(ri), 0)
  }

  /**
   * Calcula el costo por porción.
   */
  const costoPorcion = (receta) => {
    const total = costoReceta(receta)
    const porciones = parseInt(receta.porciones) || 1
    return total / porciones
  }

  /**
   * Extrae el precio de venta numérico del menu_item vinculado.
   * Los precios en menu_items pueden estar como "$2500" o "2500".
   */
  const precioVenta = (receta) => {
    if (!receta.menu_item_id) return null
    const mi = menuItems.find(m => m.id === receta.menu_item_id)
    if (!mi || !mi.precio) return null
    const num = parseFloat(String(mi.precio).replace(/[^0-9.,]/g, '').replace(',', '.'))
    return isNaN(num) ? null : num
  }

  /**
   * Calcula el margen de ganancia (%).
   * margen = (precio_venta - costo) / precio_venta * 100
   */
  const margenReceta = (receta) => {
    const pv = precioVenta(receta)
    if (!pv || pv <= 0) return null
    const costo = costoPorcion(receta)
    return ((pv - costo) / pv) * 100
  }

  // Recetas enriquecidas con cálculos
  const recetasConCostos = useMemo(() => {
    return recetas.map(r => ({
      ...r,
      _costo:      costoReceta(r),
      _costoPorcion: costoPorcion(r),
      _precioVenta: precioVenta(r),
      _margen:     margenReceta(r),
      _menuItem:   menuItems.find(m => m.id === r.menu_item_id) || null,
    }))
  }, [recetas, menuItems])

  // ── CRUD Recetas ──────────────────────────────────────────────────────────
  const createReceta = async ({ nombre, menu_item_id, porciones, notas, ingredientes }) => {
    // 1. Crear cabecera
    const { data: receta, error: e1 } = await supabase
      .from('recetas')
      .insert({
        nombre,
        menu_item_id: menu_item_id || null,
        porciones: porciones || 1,
        notas: notas || null,
      })
      .select()
      .single()

    if (e1) return e1

    // 2. Crear ingredientes
    if (ingredientes?.length) {
      const rows = ingredientes.map(ing => ({
        receta_id: receta.id,
        stock_id:  ing.stock_id,
        cantidad:  parseFloat(ing.cantidad) || 0,
      }))
      const { error: e2 } = await supabase.from('receta_ingredientes').insert(rows)
      if (e2) return e2
    }

    fetchAll()
    return null
  }

  const updateReceta = async (id, { nombre, menu_item_id, porciones, notas, ingredientes }) => {
    // 1. Actualizar cabecera
    const { error: e1 } = await supabase
      .from('recetas')
      .update({
        nombre,
        menu_item_id: menu_item_id || null,
        porciones: porciones || 1,
        notas: notas || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (e1) return e1

    // 2. Reemplazar ingredientes (delete + insert)
    const { error: e2 } = await supabase
      .from('receta_ingredientes')
      .delete()
      .eq('receta_id', id)

    if (e2) return e2

    if (ingredientes?.length) {
      const rows = ingredientes.map(ing => ({
        receta_id: id,
        stock_id:  ing.stock_id,
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
