import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normTipoStock, tipoReceta, esReventa, unidadRindeCorta } from '../lib/stockNiveles'

// Opciones para la sección "Stock que descuenta" de un producto de la carta
// (ProductModal): recetas finales, producción intermedia e ítems de inventario.
// Trae las recetas con sus ingredientes para poder mostrar la vista previa de
// lo que baja (misma lógica que la base, ver stockNiveles.consumosDeVinculos).
export function useOpcionesVinculo(activo = true) {
  const [recetas, setRecetas] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    setLoading(true)
    setError(null)
    Promise.all([
      supabase
        .from('recetas')
        .select('id, nombre, tipo, es_subreceta, lleva_stock, reventa, porciones, unidad_rinde, receta_ingredientes!receta_id(stock_id, subreceta_id, cantidad)')
        .order('nombre'),
      supabase
        .from('stock')
        .select('id, nombre, unidad, tipo_stock, receta_id, stock_actual, categoria')
        .order('nombre'),
    ]).then(([resRecetas, resStock]) => {
      if (cancelado) return
      if (resRecetas.error) setError(resRecetas.error.message)
      else if (resStock.error) setError(resStock.error.message)
      else {
        setRecetas(resRecetas.data || [])
        setStockItems((resStock.data || []).map(s => ({ ...s, tipo_stock: normTipoStock(s) })))
      }
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [activo])

  // Grupos para el Buscador. El valor codifica el destino: "receta:<id>" o "stock:<id>".
  const grupos = useMemo(() => {
    const finales = recetas.filter(r => tipoReceta(r) === 'final')
    const intermedias = recetas.filter(r => tipoReceta(r) !== 'final')
    // Inventario: solo lo que se compra. Lo producido (ítem de una receta) se
    // vincula por la receta, así el descuento sigue LA REGLA.
    const inventario = stockItems.filter(s => !s.receta_id)
    return [
      { label: 'Productos finales', opciones: finales.map(r => ({
          value: `receta:${r.id}`, label: r.nombre,
          detalle: esReventa(r) ? 'reventa' : `rinde ${r.porciones || 1} ${unidadRindeCorta(r)}`,
        })) },
      { label: 'Producción intermedia', opciones: intermedias.map(r => ({
          value: `receta:${r.id}`, label: r.nombre,
          detalle: tipoReceta(r) === 'servicio' ? 'roll de servicio' : unidadRindeCorta(r),
        })) },
      { label: 'Inventario (bebidas, reventa, insumos)', opciones: inventario.map(s => ({
          value: `stock:${s.id}`, label: s.nombre, detalle: s.unidad || '',
        })) },
    ]
  }, [recetas, stockItems])

  return { recetas, stockItems, grupos, loading, error }
}

// Vínculos guardados de un producto.
export function useVinculosDeProducto(menuItemId) {
  const [vinculos, setVinculos] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchVinculos = useCallback(async () => {
    setVinculos([])   // que no queden los del producto anterior mientras carga
    if (!menuItemId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('menu_item_stock_vinculos')
      .select('id, menu_item_id, variante_id, receta_id, stock_id, cantidad, orden')
      .eq('menu_item_id', menuItemId)
      .order('orden')
    // Si la tabla todavía no existe (SQL 48 sin correr) se muestra vacío y
    // el guardado avisa con el error real.
    setVinculos(error ? [] : (data || []))
    setLoading(false)
  }, [menuItemId])

  useEffect(() => { fetchVinculos() }, [fetchVinculos])

  return { vinculos, loading, refetch: fetchVinculos }
}

// Codificación del destino en el buscador.
export const destinoDeVinculo = (v) => v.receta_id ? `receta:${v.receta_id}` : v.stock_id ? `stock:${v.stock_id}` : ''
export const vinculoDeDestino = (destino) => {
  const [tipo, id] = String(destino || '').split(':')
  if (!id) return { receta_id: null, stock_id: null }
  return tipo === 'stock' ? { receta_id: null, stock_id: id } : { receta_id: id, stock_id: null }
}
