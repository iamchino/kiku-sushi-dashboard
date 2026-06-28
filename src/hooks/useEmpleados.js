import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Legajo del personal. Admin-only por RLS.
export function useEmpleados() {
  const [empleados, setEmpleados] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetchEmpleados = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase
        .from('empleados')
        .select('*')
        .order('activo', { ascending: false })
        .order('nombre')
      if (e) throw e
      setEmpleados(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEmpleados() }, [fetchEmpleados])

  const crearEmpleado = useCallback(async (form) => {
    const { data, error: e } = await supabase
      .from('empleados')
      .insert([form])
      .select()
      .single()
    if (e) throw e
    setEmpleados(prev => [...prev, data])
    return data
  }, [])

  const actualizarEmpleado = useCallback(async (id, form) => {
    const { data, error: e } = await supabase
      .from('empleados')
      .update(form)
      .eq('id', id)
      .select()
      .single()
    if (e) throw e
    setEmpleados(prev => prev.map(p => p.id === id ? data : p))
    return data
  }, [])

  const eliminarEmpleado = useCallback(async (id) => {
    const { error: e } = await supabase
      .from('empleados')
      .delete()
      .eq('id', id)
    if (e) throw e
    setEmpleados(prev => prev.filter(p => p.id !== id))
  }, [])

  return {
    empleados, loading, error,
    refetch: fetchEmpleados,
    crearEmpleado, actualizarEmpleado, eliminarEmpleado,
  }
}
