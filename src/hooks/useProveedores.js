import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const fetchProveedores = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase
        .from('proveedores')
        .select('*')
        .order('razon_social')
      if (e) throw e
      setProveedores(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProveedores() }, [fetchProveedores])

  const crearProveedor = useCallback(async (form) => {
    const { data, error: e } = await supabase
      .from('proveedores')
      .insert([form])
      .select()
      .single()
    if (e) throw e
    setProveedores(prev => [...prev, data].sort((a, b) => a.razon_social.localeCompare(b.razon_social)))
    return data
  }, [])

  const actualizarProveedor = useCallback(async (id, form) => {
    const { data, error: e } = await supabase
      .from('proveedores')
      .update(form)
      .eq('id', id)
      .select()
      .single()
    if (e) throw e
    setProveedores(prev =>
      prev.map(p => p.id === id ? data : p)
          .sort((a, b) => a.razon_social.localeCompare(b.razon_social))
    )
    return data
  }, [])

  const eliminarProveedor = useCallback(async (id) => {
    const { error: e } = await supabase
      .from('proveedores')
      .delete()
      .eq('id', id)
    if (e) throw e
    setProveedores(prev => prev.filter(p => p.id !== id))
  }, [])

  return {
    proveedores, loading, error,
    refetch: fetchProveedores,
    crearProveedor, actualizarProveedor, eliminarProveedor,
  }
}
