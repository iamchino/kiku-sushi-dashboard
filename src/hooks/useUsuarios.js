import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Gestión de logins del sistema vía la Edge Function `admin-usuarios`.
// Solo funciona para el usuario de Finanzas (la función valida en el backend).
async function invocar(body) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (error) {
    // supabase-js envuelve los errores HTTP; intentamos leer el mensaje real.
    let msg = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) msg = ctx.error
    } catch { /* usamos el mensaje genérico */ }
    throw new Error(msg)
  }
  if (data && data.ok === false) throw new Error(data.error || 'Error desconocido')
  return data
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchUsuarios = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await invocar({ action: 'listar' })
      setUsuarios(data?.usuarios || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

  // Crea el login y, si se indica un empleado, lo vincula (empleados.user_id).
  const crearUsuario = useCallback(async ({ email, password, role, empleado_id }) => {
    const data = await invocar({ action: 'crear', email, password, role })
    const userId = data?.user?.id
    if (userId && empleado_id) {
      const { error: e } = await supabase
        .from('empleados')
        .update({ user_id: userId })
        .eq('id', empleado_id)
      if (e) throw new Error(`Usuario creado, pero falló el vínculo: ${e.message}`)
    }
    await fetchUsuarios()
    return data?.user
  }, [fetchUsuarios])

  const eliminarUsuario = useCallback(async (userId) => {
    await invocar({ action: 'eliminar', user_id: userId })
    await fetchUsuarios()
  }, [fetchUsuarios])

  const cambiarPassword = useCallback(async (userId, password) => {
    await invocar({ action: 'password', user_id: userId, password })
  }, [])

  // Vincular/desvincular un login a una fila de empleados (directo por RLS).
  const vincularEmpleado = useCallback(async (empleadoId, userId) => {
    if (userId) {
      // un login solo puede estar vinculado a un empleado: limpiamos vínculos previos
      const { error: e0 } = await supabase
        .from('empleados')
        .update({ user_id: null })
        .eq('user_id', userId)
      if (e0) throw e0
    }
    const { error: e } = await supabase
      .from('empleados')
      .update({ user_id: userId })
      .eq('id', empleadoId)
    if (e) throw e
    await fetchUsuarios()
  }, [fetchUsuarios])

  return { usuarios, loading, error, refetch: fetchUsuarios, crearUsuario, eliminarUsuario, cambiarPassword, vincularEmpleado }
}
