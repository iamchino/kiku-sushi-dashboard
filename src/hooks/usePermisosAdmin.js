import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Administración de la matriz de permisos (Personal → Permisos).
// Todo lo que escribe pasa por RPC, nunca por updates sueltos: el trigger
// anti-lockout de la base es diferido y necesita ver el estado final de la
// transacción, no los pasos intermedios.
export function usePermisosAdmin() {
  const [roles, setRoles]         = useState([])
  const [recursos, setRecursos]   = useState([])
  const [matriz, setMatriz]       = useState({})   // { rol_id: Set(recurso_id) }
  const [conteos, setConteos]     = useState({})   // { rol_id: nro de usuarios }
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('roles').select('id, nombre, descripcion, sistema, orden').order('orden'),
        supabase.from('recursos').select('id, nombre, descripcion, ruta, grupo, sensible, orden').order('orden'),
        supabase.from('rol_permisos').select('rol_id, recurso_id, ver'),
        supabase.rpc('usuarios_por_rol'),
      ])
      for (const r of [r1, r2, r3, r4]) if (r.error) throw r.error

      const m = {}
      for (const rol of r1.data ?? []) m[rol.id] = new Set()
      for (const f of r3.data ?? []) if (f.ver) (m[f.rol_id] ??= new Set()).add(f.recurso_id)

      setRoles(r1.data ?? [])
      setRecursos(r2.data ?? [])
      setMatriz(m)
      setConteos(Object.fromEntries((r4.data ?? []).map(x => [x.rol_id, Number(x.usuarios)])))
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const invocarRpc = async (fn, args) => {
    const { error: e } = await supabase.rpc(fn, args)
    if (e) throw new Error(e.message)
  }

  /** Reemplaza los permisos de un rol. `recursos` es un array de ids. */
  const guardarRol = useCallback(async (rolId, idsRecursos) => {
    await invocarRpc('guardar_permisos_rol', { p_rol: rolId, p_recursos: idsRecursos })
    await cargar()
  }, [cargar])

  const crearRol = useCallback(async ({ id, nombre, descripcion }) => {
    await invocarRpc('crear_rol', { p_id: id, p_nombre: nombre, p_descripcion: descripcion ?? '' })
    await cargar()
  }, [cargar])

  const eliminarRol = useCallback(async (rolId) => {
    await invocarRpc('eliminar_rol', { p_id: rolId })
    await cargar()
  }, [cargar])

  /**
   * Cierra las sesiones de todos los usuarios de un rol para que el cambio de
   * permisos aplique en el momento. Sin esto, el rol viejo sigue vigente en su
   * JWT hasta que expire (~1 h) — inaceptable cuando lo que se hizo fue quitar
   * un acceso.
   */
  const aplicarYa = useCallback(async (rolId) => {
    const { data, error: e } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'cerrar_sesiones_rol', rol: rolId },
    })
    if (e) {
      let msg = e.message
      try {
        const ctx = await e.context?.json?.()
        if (ctx?.error) msg = ctx.error
      } catch { /* mensaje genérico */ }
      throw new Error(msg)
    }
    if (data && data.ok === false) throw new Error(data.error || 'Error desconocido')
    return data
  }, [])

  return {
    roles, recursos, matriz, conteos, loading, error,
    recargar: cargar, guardarRol, crearRol, eliminarRol, aplicarYa,
  }
}
