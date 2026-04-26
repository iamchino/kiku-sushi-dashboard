import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export const TAGS_CONFIG = {
  VIP:        { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)'  },
  Recurrente: { color: '#4f8ef7', bg: 'rgba(79,142,247,0.12)', border: 'rgba(79,142,247,0.3)'  },
  Nuevo:      { color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)'  },
  Alérgico:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)',border: 'rgba(248,113,113,0.3)' },
}

export const ALL_TAGS = Object.keys(TAGS_CONFIG)

export function useClientes() {
  const [clientes, setClientes] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('clientes')
      // Los campos pedidos_total/gasto_total ya están en la tabla
      // Solo unimos pedidos para el historial del modal
      .select('*, pedidos(id, total, created_at, canal, estado)')
      .order('gasto_total', { ascending: false })

    if (error) setError(error.message)
    else setClientes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  // Stats usando los campos precalculados de la BD
  const stats = useMemo(() => {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const totalPuntos = clientes.reduce((acc, c) => acc + (c.puntos || 0), 0)
    return {
      total:       clientes.length,
      vip:         clientes.filter(c => (c.tags || '').includes('VIP')).length,
      nuevos:      clientes.filter(c => new Date(c.created_at) >= inicioMes).length,
      totalPuntos,
    }
  }, [clientes])

  // Enrich: usa campos precalculados de la BD directamente
  const enriched = useMemo(() => clientes.map(c => ({
    ...c,
    _visitas:      c.pedidos_total || c.pedidos?.length || 0,
    _totalGastado: parseFloat(c.gasto_total || 0),
    _ultimaVisita: (c.pedidos || []).reduce((max, p) =>
      (!max || p.created_at > max) ? p.created_at : max, null),
  })), [clientes])

  // CRUD
  const createCliente = async (payload) => {
    const { error } = await supabase.from('clientes').insert(payload)
    if (!error) fetchClientes()
    return error
  }
  const updateCliente = async (id, payload) => {
    const { error } = await supabase.from('clientes').update(payload).eq('id', id)
    if (!error) fetchClientes()
    return error
  }
  const deleteCliente = async (id) => {
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (!error) fetchClientes()
    return error
  }

  // Export CSV
  const exportCSV = () => {
    const headers = ['Nombre','Teléfono','Email','Puntos','Visitas','Gasto total','Tags','Notas']
    const rows = enriched.map(c => [
      c.nombre || '',
      c.telefono || '',
      c.email || '',
      c.puntos || 0,
      c._visitas,
      `$${c._totalGastado.toLocaleString('es-AR')}`,
      c.tags || '',
      (c.notas || '').replace(/,/g, ';'),
    ])
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `clientes_kiku_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return {
    clientes: enriched, stats,
    loading, error,
    createCliente, updateCliente, deleteCliente,
    exportCSV, refetch: fetchClientes,
  }
}
