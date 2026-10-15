import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { costoStockUnitario } from './useRecetas'
import { precioVentaDe } from '../utils/precio'

/**
 * Hook para gestionar combos (agrupación de recetas con cantidades).
 *
 * Cada combo tiene items que referencian recetas existentes.
 * El costo se calcula: Σ(costo_porción_receta × cantidad)
 */
// Unidades de receta que representa un ítem del combo: si tiene
// piezas_por_unidad, la cantidad está en piezas (3 piezas de un roll de 10
// = 0,3 rolls). Si no, la cantidad ya son unidades de la receta.
export function unidadesDeItem(item) {
  const cant = parseFloat(item?.cantidad) || 0
  const ppu = parseFloat(item?.piezas_por_unidad)
  return ppu > 0 ? cant / ppu : cant
}

const COLS_NUEVAS = ['piezas_por_unidad']
const sinColumnaNueva = (err) =>
  err && COLS_NUEVAS.find(c => new RegExp(`\\b${c}\\b`).test(err.message || ''))

function filasItems(comboId, items) {
  return items.map(item => {
    const ppu = parseFloat(item.piezas_por_unidad)
    return {
      combo_id:  comboId,
      receta_id: item.receta_id,
      cantidad:  parseFloat(item.cantidad) || 1,
      piezas_por_unidad: ppu > 0 ? ppu : null,
    }
  })
}

// Inserta los ítems; si la base no tiene la columna nueva (SQL 44 sin
// correr), los guarda sin ella (cantidad en unidades, como antes).
async function insertarItems(comboId, items) {
  let rows = filasItems(comboId, items)
  let { error } = await supabase.from('combo_items').insert(rows)
  if (sinColumnaNueva(error)) {
    rows = rows.map(r => { const resto = { ...r }; delete resto.piezas_por_unidad; return resto })
    ;({ error } = await supabase.from('combo_items').insert(rows))
  }
  return error
}

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
      .select('*, combo_items(*, recetas(id, nombre, porciones, receta_ingredientes!receta_id(*, stock(id, nombre, unidad, precio_unitario, rendimiento, tipo_stock, receta_id))))')
      .order('nombre')

    if (e) { setError(e.message); setLoading(false); return }
    setCombos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCombos() }, [fetchCombos])

  // ── Cálculos de costo por receta (reutiliza la lógica de useRecetas) ─────
  const costoReceta = useCallback((receta) => {
    if (!receta?.receta_ingredientes) return 0
    return receta.receta_ingredientes.reduce((sum, ri) => {
      if (!ri.stock) return sum
      const cant   = parseFloat(ri.cantidad) || 0
      return sum + cant * costoStockUnitario(ri.stock, recetasConCostos)
    }, 0)
  }, [recetasConCostos])

  const costoPorcionReceta = useCallback((receta) => {
    const recetaConCostos = recetasConCostos.find(r => r.id === receta?.id)
    if (recetaConCostos?._costoPorcion !== undefined) return recetaConCostos._costoPorcion

    const total = costoReceta(receta)
    const porciones = parseFloat(receta?.porciones) || 1
    return total / porciones
  }, [costoReceta, recetasConCostos])

  // ── Combos enriquecidos con cálculos ──────────────────────────────────────
  const combosConCostos = useMemo(() => {
    return combos.map(combo => {
      const comboItemsConCostos = (combo.combo_items || []).map(item => {
        const receta = item.recetas
        const costoPorcion = receta ? costoPorcionReceta(receta) : 0
        const costoTotalLinea = costoPorcion * unidadesDeItem(item)
        return { ...item, _costoUnitario: costoPorcion, _costoTotalLinea: costoTotalLinea }
      })

      // Calcular costo total del combo
      const costoTotal = comboItemsConCostos.reduce((sum, item) =>
        sum + (item._costoTotalLinea || 0),
      0)

      // Buscar menu_item vinculado
      const menuItem = combo.menu_item_id
        ? menuItems.find(m => m.id === combo.menu_item_id) || null
        : null

      // Precio de venta: del combo directo o del menu_item vinculado
      let precioVenta = null
      if (combo.precio && parseFloat(combo.precio) > 0) {
        precioVenta = parseFloat(combo.precio)
      } else if (menuItem) {
        precioVenta = precioVentaDe(menuItem)
      }

      // Margen
      const margen = precioVenta && precioVenta > 0
        ? ((precioVenta - costoTotal) / precioVenta) * 100
        : null

      // Resumen de composición
      const resumen = (combo.combo_items || [])
        .map(item => {
          const nombre = item.recetas?.nombre || 'Desconocida'
          return `${nombre} ×${item.cantidad}${parseFloat(item.piezas_por_unidad) > 0 ? ' pzas' : ''}`
        })
        .join(', ')

      return {
        ...combo,
        combo_items: comboItemsConCostos,
        _costoTotal: costoTotal,
        _precioVenta: precioVenta,
        _margen: margen,
        _menuItem: menuItem,
        _resumen: resumen,
        _totalItems: (combo.combo_items || []).reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0),
      }
    })
  }, [combos, menuItems, costoPorcionReceta])

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
      const e2 = await insertarItems(combo.id, items)
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
      const e3 = await insertarItems(id, items)
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
