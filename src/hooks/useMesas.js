import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook de mesas con realtime para un salón específico.
 *
 * Lee de la vista `v_mesas_estado` que ya trae el estado derivado del pedido
 * abierto, y enriquece cada registro con la info del grupo (mesa_grupo_id)
 * desde la tabla `mesas` directamente — esto evita depender de que la vista
 * exponga el campo.
 *
 * Cada mesa devuelta tiene además:
 *   - `mesa_grupo_id`     : leader id si es miembro de un grupo
 *   - `es_lider_grupo`    : true si tiene miembros agrupados a esta mesa
 *   - `miembros_grupo`    : array de mesas miembros (solo si es líder)
 */
export function useMesas({ salonId } = {}) {
  const [mesas,   setMesas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 10))

  const fetchMesas = useCallback(async () => {
    if (!salonId) {
      setMesas([])
      setLoading(false)
      return
    }
    setLoading(true)

    const [resEstado, resGrupos] = await Promise.all([
      supabase
        .from('v_mesas_estado')
        .select('*')
        .eq('salon_id', salonId)
        .eq('activa', true)
        .order('numero', { ascending: true }),
      supabase
        .from('mesas')
        .select('id, mesa_grupo_id')
        .eq('salon_id', salonId),
    ])

    if (resEstado.error) {
      setError(resEstado.error.message)
      setMesas([])
      setLoading(false)
      return
    }
    setError(null)

    // Merge mesa_grupo_id (puede no estar en la vista si no fue regenerada)
    const grupoMap = new Map()
    if (!resGrupos.error) {
      for (const g of (resGrupos.data || [])) {
        grupoMap.set(g.id, g.mesa_grupo_id || null)
      }
    }

    const base = (resEstado.data || []).map(m => ({
      ...m,
      mesa_grupo_id: m.mesa_grupo_id ?? grupoMap.get(m.id) ?? null,
    }))

    // Derivar líderes y miembros
    const miembrosPorLider = new Map()
    for (const m of base) {
      if (m.mesa_grupo_id) {
        const arr = miembrosPorLider.get(m.mesa_grupo_id) || []
        arr.push(m)
        miembrosPorLider.set(m.mesa_grupo_id, arr)
      }
    }

    const enriched = base.map(m => ({
      ...m,
      es_lider_grupo: miembrosPorLider.has(m.id),
      miembros_grupo: miembrosPorLider.get(m.id) || [],
    }))

    setMesas(enriched)
    setLoading(false)
  }, [salonId])

  useEffect(() => {
    fetchMesas()
    if (!salonId) return

    const channel = supabase
      .channel(`mesas-realtime-${salonId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesas' },                  fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },                fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' },           fetchMesas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes_fiscales' },  fetchMesas)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [salonId, fetchMesas, instanceId])

  const stats = useMemo(() => {
    const total = mesas.length
    const libres = mesas.filter(m => m.estado_mesa === 'libre').length
    const ocupadas = total - libres
    return { total, libres, ocupadas }
  }, [mesas])

  const createMesa = async ({ numero, capacidad = 4, pos_x = 0, pos_y = 0, ancho = 80, alto = 80, forma = 'rect', nombre = null }) => {
    if (!salonId) return { error: new Error('Salón requerido') }
    const { data, error: insErr } = await supabase
      .from('mesas')
      .insert({ salon_id: salonId, numero, capacidad, pos_x, pos_y, ancho, alto, forma, nombre })
      .select()
      .single()
    if (!insErr) fetchMesas()
    return { data, error: insErr }
  }

  const updateMesa = async (id, patch) => {
    const { error: updErr } = await supabase
      .from('mesas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!updErr) fetchMesas()
    return { error: updErr }
  }

  const updateMesasPositions = async (positions) => {
    const promises = positions.map(p =>
      supabase.from('mesas').update({
        pos_x: p.pos_x,
        pos_y: p.pos_y,
        ...(p.ancho !== undefined ? { ancho: p.ancho } : {}),
        ...(p.alto  !== undefined ? { alto: p.alto }   : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', p.id)
    )
    const results = await Promise.all(promises)
    const firstError = results.find(r => r.error)?.error
    if (!firstError) fetchMesas()
    return { error: firstError }
  }

  const desactivarMesa = (id) => updateMesa(id, { activa: false })

  const eliminarMesa = async (id) => {
    const { error: delErr } = await supabase.from('mesas').delete().eq('id', id)
    if (!delErr) fetchMesas()
    return { error: delErr }
  }

  /** Agrupa la mesa `memberId` al grupo de `leaderId`. Visual + único pedido. */
  const agruparMesa = async (leaderId, memberId) => {
    const { error: rpcErr } = await supabase.rpc('agrupar_mesa', {
      p_leader_id: leaderId,
      p_member_id: memberId,
    })
    if (rpcErr) {
      // Fallback: update directo si la RPC no existe todavía
      if (/Could not find the function|schema cache/i.test(rpcErr.message || '')) {
        const { error: updErr } = await supabase
          .from('mesas')
          .update({ mesa_grupo_id: leaderId, updated_at: new Date().toISOString() })
          .eq('id', memberId)
        if (!updErr) fetchMesas()
        return { error: updErr }
      }
      return { error: rpcErr }
    }
    fetchMesas()
    return { error: null }
  }

  /** Desagrupa todos los miembros del grupo cuyo líder es `leaderId`. */
  const desagruparGrupo = async (leaderId) => {
    const { error: rpcErr } = await supabase.rpc('desagrupar_grupo', {
      p_leader_id: leaderId,
    })
    if (rpcErr) {
      if (/Could not find the function|schema cache/i.test(rpcErr.message || '')) {
        const { error: updErr } = await supabase
          .from('mesas')
          .update({ mesa_grupo_id: null, updated_at: new Date().toISOString() })
          .eq('mesa_grupo_id', leaderId)
        if (!updErr) fetchMesas()
        return { error: updErr }
      }
      return { error: rpcErr }
    }
    fetchMesas()
    return { error: null }
  }

  return {
    mesas, stats, loading, error,
    refetch: fetchMesas,
    createMesa, updateMesa, updateMesasPositions, desactivarMesa, eliminarMesa,
    agruparMesa, desagruparGrupo,
  }
}
