import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

/**
 * useEspeciales — CRUD de los "Especiales de Kiku" de la web pública.
 * Espejo de useMenu, pero sobre las tablas `especiales` + `especial_pasos`.
 *
 * Cada especial: { slug, orden, activo, experiencia, numero, overline, titulo,
 *   titulo_acento, descripcion, precio, precio_nota, firma, imagen_url, imagen_alt,
 *   especial_pasos: [{ orden, etiqueta, texto, items: [{roll, detalle}] }] }
 */
export function useEspeciales() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('especiales')
      .select('*, especial_pasos(*)')
      .order('orden', { ascending: true })

    if (error) setError(error.message)
    else {
      const sorted = (data || []).map(item => ({
        ...item,
        especial_pasos: (item.especial_pasos || [])
          .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
      }))
      setItems(sorted)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Reemplaza todos los pasos de un especial (mismo patrón que variantes en useMenu)
  const replacePasos = async (especialId, pasos) => {
    const { error: delError } = await supabase
      .from('especial_pasos')
      .delete()
      .eq('especial_id', especialId)
    if (delError) return delError

    if (pasos?.length > 0) {
      const rows = pasos.map((p, i) => ({
        especial_id: especialId,
        orden: i,
        etiqueta: p.etiqueta,
        texto: p.texto,
        items: p.items || [],
      }))
      const { error: insError } = await supabase.from('especial_pasos').insert(rows)
      if (insError) return insError
    }
    return null
  }

  const normalizePayload = (payload) => ({
    ...payload,
    precio: payload.precio === '' || payload.precio == null
      ? null
      : Number(payload.precio),
    orden: Number(payload.orden) || 0,
  })

  const createItem = async (payload) => {
    const { pasos, ...rest } = payload
    const { data: created, error: e1 } = await supabase
      .from('especiales')
      .insert(normalizePayload(rest))
      .select()
      .single()
    if (e1) return e1

    if (pasos?.length > 0) {
      const e2 = await replacePasos(created.id, pasos)
      if (e2) return e2
    }

    fetchItems()
    return null
  }

  const updateItem = async (id, payload) => {
    const { pasos, ...rest } = payload
    const { error: e1 } = await supabase
      .from('especiales')
      .update(normalizePayload(rest))
      .eq('id', id)
    if (e1) return e1

    if (pasos !== undefined) {
      const e2 = await replacePasos(id, pasos)
      if (e2) return e2
    }

    fetchItems()
    return null
  }

  const deleteItem = async (id) => {
    const { error } = await supabase.from('especiales').delete().eq('id', id)
    if (error) return { ok: false, error }
    fetchItems()
    return { ok: true, error: null }
  }

  const toggleActive = async (id, currentValue) => {
    const { error } = await supabase
      .from('especiales')
      .update({ activo: !currentValue })
      .eq('id', id)
    if (error) return error
    fetchItems()
    return null
  }

  // Reusa el bucket existente, bajo prefijo especiales/
  const uploadImage = async (file) => {
    const ext = file.name.split('.').pop()
    const fileName = `especiales/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(fileName, file, { upsert: true, contentType: file.type })

    if (uploadError) return { url: null, error: uploadError.message }

    const { data: { publicUrl } } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName)

    return { url: publicUrl, error: null }
  }

  const stats = useMemo(() => ({
    total: items.length,
    activos: items.filter(i => i.activo).length,
    inactivos: items.filter(i => !i.activo).length,
  }), [items])

  return {
    items, stats, loading, error,
    createItem, updateItem, deleteItem, toggleActive, uploadImage,
    refetch: fetchItems,
  }
}
