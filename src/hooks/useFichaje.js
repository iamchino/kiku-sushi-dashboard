import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { obtenerUbicacion } from '../lib/horas'
import { useNowTick } from './useNowTick'

// Un turno que arranca a las 18:00 y termina a la 01:00 NO es dos días: es el
// mismo turno. Por eso la pantalla no mira el día calendario sino una ventana
// hacia atrás, y el estado sale de la ÚLTIMA marca.
//
// Antes se leían solo las marcas desde las 00:00 de hoy: pasada la medianoche
// el turno en curso desaparecía, la pantalla decía "Fuera / Hoy 0 m" y la
// gente no fichaba la salida (para qué, si figuraba afuera). Al día siguiente
// esa entrada vieja se apareaba con el escaneo de las 18:00 y quedaba una
// jornada de 24 h.
const HORAS_VENTANA = 48

// Más de esto con una entrada abierta = turno abandonado. Espeja el corte que
// aplica public.fichar() en la base.
const HORAS_TURNO_ABANDONADO = 16

// Una salida por QR de hace menos de esto, que cierra una entrada, se puede
// corregir desde el celu ("esa salida fue un error, estoy saliendo ahora").
// Espeja el límite de public.fichar(p_corregir_salida).
const HORAS_SALIDA_CORREGIBLE = 10
const MS_HORA = 3600 * 1000

// Fichaje del empleado logueado (RLS self):
//  - empleado: su ficha (nombre, tipo_sueldo, sueldo_base)
//  - marcas: fichajes de las últimas 48 h, en orden
//  - marcasJornada: las de la jornada en curso (o de la última cerrada)
//  - dentro: si la última marca es 'entrada' y no está abandonada
//  - entradaAbierta: desde cuándo está trabajando (puede ser de ayer)
//  - minutosJornada: minutos de la jornada en curso / última del día
//  - fichar(token): pide GPS y llama la RPC fichar() con la geocerca
export function useFichaje() {
  const [empleado, setEmpleado] = useState(null)
  const [marcas, setMarcas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

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
        const desde = new Date(Date.now() - HORAS_VENTANA * 3600 * 1000).toISOString()
        const { data, error: e2 } = await supabase
          .from('fichajes')
          .select('id, tipo, ts, origen')
          .eq('empleado_id', emp.id)
          .gte('ts', desde)
          .order('ts', { ascending: true })
        if (e2) throw e2
        setMarcas(data || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  // `now` se refresca cada 30 s para que el contador avance solo.
  const now = useNowTick(30_000)

  const estado = useMemo(() => {
    const ultima = marcas[marcas.length - 1] || null
    const abandonada = Boolean(
      ultima && ultima.tipo === 'entrada' &&
      (now - new Date(ultima.ts)) > HORAS_TURNO_ABANDONADO * 3600 * 1000,
    )
    const dentro = Boolean(ultima && ultima.tipo === 'entrada' && !abandonada)
    const entradaAbierta = dentro ? new Date(ultima.ts) : null

    // Marcas de la jornada en curso: desde la última entrada que abre la
    // jornada actual. Si está afuera, las del último bloque cerrado.
    let inicio = 0
    for (let i = marcas.length - 1; i >= 0; i--) {
      if (marcas[i].tipo === 'entrada') { inicio = i; break }
    }
    const marcasJornada = marcas.slice(inicio)

    let minutos = 0
    let abierta = null
    for (const m of marcasJornada) {
      if (m.tipo === 'entrada') abierta = new Date(m.ts)
      else if (m.tipo === 'salida' && abierta) {
        minutos += (new Date(m.ts) - abierta) / 60000
        abierta = null
      }
    }
    if (abierta && dentro) minutos += (now - abierta) / 60000

    // Salida reciente que cierra una entrada: si ahora le toca ENTRADA, puede
    // ser que esa salida haya sido un escaneo fantasma a mitad del turno.
    const previa = marcas[marcas.length - 2] || null
    const salidaCorregible = Boolean(
      ultima && ultima.tipo === 'salida' && ultima.origen === 'qr' &&
      (now - new Date(ultima.ts)) < HORAS_SALIDA_CORREGIBLE * MS_HORA &&
      previa && previa.tipo === 'entrada' &&
      (now - new Date(previa.ts)) < HORAS_TURNO_ABANDONADO * MS_HORA,
    )

    return {
      ultima,
      salidaCorregible,
      dentro,
      abandonada,
      entradaAbierta,
      marcasJornada,
      minutosJornada: Math.round(minutos),
      // Lo que va a registrar el próximo escaneo, para no prometer de más.
      proximaMarca: dentro ? 'salida' : 'entrada',
    }
  }, [marcas, now])

  // El empleado confirmó en pantalla → pedimos GPS → RPC fichar().
  //  - tipoEsperado: 'entrada' | 'salida' que confirmó (la base lo valida)
  //  - corregirSalida: mover a ahora la última salida (fue un escaneo fantasma)
  // Devuelve { tipo, ts, mensaje }.
  const fichar = useCallback(async (token, { tipoEsperado = null, corregirSalida = false } = {}) => {
    const ubic = await obtenerUbicacion()
    const base = {
      p_token: token,
      p_lat: ubic.lat,
      p_lng: ubic.lng,
      p_precision_m: ubic.precision_m,
    }
    let { data, error: e } = await supabase.rpc('fichar', {
      ...base,
      p_tipo_esperado: tipoEsperado,
      p_corregir_salida: corregirSalida,
    })
    // Base sin la migración 20260916000000: la firma nueva no existe.
    if (e && (e.code === 'PGRST202' || e.code === '42883')) {
      if (corregirSalida) {
        throw new Error('La corrección de salida todavía no está habilitada. Avisale al encargado.')
      }
      ;({ data, error: e } = await supabase.rpc('fichar', base))
    }
    if (e) throw new Error(e.message)
    const res = Array.isArray(data) ? data[0] : data
    await fetchEstado()
    return res
  }, [fetchEstado])

  return {
    empleado,
    marcas,
    marcasJornada: estado.marcasJornada,
    dentro: estado.dentro,
    abandonada: estado.abandonada,
    entradaAbierta: estado.entradaAbierta,
    minutosJornada: estado.minutosJornada,
    proximaMarca: estado.proximaMarca,
    ultimaMarca: estado.ultima,
    salidaCorregible: estado.salidaCorregible,
    loading,
    error,
    fichar,
    refetch: fetchEstado,
  }
}
