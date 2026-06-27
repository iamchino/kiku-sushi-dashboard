import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseCurrencyValue } from '../lib/orders'

export function useMenu(tipo) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
    // Sin tipo (ej: el tab Especiales usa su propio hook) → no consultar.
    if (!tipo) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('menu_items')
      .select('*, menu_item_variantes(*)')
      .eq('tipo', tipo)
      .order('orden', { ascending: true })

    if (error) setError(error.message)
    else {
      // Ordenar variantes por orden dentro de cada item
      const sorted = (data || []).map(item => ({
        ...item,
        menu_item_variantes: (item.menu_item_variantes || [])
          .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
      }))
      setItems(sorted)
    }
    setLoading(false)
  }, [tipo])

  useEffect(() => { fetchItems() }, [fetchItems])

  // CRUD items
  const createItem = async (payload) => {
    const { variantes, ...itemPayload } = payload
    const itemToInsert = {
      ...itemPayload,
      precio: itemPayload.precio ? parseCurrencyValue(itemPayload.precio) : null,
    }
    let { data: created, error: e1 } = await supabase
      .from('menu_items')
      .insert({ ...itemToInsert, tipo })
      .select()
      .single()
    // Tolerancia: si falta la columna solo_salon (migración no aplicada), reintenta sin ella.
    if (e1 && /solo_salon/i.test(e1.message || '')) {
      const { solo_salon, ...sinSoloSalon } = itemToInsert
      void solo_salon
      const retry = await supabase.from('menu_items').insert({ ...sinSoloSalon, tipo }).select().single()
      created = retry.data
      e1 = retry.error
    }
    if (e1) return e1

    // Crear variantes si las hay
    if (variantes?.length > 0) {
      const rows = variantes.map((v, i) => ({
        menu_item_id: created.id,
        nombre: v.nombre,
        piezas: parseFloat(v.piezas) || 1,
        precio: parseCurrencyValue(v.precio),
        orden: i,
      }))
      const { error: e2 } = await supabase.from('menu_item_variantes').insert(rows)
      if (e2) return e2
    }

    fetchItems()
    return null
  }

  const updateItem = async (id, payload) => {
    const { variantes, ...itemPayload } = payload
    const itemToUpdate = {
      ...itemPayload,
      precio: itemPayload.precio ? parseCurrencyValue(itemPayload.precio) : null,
    }
    let { error: e1 } = await supabase.from('menu_items').update(itemToUpdate).eq('id', id)
    if (e1 && /solo_salon/i.test(e1.message || '')) {
      const { solo_salon, ...sinSoloSalon } = itemToUpdate
      void solo_salon
      const retry = await supabase.from('menu_items').update(sinSoloSalon).eq('id', id)
      e1 = retry.error
    }
    if (e1) return e1

    // La sincronización de precio con los especiales vinculados (botón "Pedir")
    // la resuelven los triggers de Supabase (migración
    // 20260627000000_sync_precio_especial_producto.sql), que manejan bien el
    // tipo TEXT del precio y cubren todos los caminos (incluido el ajuste masivo).

    // Si se enviaron variantes, reemplazar todas
    if (variantes !== undefined) {
      // Borrar las anteriores
      const { error: deleteError } = await supabase
        .from('menu_item_variantes')
        .delete()
        .eq('menu_item_id', id)
      if (deleteError) return deleteError

      // Insertar las nuevas
      if (variantes?.length > 0) {
        const rows = variantes.map((v, i) => ({
          menu_item_id: id,
          nombre: v.nombre,
          piezas: parseFloat(v.piezas) || 1,
          precio: parseCurrencyValue(v.precio),
          orden: i,
        }))
        const { error: e2 } = await supabase.from('menu_item_variantes').insert(rows)
        if (e2) return e2
      }
    }

    fetchItems()
    return null
  }

  // Borrado inteligente:
  // 1) Intenta borrar el producto de verdad.
  // 2) Si el producto ya fue usado en algún pedido, la base de datos lo bloquea
  //    (FK violation, código 23503) para no romper el historial de ventas.
  //    En ese caso lo OCULTAMOS (activo = false) en lugar de borrarlo.
  // Devuelve un objeto: { ok, hidden, error }
  //   - { ok: true,  hidden: false } → se borró de verdad (no tenía ventas)
  //   - { ok: true,  hidden: true  } → se ocultó porque tenía ventas
  //   - { ok: false, error }         → falló por otro motivo
  const deleteItem = async (id) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id)

    if (!error) {
      fetchItems()
      return { ok: true, hidden: false, error: null }
    }

    // 23503 = foreign_key_violation → el producto está referenciado en pedidos
    if (error.code === '23503') {
      const { error: hideError } = await supabase
        .from('menu_items')
        .update({ activo: false })
        .eq('id', id)

      if (!hideError) {
        fetchItems()
        return { ok: true, hidden: true, error: null }
      }
      return { ok: false, hidden: false, error: hideError }
    }

    return { ok: false, hidden: false, error }
  }

  const toggleActive = async (id, currentValue) => {
    return updateItem(id, { activo: !currentValue })
  }

  // Supabase Storage upload
  const uploadImage = async (file) => {
    const ext = file.name.split('.').pop()
    const fileName = `${tipo}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(fileName, file, { upsert: true, contentType: file.type })

    if (uploadError) return { url: null, error: uploadError.message }

    const { data: { publicUrl } } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName)

    return { url: publicUrl, error: null }
  }

  // Derived: items grouped by category
  const grouped = useMemo(() => {
    const map = {}
    items.forEach(item => {
      if (!map[item.categoria]) {
        map[item.categoria] = { subtitle: item.subtitulo, items: [] }
      }
      map[item.categoria].items.push(item)
    })
    return map
  }, [items])

  // Unique categories (for datalist suggestions in form)
  const categories = useMemo(() => [...new Set(items.map(i => i.categoria))], [items])

  const stats = useMemo(() => ({
    total: items.length,
    activos: items.filter(i => i.activo).length,
    inactivos: items.filter(i => !i.activo).length,
  }), [items])

  return {
    items, grouped, categories, stats,
    loading, error,
    createItem, updateItem, deleteItem, toggleActive, uploadImage,
    refetch: fetchItems,
  }
}
