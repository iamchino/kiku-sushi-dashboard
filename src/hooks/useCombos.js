import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook para gestionar combos (agrupación de recetas con cantidades).
 *
 * Cada combo tiene items que referencian recetas existentes.
 * El costo se calcula: Σ(costo_porción_receta × cantidad)
 */
export function useCombos(recetasConCostos = [], menuItems = []) {
  const [combos,  setCombos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // ── Fetch combos ──────────────────────────────────────────────────────────
  const fetchCombos = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: e } = await supabase
      .from('combos')
      .select('*, combo_items(*, recetas(id, nombre, porciones, receta_ingredientes(*, stock(id, nombre, unidad, precio_unitario, rendimiento))))')
      .order('nombre')

    if (e) { setError(e.message); setLoading(false); return }
    setCombos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCombos() }, [fetchCombos])

  // ── Cálculos de costo por receta (reutiliza la lógica de useRecetas) ─────
  const costoReceta = (receta) => {
    if (!receta?.receta_ingredientes) return 0
    return receta.receta_ingredientes.reduce((sum, ri) => {
      if (!ri.stock) return sum
      const precio = parseFloat(ri.stock.precio_unitario) || 0
      const rend   = parseFloat(ri.stock.rendimiento) || 1
      const cant   = parseFloat(ri.cantidad) || 0
      return sum + cant * (precio / (rend > 0 ? rend : 1))
    }, 0)
  }

  const costoPorcionReceta = (receta) => {
    const total = costoReceta(receta)
    const porciones = parseInt(receta?.porciones) || 1
    return total / porciones
  }

  // ── Combos enriquecidos con cálculos ──────────────────────────────────────
  const combosConCostos = useMemo(() => {
    return combos.map(combo => {
      // Calcular costo total del combo
      const costoTotal = (combo.combo_items || []).reduce((sum, item) => {
        const receta = item.recetas
        if (!receta) return sum
        const costoPorcion = costoPorcionReceta(receta)
        return sum + costoPorcion * (item.cantidad || 1)
      }, 0)

      // Buscar menu_item vinculado
      const menuItem = combo.menu_item_id
        ? menuItems.find(m => m.id === combo.menu_item_id) || null
        : null

      // Precio de venta: del combo directo o del menu_item vinculado
      let precioVenta = null
      if (combo.precio && parseFloat(combo.precio) > 0) {
        precioVenta = parseFloat(combo.precio)
      } else if (menuItem?.precio) {
        const num = parseFloat(String(menuItem.precio).replace(/[^0-9.,]/g, '').replace(',', '.'))
        precioVenta = isNaN(num) ? null : num
      }

      // Margen
      const margen = precioVenta && precioVenta > 0
        ? ((precioVenta - costoTotal) / precioVenta) * 100
        : null

      // Resumen de composición
      const resumen = (combo.combo_items || [])
        .map(item => {
          const nombre = item.recetas?.nombre || 'Desconocida'
          return `${nombre} ×${item.cantidad}`
        })
        .join(', ')

      return {
        ...combo,
        _costoTotal: costoTotal,
        _precioVenta: precioVenta,
        _margen: margen,
        _menuItem: menuItem,
        _resumen: resumen,
        _totalItems: (combo.combo_items || []).reduce((s, i) => s + (i.cantidad || 1), 0),
      }
    })
  }, [combos, menuItems])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const createCombo = async ({ nombre, menu_item_id, precio, notas, items }) => {
    // 1. Crear cabecera
    const { data: combo, error: e1 } = await supabase
      .from('combos')
      .insert({
        nombre,
        menu_item_id: menu_item_id || null,
        precio: precio ? parseFloat(precio) : null,
        notas: notas || null,
      })
      .select()
      .single()

    if (e1) return e1

    // 2. Crear items
    if (items?.length) {
      const rows = items.map(item => ({
        combo_id:  combo.id,
        receta_id: item.receta_id,
        cantidad:  parseInt(item.cantidad) || 1,
      }))
      const { error: e2 } = await supabase.from('combo_items').insert(rows)
      if (e2) return e2
    }

    fetchCombos()
    return null
  }

  const updateCombo = async (id, { nombre, menu_item_id, precio, notas, items }) => {
    // 1. Actualizar cabecera
    const { error: e1 } = await supabase
      .from('combos')
      .update({
        nombre,
        menu_item_id: menu_item_id || null,
        precio: precio ? parseFloat(precio) : null,
        notas: notas || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (e1) return e1

    // 2. Reemplazar items (delete + insert)
    const { error: e2 } = await supabase
      .from('combo_items')
      .delete()
      .eq('combo_id', id)

    if (e2) return e2

    if (items?.length) {
      const rows = items.map(item => ({
        combo_id:  id,
        receta_id: item.receta_id,
        cantidad:  parseInt(item.cantidad) || 1,
      }))
      const { error: e3 } = await supabase.from('combo_items').insert(rows)
      if (e3) return e3
    }

    fetchCombos()
    return null
  }

  const deleteCombo = async (id) => {
    const { error } = await supabase.from('combos').delete().eq('id', id)
    if (!error) fetchCombos()
    return error
  }

  return {
    combos: combosConCostos,
    loading, error,
    fetchCombos,
    createCombo, updateCombo, deleteCombo,
    costoPorcionReceta,
  }
}
