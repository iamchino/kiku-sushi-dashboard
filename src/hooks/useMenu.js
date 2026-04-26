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
      .select('*')
      .eq('tipo', tipo)
      .order('orden', { ascending: true })

    if (error) setError(error.message)
    else setItems(data || [])
    setLoading(false)
  }, [tipo])

  useEffect(() => { fetchItems() }, [fetchItems])

  // CRUD
  const createItem = async (payload) => {
    const { error } = await supabase.from('menu_items').insert({ ...payload, tipo })
    if (!error) fetchItems()
    return error
  }

  const updateItem = async (id, payload) => {
    const { error } = await supabase.from('menu_items').update(payload).eq('id', id)
    if (!error) fetchItems()
    return error
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
