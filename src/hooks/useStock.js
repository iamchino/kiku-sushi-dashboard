import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export const CATEGORIAS_STOCK = [
  { id: 'almacen',        label: 'Almacén',          emoji: '📦' },
  { id: 'verduleria',     label: 'Verdulería',       emoji: '🥬' },
  { id: 'pescaderia',     label: 'Pescadería',       emoji: '🐟' },
  { id: 'carniceria',     label: 'Carnicería',       emoji: '🥩' },
  { id: 'bebidas',        label: 'Bebidas',          emoji: '🥤' },
  { id: 'delivery',       label: 'Delivery',         emoji: '🛵' },
  { id: 'varios',         label: 'Varios',           emoji: '🏷️' },
]

export const TIPOS_STOCK = [
  { id: 'materia_prima', label: 'Materia prima', emoji: 'MP' },
  { id: 'produccion',    label: 'Produccion',    emoji: 'PR' },
]

export const getTipoStock = (item) =>
  item?.tipo_stock === 'produccion' ? 'produccion' : 'materia_prima'

export const ESTADO_STOCK = (item) => {
  const actual  = parseFloat(item.stock_actual)
  const minimo  = parseFloat(item.stock_minimo)
  if (actual <= 0)           return 'critico'
  if (actual <= minimo)      return 'bajo'
  if (actual <= minimo * 1.5) return 'medio'
  return 'ok'
}

export const ESTADO_CONFIG = {
  critico: { label: 'Crítico', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.18)' },
  bajo:    { label: 'Bajo',    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)' },
  medio:   { label: 'Medio',   color: 'var(--accent-lift)', bg: 'rgba(var(--accent-rgb),0.06)', border: 'rgba(var(--accent-rgb),0.15)' },
  ok:      { label: 'OK',      color: '#22c55e', bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.15)' },
}

/**
 * Calcula el costo real por unidad utilizable (después de merma).
 * costo_real = precio_unitario / rendimiento
 */
export function costoReal(item) {
  const precio = parseFloat(item.precio_unitario) || 0
  const rend   = parseFloat(item.rendimiento) || 1
  if (rend <= 0) return precio
  return precio / rend
}

export function useStock() {
  const [items,   setItems]   = useState([])
  const [recetas, setRecetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchStock = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [resStock, resRecetas] = await Promise.all([
      supabase
        .from('stock')
        .select('*, stock_movimientos(id, tipo, cantidad, stock_antes, stock_despues, notas, created_at)')
        .order('nombre'),
      supabase
        .from('recetas')
        .select('id, nombre, porciones, es_subreceta')
        .order('nombre'),
    ])

    if (resStock.error) setError(resStock.error.message)
    else if (resRecetas.error) setError(resRecetas.error.message)
    else {
      const recetasData = resRecetas.data || []
      // Ordenar movimientos por fecha descendente en cada item
      const sorted = (resStock.data || []).map(item => ({
        ...item,
        tipo_stock: getTipoStock(item),
        _receta: item.receta_id
          ? recetasData.find(r => r.id === item.receta_id) || null
          : null,
        stock_movimientos: (item.stock_movimientos || [])
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      }))
      setRecetas(recetasData)
      setItems(sorted)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStock()
    const channel = supabase
      .channel('stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, fetchStock)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchStock])

  const stats = useMemo(() => ({
    criticos: items.filter(i => ESTADO_STOCK(i) === 'critico').length,
    bajos:    items.filter(i => ESTADO_STOCK(i) === 'bajo').length,
    ok:       items.filter(i => ['ok','medio'].includes(ESTADO_STOCK(i))).length,
    total:    items.length,
    materiaPrima: items.filter(i => getTipoStock(i) === 'materia_prima').length,
    produccion: items.filter(i => getTipoStock(i) === 'produccion').length,
  }), [items])

  // Helper para normalizar categoría (quitar acentos y minúsculas)
  const normalizeCat = (cat) => {
    if (!cat) return 'almacen'
    return cat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
  }

  // Items agrupados por categoría
  const grouped = useMemo(() => {
    const map = {}
    CATEGORIAS_STOCK.forEach(cat => { map[cat.id] = [] })
    items.forEach(item => {
      let catId = normalizeCat(item.categoria)
      if (!map[catId]) catId = 'almacen' // fallback
      map[catId].push(item)
    })
    return map
  }, [items])

  // Registrar cualquier movimiento y actualizar stock_actual
  const registrarMovimiento = async ({ stockId, tipo, cantidad, notas }) => {
    const { error } = await supabase.rpc('registrar_movimiento_stock', {
      p_stock_id: stockId,
      p_tipo: tipo,
      p_cantidad: parseFloat(cantidad),
      p_notas: notas || null,
    })
    if (error) return error

    fetchStock()
    return null
  }

  // Ajuste rápido (+/-)
  const quickAdjust = (item, delta) => registrarMovimiento({
    stockId:     item.id,
    tipo:        delta > 0 ? 'entrada' : 'merma',
    cantidad:    Math.abs(delta),
    notas:       `Ajuste rápido ${delta > 0 ? '+' : ''}${delta} ${item.unidad}`,
    stockActual: item.stock_actual,
  })

  // Actualización rápida de precio (inline edit)
  const updatePrecio = async (id, precio_unitario) => {
    const { error } = await supabase
      .from('stock')
      .update({ precio_unitario: parseFloat(precio_unitario) || 0 })
      .eq('id', id)
    if (!error) fetchStock()
    return error
  }

  // CRUD ingredientes
  const createItem = async (payload) => {
    const { error } = await supabase.from('stock').insert(payload)
    if (!error) fetchStock()
    return error
  }
  const updateItem = async (id, payload) => {
    const { error } = await supabase.from('stock').update(payload).eq('id', id)
    if (!error) fetchStock()
    return error
  }
  const deleteItem = async (id) => {
    const { error } = await supabase.from('stock').delete().eq('id', id)
    if (!error) fetchStock()
    return error
  }

  return {
    items, recetas, grouped, stats, loading, error,
    fetchStock, registrarMovimiento, quickAdjust,
    updatePrecio, createItem, updateItem, deleteItem,
  }
}
