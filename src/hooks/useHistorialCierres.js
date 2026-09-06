import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MEDIOS_ARQUEO, isMissingSchema } from './useCajaArqueo'

// Historial COMPLETO de cierres de caja.
//
// Por que un hook aparte y no reusar useCajaArqueo: ese hook trae los turnos
// del rango de fechas que elige la pagina (por defecto los ultimos 7 dias) y
// carga de una todos los movimientos y pagos de ese rango para poder calcular
// el arqueo del turno abierto. Sirve para operar el dia, no para mirar hacia
// atras: pedirle "todo el historial" seria traerse la caja entera a memoria.
//
// Aca vamos al reves: paginamos los turnos cerrados (20 por vez, mas nuevo
// primero) con filtros propios, y el detalle de cada uno se carga recien
// cuando el usuario lo despliega, quedando cacheado.

const PAGE_SIZE = 20

// Tope de la exportacion. Es alto a proposito (son ~1 turno por dia: 3 anios
// de operacion), pero acotado para que un CSV no se lleve puesta la pestana.
const EXPORT_MAX = 2000

const SIN_MIGRACION = 'Falta ejecutar la migracion de arqueo de caja en Supabase.'

/** Aplica los filtros comunes a cualquier query de turnos cerrados. */
function aplicarFiltros(query, { desde, hasta, caja }) {
  let q = query.eq('estado', 'cerrado')
  if (desde) q = q.gte('business_date', desde)
  if (hasta) q = q.lte('business_date', hasta)
  if (caja) q = q.eq('caja_nombre', caja)
  // Desempate por created_at: dos cierres con el mismo cierre_at (p. ej.
  // corregidos en la misma operacion) tienen que salir siempre en el mismo
  // orden, si no la paginacion repite o saltea filas.
  return q
    .order('cierre_at', { ascending: false })
    .order('created_at', { ascending: false })
}

const FILTROS_VACIOS = { desde: '', hasta: '', caja: '' }

export function useHistorialCierres() {
  const [turnos, setTurnos] = useState([])
  const [filtros, setFiltros] = useState(FILTROS_VACIOS)
  const [cajas, setCajas] = useState([])
  const [total, setTotal] = useState(null)
  const [hayMas, setHayMas] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMas, setLoadingMas] = useState(false)
  const [error, setError] = useState(null)
  const [setupWarning, setSetupWarning] = useState(null)

  // Detalle por turno: { [turnoId]: { loading, error, movimientos, pagos, auditoria } }
  const [detalles, setDetalles] = useState({})

  // Evita que una respuesta lenta de un filtro viejo pise a una mas nueva.
  const requestId = useRef(0)

  const cargar = useCallback(async (opciones = {}) => {
    const { append = false, offset = 0, filtrosUsados = filtros } = opciones
    const req = ++requestId.current

    if (append) setLoadingMas(true)
    else { setLoading(true); setError(null); setSetupWarning(null) }

    try {
      const { data, error: qError, count } = await aplicarFiltros(
        supabase.from('caja_turnos').select('*', { count: 'exact' }),
        filtrosUsados,
      ).range(offset, offset + PAGE_SIZE - 1)

      if (req !== requestId.current) return

      if (qError) {
        if (isMissingSchema(qError)) setSetupWarning(SIN_MIGRACION)
        else setError(qError.message)
        if (!append) { setTurnos([]); setTotal(0); setHayMas(false) }
        return
      }

      const filas = data || []
      setTurnos(prev => {
        if (!append) return filas
        // Deduplica por id: si entra un cierre nuevo mientras paginabas, el
        // corrimiento puede devolver una fila ya listada.
        const vistos = new Set(prev.map(t => t.id))
        return [...prev, ...filas.filter(t => !vistos.has(t.id))]
      })
      setTotal(typeof count === 'number' ? count : null)
      setHayMas(filas.length === PAGE_SIZE)
    } catch (err) {
      if (req === requestId.current) setError(err.message || 'No se pudo cargar el historial.')
    } finally {
      if (req === requestId.current) { setLoading(false); setLoadingMas(false) }
    }
  }, [filtros])

  const cargarMas = useCallback(() => {
    if (loading || loadingMas || !hayMas) return
    cargar({ append: true, offset: turnos.length })
  }, [cargar, hayMas, loading, loadingMas, turnos.length])

  // Lista de cajas para el filtro. Es un catalogo chico (1-2 nombres en la
  // practica) y no cambia seguido, asi que se carga una sola vez.
  useEffect(() => {
    let vivo = true
    supabase
      .from('caja_turnos')
      .select('caja_nombre')
      .not('caja_nombre', 'is', null)
      .limit(1000)
      .then(({ data, error: e }) => {
        if (!vivo || e) return
        setCajas([...new Set((data || []).map(r => r.caja_nombre).filter(Boolean))].sort())
      })
    return () => { vivo = false }
  }, [])

  // Recarga cada vez que cambian los filtros.
  useEffect(() => { cargar({ append: false, offset: 0 }) }, [cargar])

  // Realtime aparte, con dependencias vacias a proposito: `cargar` se recrea con
  // cada tecla del filtro de fechas, y si la suscripcion dependiera de el
  // estariamos tirando y rearmando el websocket en cada pulsacion. El ref deja
  // que el callback vea siempre la version fresca sin resuscribir.
  const cargarRef = useRef(cargar)
  useEffect(() => { cargarRef.current = cargar }, [cargar])

  useEffect(() => {
    const channel = supabase
      .channel('historial-cierres')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_turnos' }, () => {
        cargarRef.current({ append: false, offset: 0 })
        setDetalles({})
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  /**
   * Carga (una sola vez) el detalle de un turno: sus movimientos, sus cobros y
   * su auditoria. Ademas de lo vinculado por id, trae lo que cayo dentro de la
   * ventana del turno sin quedar vinculado, que es como lo resuelve el arqueo
   * del dia (belongsToTurn): sin esto un pago sin caja_turno_id desaparecia del
   * detalle historico aunque el turno abierto si lo contaba.
   */
  const cargarDetalle = useCallback(async (turno) => {
    if (!turno?.id) return
    let yaEsta = false
    setDetalles(prev => {
      if (prev[turno.id]) { yaEsta = true; return prev }
      return { ...prev, [turno.id]: { loading: true, error: null, movimientos: [], pagos: [], auditoria: [] } }
    })
    if (yaEsta) return

    const desde = turno.apertura_at
    const hasta = turno.cierre_at || new Date().toISOString()

    const sueltos = (tabla, campoTurno) => supabase
      .from(tabla).select('*')
      .is(campoTurno, null)
      .gte('created_at', desde)
      .lte('created_at', hasta)

    try {
      const [movs, movsSueltos, pags, pagsSueltos, audit] = await Promise.all([
        supabase.from('caja_movimientos').select('*').eq('turno_id', turno.id),
        sueltos('caja_movimientos', 'turno_id'),
        supabase.from('pagos_arqueo').select('*').eq('caja_turno_id', turno.id),
        sueltos('pagos_arqueo', 'caja_turno_id'),
        supabase.from('caja_turnos_auditoria').select('*')
          .eq('turno_id', turno.id)
          .order('created_at', { ascending: false }),
      ])

      // La auditoria puede no existir todavia (migracion sin aplicar): no es
      // motivo para dejar el detalle sin movimientos ni cobros.
      const fallo = [movs, pags].find(r => r.error && !isMissingSchema(r.error))
      const unir = (a, b) => {
        const porId = new Map((a.data || []).map(r => [r.id, r]))
        ;(b.error ? [] : (b.data || [])).forEach(r => porId.set(r.id, r))
        return [...porId.values()].sort((x, y) => new Date(y.created_at) - new Date(x.created_at))
      }

      setDetalles(prev => ({
        ...prev,
        [turno.id]: {
          loading: false,
          error: fallo ? fallo.error.message : null,
          movimientos: unir(movs, movsSueltos),
          pagos: unir(pags, pagsSueltos),
          auditoria: audit.error ? [] : (audit.data || []),
        },
      }))
    } catch (err) {
      setDetalles(prev => ({
        ...prev,
        [turno.id]: {
          loading: false,
          error: err.message || 'No se pudo cargar el detalle.',
          movimientos: [], pagos: [], auditoria: [],
        },
      }))
    }
  }, [])

  /**
   * Trae TODO el historial que matchea los filtros (no solo lo paginado en
   * pantalla) y arma el CSV. Separador ';' y BOM para que Excel en es-AR lo
   * abra en columnas sin pasar por el asistente de importacion.
   */
  const exportarCSV = useCallback(async () => {
    const { data, error: qError } = await aplicarFiltros(
      supabase.from('caja_turnos').select('*'),
      filtros,
    ).limit(EXPORT_MAX)

    if (qError) throw new Error(qError.message)
    const filas = data || []
    if (filas.length === 0) throw new Error('No hay cierres para exportar con estos filtros.')

    const encabezado = [
      'Fecha operativa', 'Caja', 'Apertura', 'Cierre',
      'Fondo inicial', 'Esperado total', 'Contado total', 'Diferencia',
      ...MEDIOS_ARQUEO.flatMap(m => [
        `${m.label} esperado`, `${m.label} contado`, `${m.label} diferencia`,
      ]),
      'Notas apertura', 'Notas cierre',
    ]

    // Numeros con coma decimal (es-AR) y sin separador de miles: Excel los
    // toma como numero, no como texto.
    const num = (v) => String(Number(v || 0).toFixed(2)).replace('.', ',')
    const fechaHora = (ts) => (ts ? new Date(ts).toLocaleString('es-AR') : '')

    const filasCSV = filas.map(t => {
      const medios = t.denominaciones_cierre?.medios || {}
      return [
        t.business_date || '',
        t.caja_nombre || '',
        fechaHora(t.apertura_at),
        fechaHora(t.cierre_at),
        num(t.apertura_monto),
        num(t.efectivo_esperado),
        num(t.cierre_monto),
        num(t.diferencia),
        ...MEDIOS_ARQUEO.flatMap(m => {
          const d = medios[m.id] || {}
          return [
            num(d.esperado),
            num(d.contado),
            num(Number(d.contado || 0) - Number(d.esperado || 0)),
          ]
        }),
        t.notas_apertura || '',
        t.notas_cierre || '',
      ]
    })

    // Comillas dobles siempre: una nota con ';' o con un salto de linea no
    // tiene que correr las columnas.
    const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [encabezado, ...filasCSV]
      .map(fila => fila.map(escapar).join(';'))
      .join('\r\n')

    // BOM al principio: sin esto Excel en Windows lee el UTF-8 como latin-1 y
    // los acentos salen rotos.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const sufijo = [filtros.desde, filtros.hasta].filter(Boolean).join('_a_') || 'completo'
    const a = document.createElement('a')
    a.href = url
    a.download = `cierres-caja_${sufijo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    return filas.length
  }, [filtros])

  const limpiarFiltros = useCallback(() => setFiltros(FILTROS_VACIOS), [])

  return {
    turnos,
    cajas,
    total,
    filtros,
    setFiltros,
    limpiarFiltros,
    hayMas,
    loading,
    loadingMas,
    error,
    setupWarning,
    detalles,
    cargarDetalle,
    cargarMas,
    exportarCSV,
    recargar: () => cargar({ append: false, offset: 0 }),
  }
}
