import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  format, subDays, startOfMonth, endOfMonth,
  subMonths, eachDayOfInterval, parseISO
} from 'date-fns'

const fmt    = (d) => format(d, 'yyyy-MM-dd')
const today  = () => fmt(new Date())
const ago    = (n) => fmt(subDays(new Date(), n))

export const PRESETS = [
  { label: 'Hoy',         desde: () => today(),                                           hasta: () => today() },
  { label: 'Ayer',        desde: () => ago(1),                                            hasta: () => ago(1) },
  { label: '7 días',      desde: () => ago(6),                                            hasta: () => today() },
  { label: '30 días',     desde: () => ago(29),                                           hasta: () => today() },
  { label: 'Este mes',    desde: () => fmt(startOfMonth(new Date())),                     hasta: () => today() },
  { label: 'Mes anterior',desde: () => fmt(startOfMonth(subMonths(new Date(), 1))),       hasta: () => fmt(endOfMonth(subMonths(new Date(), 1))) },
]

export const CANAL_CFG = {
  salon:     { label: 'Salón',     color: '#E8673A' },
  delivery:  { label: 'Delivery',  color: '#4f8ef7' },
  whatsapp:  { label: 'WhatsApp',  color: '#34d399' },
  pedidosya: { label: 'PedidosYa', color: '#fbbf24' },
  rappi:     { label: 'Rappi',     color: '#f472b6' },
  otro:      { label: 'Otro',      color: '#71717a' },
}

function process(pedidos, pedidosAnt, desde, hasta) {
  const ok   = pedidos.filter(p => p.estado !== 'cancelado')
  const canc = pedidos.filter(p => p.estado === 'cancelado')
  const okAnt = pedidosAnt.filter(p => p.estado !== 'cancelado')

  const ventas        = ok.reduce((s, p) => s + +p.total, 0)
  const ventasAnt     = okAnt.reduce((s, p) => s + +p.total, 0)
  const pedidosCount  = ok.length
  const pedidosAntCnt = okAnt.length
  const ticket        = pedidosCount > 0 ? ventas / pedidosCount : 0
  const cancelados    = canc.length
  const canceladosValor = canc.reduce((s, p) => s + +p.total, 0)

  // Por canal
  const cMap = {}
  pedidos.forEach(p => {
    const c = p.canal || 'otro'
    cMap[c] = cMap[c] || { canal: c, ventas: 0, pedidos: 0, cancelados: 0 }
    if (p.estado !== 'cancelado') { cMap[c].ventas += +p.total; cMap[c].pedidos++ }
    else cMap[c].cancelados++
  })
  const porCanal = Object.values(cMap)
    .map(c => ({ ...c, ticket: c.pedidos > 0 ? c.ventas / c.pedidos : 0 }))
    .sort((a, b) => b.ventas - a.ventas)

  // Por día (sin gaps)
  const dMap = {}
  ok.forEach(p => {
    const d = p.created_at.slice(0, 10)
    dMap[d] = dMap[d] || { fecha: d, ventas: 0, pedidos: 0 }
    dMap[d].ventas  += +p.total
    dMap[d].pedidos += 1
  })
  const porDia = eachDayOfInterval({ start: parseISO(desde), end: parseISO(hasta) })
    .map(d => { const k = fmt(d); return dMap[k] || { fecha: k, ventas: 0, pedidos: 0 } })

  // Top productos
  const pMap = {}
  ok.forEach(p => {
    ;(p.pedido_items || []).forEach(i => {
      if (!i.nombre) return
      pMap[i.nombre] = pMap[i.nombre] || { nombre: i.nombre, unidades: 0, ventas: 0 }
      pMap[i.nombre].unidades += i.cantidad || 1
      pMap[i.nombre].ventas   += +(i.precio_unitario || 0) * (i.cantidad || 1)
    })
  })
  const topProductos = Object.values(pMap).sort((a, b) => b.unidades - a.unidades).slice(0, 10)

  // Hora pico
  const hMap = {}
  ok.forEach(p => { const h = new Date(p.created_at).getHours(); hMap[h] = (hMap[h] || 0) + 1 })
  const horaPicoEntry = Object.entries(hMap).sort((a, b) => +b[1] - +a[1])[0]
  const horaPico = horaPicoEntry ? `${horaPicoEntry[0]}:00` : '--'

  // Deltas
  const dVentas  = ventasAnt    > 0 ? Math.round(((ventas - ventasAnt) / ventasAnt) * 100) : null
  const dPedidos = pedidosAntCnt > 0 ? Math.round(((pedidosCount - pedidosAntCnt) / pedidosAntCnt) * 100) : null

  return {
    ventas, ventasAnt, pedidosCount, pedidosAntCnt,
    ticket, cancelados, canceladosValor,
    dVentas, dPedidos,
    porCanal, porDia, topProductos, horaPico,
  }
}

export function useAnaliticas() {
  const [preset,  setPreset]  = useState('30 días')
  const [desde,   setDesde]   = useState(ago(29))
  const [hasta,   setHasta]   = useState(today())
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const applyPreset = useCallback((p) => {
    setPreset(p.label)
    setDesde(p.desde())
    setHasta(p.hasta())
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: ped, error: e1 } = await supabase
        .from('pedidos')
        .select('id, canal, total, estado, created_at, pedido_items(nombre, cantidad, precio_unitario)')
        .gte('created_at', `${desde}T00:00:00`)
        .lte('created_at', `${hasta}T23:59:59`)
        .order('created_at')
      if (e1) throw e1

      // Período anterior (misma duración)
      const dias    = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000))
      const hAnt    = fmt(subDays(parseISO(desde), 1))
      const dAnt    = fmt(subDays(parseISO(desde), dias))
      const { data: pedAnt } = await supabase
        .from('pedidos')
        .select('total, estado')
        .gte('created_at', `${dAnt}T00:00:00`)
        .lte('created_at', `${hAnt}T23:59:59`)

      setData(process(ped || [], pedAnt || [], desde, hasta))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, loading, error, desde, hasta, preset, setDesde, setHasta, setPreset, applyPreset, refetch: fetchData }
}
