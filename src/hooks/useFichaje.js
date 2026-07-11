import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { obtenerUbicacion } from '../lib/horas'
import { useNowTick } from './useNowTick'

// Fichaje del empleado logueado (RLS self):
//  - empleado: su ficha (nombre, tipo_sueldo, sueldo_base)
//  - marcasHoy: fichajes del día (jornada cuenta desde las 00:00 locales)
//  - dentro: si la última marca es 'entrada' (está trabajando)
//  - fichar(token): pide GPS y llama la RPC fichar() con la geocerca
export function useFichaje() {
  const [empleado, setEmpleado]   = useState(null)
  const [marcasHoy, setMarcasHoy] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetchEstado = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')

      const { data: emp, error: e1 } = await supabase
        .from('empleados')
        .select('id, nombre, apellido, tipo_sueldo, sueldo_base, activo')
        .eq('user_id', user.id)
        .maybeSingle()
      if (e1) throw e1
      setEmpleado(emp)

      if (emp) {
        // medianoche LOCAL de hoy, expresada como instante UTC real
        const hoy = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        const { data: marcas, error: e2 } = await supabase
          .from('fichajes')
          .select('id, tipo, ts, origen')
          .eq('empleado_id', emp.id)
          .gte('ts', hoy)
          .order('ts', { ascending: true })
        if (e2) throw e2
        setMarcasHoy(marcas || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  const ultima = marcasHoy[marcasHoy.length - 1] || null
  const dentro = ultima?.tipo === 'entrada'

  // Minutos ya trabajados hoy (pares cerrados + jornada abierta hasta ahora).
  // `now` se refresca cada 30 s para que el contador avance solo.
  const now = useNowTick(30_000)
  const minutosHoy = useMemo(() => {
    let total = 0
    let abierta = null
    for (const m of marcasHoy) {
      if (m.tipo === 'entrada') abierta = new Date(m.ts)
      else if (m.tipo === 'salida' && abierta) {
        total += (new Date(m.ts) - abierta) / 60000
        abierta = null
      }
    }
    if (abierta) total += (now - abierta) / 60000
    return Math.round(total)
  }, [marcasHoy, now])

  // Escaneó el QR → pedimos GPS → RPC fichar(). Devuelve { tipo, ts, mensaje }.
  const fichar = useCallback(async (token) => {
    const ubic = await obtenerUbicacion()
    const { data, error: e } = await supabase.rpc('fichar', {
      p_token: token,
      p_lat: ubic.lat,
      p_lng: ubic.lng,
      p_precision_m: ubic.precision_m,
    })
    if (e) throw new Error(e.message)
    const res = Array.isArray(data) ? data[0] : data
    await fetchEstado()
    return res
  }, [fetchEstado])

  return { empleado, marcasHoy, dentro, minutosHoy, loading, error, fichar, refetch: fetchEstado }
}
