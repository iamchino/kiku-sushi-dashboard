import { useCallback, useEffect, useMemo, useState } from 'react'
import { armarCashflow, listaMeses, mesDe, primerMesDeCalculo } from '../lib/cashflow'
import { cargarCashflow, cargarConfigCashflow, guardarConfigCashflow, guardarEstimados } from '../lib/cashflowApi'
import { fechaHoyAR } from '../lib/fiscal'

/**
 * Datos del cash flow mensual para la ventana [primerMes, primerMes + cantidad).
 *
 * Trae más meses de los que se ven cuando hace falta: el saldo se arrastra
 * desde `saldo_desde`, y el promedio real que se ofrece al estimar mira los
 * tres meses cerrados anteriores.
 */
export function useCashflow({ primerMes, cantidad }) {
  const mesActual = mesDe(fechaHoyAR())
  const [datos, setDatos] = useState({ filas: [], estimados: [], config: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [faltaMigracion, setFaltaMigracion] = useState(false)
  const [version, setVersion] = useState(0)

  const meses = useMemo(() => listaMeses(primerMes, cantidad), [primerMes, cantidad])
  const ultimoMes = meses[meses.length - 1]

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // Primero la config: dice desde qué mes hay que traer el resto.
        const { config, faltaMigracion: falta } = await cargarConfigCashflow()
        if (falta) {
          if (vivo) { setFaltaMigracion(true); setDatos({ filas: [], estimados: [], config: null }); setError(null) }
          return
        }
        const desde = primerMesDeCalculo(primerMes, mesActual, config?.saldo_desde ? mesDe(config.saldo_desde) : null)
        const res = await cargarCashflow(desde, ultimoMes)   // la base toma el mes entero
        if (!vivo) return
        setFaltaMigracion(res.faltaMigracion)
        setDatos({ filas: res.filas, estimados: res.estimados, config: res.config || config })
        setError(null)
      } catch (err) {
        if (vivo) setError(err.message || 'No se pudo cargar el cash flow.')
      } finally {
        if (vivo) setLoading(false)
      }
    })()
    return () => { vivo = false }
  }, [primerMes, ultimoMes, mesActual, version])

  const modelo = useMemo(
    () => armarCashflow({ meses, filas: datos.filas, estimados: datos.estimados, config: datos.config, mesActual }),
    [meses, datos, mesActual],
  )

  const recargar = useCallback(() => setVersion(v => v + 1), [])

  /** Guarda estimados y refleja el cambio al instante (después recarga). */
  const guardar = useCallback(async (items) => {
    await guardarEstimados(items)
    setDatos(prev => {
      const mapa = new Map(prev.estimados.map(e => [`${mesDe(e.mes)}|${e.concepto}`, e]))
      for (const i of items) {
        const k = `${mesDe(i.mes)}|${i.concepto}`
        if (i.monto === null || i.monto === undefined || i.monto === '') mapa.delete(k)
        else mapa.set(k, { mes: mesDe(i.mes), concepto: i.concepto, monto: Math.max(0, Math.round(Number(i.monto))) })
      }
      return { ...prev, estimados: [...mapa.values()] }
    })
    setVersion(v => v + 1)
  }, [])

  const guardarConfig = useCallback(async (config) => {
    await guardarConfigCashflow(config)
    setVersion(v => v + 1)
  }, [])

  return { meses, mesActual, modelo, config: datos.config, loading, error, faltaMigracion, recargar, guardar, guardarConfig }
}
