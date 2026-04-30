import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

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
  medio:   { label: 'Medio',   color: '#7c3aed', bg: 'rgba(124,58,237,0.06)', border: 'rgba(124,58,237,0.15)' },
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
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchStock = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('stock')
      .select('*, stock_movimientos(id, tipo, cantidad, stock_despues, notas, created_at)')
      .order('nombre')
    if (error) setError(error.message)
    else setItems(data || [])
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
  }), [items])

  // Registrar cualquier movimiento y actualizar stock_actual
  const registrarMovimiento = async ({ stockId, tipo, cantidad, notas, stockActual }) => {
    const actual = parseFloat(stockActual)
    const cant   = parseFloat(cantidad)
    const nuevo  = tipo === 'ajuste'
      ? cant
      : tipo === 'entrada'
        ? actual + cant
        : Math.max(0, actual - cant)

    const { error: e1 } = await supabase
      .from('stock').update({ stock_actual: nuevo }).eq('id', stockId)
    if (e1) return e1

    const { error: e2 } = await supabase.from('stock_movimientos').insert({
      stock_id: stockId, tipo,
      cantidad: Math.abs(cant),
      stock_antes: actual, stock_despues: nuevo,
      notas: notas || null,
    })
    if (e2) return e2
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
    items, stats, loading, error,
    fetchStock, registrarMovimiento, quickAdjust,
    updatePrecio, createItem, updateItem, deleteItem,
  }
}
