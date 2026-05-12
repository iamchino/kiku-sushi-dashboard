import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export function useMenu(tipo) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
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
    const { data: created, error: e1 } = await supabase
      .from('menu_items')
      .insert({ ...itemPayload, tipo })
      .select()
      .single()
    if (e1) return e1

    // Crear variantes si las hay
    if (variantes?.length > 0) {
      const rows = variantes.map((v, i) => ({
        menu_item_id: created.id,
        nombre: v.nombre,
        piezas: parseFloat(v.piezas) || 1,
        precio: parseFloat(v.precio) || 0,
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
    const { error: e1 } = await supabase.from('menu_items').update(itemPayload).eq('id', id)
    if (e1) return e1

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
          precio: parseFloat(v.precio) || 0,
          orden: i,
        }))
        const { error: e2 } = await supabase.from('menu_item_variantes').insert(rows)
        if (e2) return e2
      }
    }

    fetchItems()
    return null
  }

  const deleteItem = async (id) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (!error) fetchItems()
    return error
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
