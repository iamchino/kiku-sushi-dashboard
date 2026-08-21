import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { rangoSemana, arDateISO, redondearBloque } from '../lib/horas'

// Horas del empleado logueado para la semana (lunes → domingo) que contiene
// `refDate`. RLS self: solo ve lo suyo.
//  - jornadas: pares entrada/salida de vista_jornadas (salida null = abierta)
//  - minutos: total de la semana con el redondeo a bloques de 30 aplicado por día
//  - estimado: minutos/60 × sueldo_base (si tipo_sueldo = 'hora')
//  - liquidacion: fila de `liquidaciones` de esa semana (estado pagado/pendiente)
export function useMisHoras(refDate) {
  const [empleado, setEmpleado]       = useState(null)
  const [jornadas, setJornadas]       = useState([])
  const [liquidacion, setLiquidacion] = useState(null)
  const [jornales, setJornales]       = useState([])   // pagos por día (tipo 'dia')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const semana = useMemo(() => rangoSemana(refDate), [refDate])

  const fetchDatos = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')

      const { data: emp, error: e1 } = await supabase
        .from('empleados')
        .select('id, nombre, apellido, tipo_sueldo, sueldo_base')
        .eq('user_id', user.id)
        .maybeSingle()
      if (e1) throw e1
      setEmpleado(emp)

      if (emp) {
        const [jor, liq] = await Promise.all([
          supabase
            .from('vista_jornadas')
            .select('*')
            .eq('empleado_id', emp.id)
            .gte('entrada', semana.inicioISO)
            .lt('entrada', semana.finExclusivoISO)
            .order('entrada', { ascending: true }),
          supabase
            .from('liquidaciones')
            .select('*')
            .eq('empleado_id', emp.id)
            .or(`and(tipo.eq.semana,semana_inicio.eq.${semana.desde}),and(tipo.eq.dia,semana_inicio.gte.${semana.desde},semana_inicio.lte.${semana.hasta})`)
            .order('semana_inicio', { ascending: true }),
        ])
        if (jor.error) throw jor.error
        if (liq.error) throw liq.error
        setJornadas(jor.data || [])
        const liqs = liq.data || []
        setLiquidacion(liqs.find(l => (l.tipo || 'semana') === 'semana') || null)
        setJornales(liqs.filter(l => l.tipo === 'dia'))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [semana.desde, semana.hasta, semana.inicioISO, semana.finExclusivoISO])

  useEffect(() => { fetchDatos() }, [fetchDatos])

  // Total de la semana: se suman los minutos REALES de cada día y recién ahí
  // se redondea a bloques de 30 hacia arriba, día por día (igual que la base).
  const minutos = useMemo(() => {
    const porDia = {}
    for (const j of jornadas) {
      if (!j.salida) continue
      const fecha = arDateISO(j.entrada)
      porDia[fecha] = (porDia[fecha] || 0) + (j.minutos_reales ?? j.minutos ?? 0)
    }
    return Object.values(porDia).reduce((s, m) => s + redondearBloque(m), 0)
  }, [jornadas])
  const esPorHora = empleado?.tipo_sueldo === 'hora'
  const estimado = esPorHora ? (minutos / 60) * Number(empleado?.sueldo_base || 0) : 0

  return { empleado, jornadas, minutos, estimado, esPorHora, liquidacion, jornales, semana, loading, error, refetch: fetchDatos }
}
