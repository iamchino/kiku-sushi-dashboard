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
  critico: { label: 'Crítico', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
  bajo:    { label: 'Bajo',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)'   },
  medio:   { label: 'Medio',   color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',border: 'rgba(124,58,237,0.2)'   },
  ok:      { label: 'OK',      color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)'  },
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
      ? cant                             // valor exacto (conteo físico)
      : tipo === 'entrada'
        ? actual + cant                  // suma
        : Math.max(0, actual - cant)     // resta (salida / merma)

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
    createItem, updateItem, deleteItem,
  }
}
