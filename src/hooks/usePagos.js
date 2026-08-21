import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Pagos centralizados (Caja → botón Pagos). Un pago ES un egreso: misma tabla
// que ve Finanzas, sin duplicados ni sincronización.
//
// El alta va por el RPC registrar_pago(), que es transaccional: crea el egreso
// y, si hay turno de caja abierto y el pago es en efectivo, también el
// movimiento que lo descuenta del arqueo. Todo o nada — nunca queda un egreso
// sin su movimiento ni al revés.
//
// Opciones:
//   lista      false para las pantallas que solo necesitan el alta (el modal
//              compartido): evita traer el listado al pedo.
//   desde/hasta 'YYYY-MM-DD' — filtran por la fecha del pago.
//   categoria  id de CATEGORIAS, o null/'todas' para no filtrar.
//   estado     'pagado' | 'pendiente', o null/'todos' para no filtrar.
export function usePagos(opciones = {}) {
  const {
    lista = true,
    desde = null,
    hasta = null,
    categoria = null,
    estado = null,
    limite = 200,
  } = opciones

  const [pagos, setPagos]         = useState([])
  const [empleados, setEmpleados] = useState([])
  const [turnoAbierto, setTurnoAbierto] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let pagosQuery = null
      if (lista) {
        let q = supabase
          .from('egresos')
          .select('*, proveedor:proveedores(razon_social), empleado:empleados(nombre, apellido)')
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limite)
        if (desde) q = q.gte('fecha', desde)
        if (hasta) q = q.lte('fecha', hasta)
        if (categoria && categoria !== 'todas') q = q.eq('categoria', categoria)
        if (estado && estado !== 'todos') q = q.eq('estado', estado)
        pagosQuery = q
      }

      const [pagosRes, empRes, turnoRes] = await Promise.all([
        pagosQuery || Promise.resolve({ data: [], error: null }),
        // Solo id y nombre, vía RPC: no expone sueldo_base ni el legajo.
        supabase.rpc('empleados_para_pagos'),
        // OJO: la columna del monto de apertura es `apertura_monto`. Pedir una
        // columna inexistente hace fallar TODA la consulta, y como el turno se
        // resuelve a null en silencio, la pantalla creía siempre que la caja
        // estaba cerrada (y los pagos en efectivo se iban a la caja fuerte).
        supabase.from('caja_turnos').select('id, apertura_monto, business_date, created_at')
          .eq('estado', 'abierto')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (pagosRes.error) throw pagosRes.error
      // empleados puede fallar sin permiso; no bloquea el resto
      setPagos(pagosRes.data || [])
      setEmpleados(empRes.error ? [] : (empRes.data || []))
      // Un error acá (rol sin acceso a caja_turnos) no rompe el alta: se
      // asume caja cerrada. Se avisa por consola para que no pase inadvertido.
      if (turnoRes.error) console.warn('[usePagos] no se pudo leer el turno de caja:', turnoRes.error.message)
      setTurnoAbierto(turnoRes.error ? null : turnoRes.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [lista, desde, hasta, categoria, estado, limite])

  useEffect(() => { cargar() }, [cargar])

  /** Devuelve { egreso_id, caja_turno_id, descuenta_arqueo }. */
  const registrarPago = useCallback(async (form) => {
    const { data, error: e } = await supabase.rpc('registrar_pago', {
      p_categoria:    form.categoria,
      p_descripcion:  form.descripcion,
      p_monto:        Number(form.monto),
      p_medio_pago:   form.medio_pago,
      p_estado:       form.estado,
      p_fecha:        form.fecha || undefined,
      p_proveedor_id: form.proveedor_id || null,
      p_empleado_id:  form.empleado_id || null,
      p_subtipo:      form.subtipo || null,
      p_periodo:      form.periodo || null,
      p_vencimiento:  form.vencimiento || null,
      p_comprobante:  form.comprobante_nro || null,
      p_notas:        form.notas || null,
      p_origen:       form.origen || 'auto',
    })
    if (e) throw new Error(e.message)
    await cargar()
    return data
  }, [cargar])

  return { pagos, empleados, turnoAbierto, loading, error, registrarPago, recargar: cargar }
}
