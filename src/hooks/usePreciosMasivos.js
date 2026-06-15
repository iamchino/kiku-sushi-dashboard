import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * usePreciosMasivos — Ajuste masivo de precios por sección.
 *
 * Permite subir (o bajar) los precios de toda una sección de golpe,
 * por porcentaje o por monto fijo, sin tener que editar producto por producto.
 *
 * Secciones soportadas:
 *   - carta      → menu_items (tipo='carta')      "Carta Salón"
 *   - delivery   → menu_items (tipo='delivery')   "Delivery / Pedidos"
 *   - especiales → tabla especiales               "Especiales Web"
 *
 * Los precios viven en dos lugares:
 *   - menu_items.precio            (productos sin variantes)
 *   - menu_item_variantes.precio   (productos con variantes: el item.precio queda null)
 * El ajuste toca AMBOS.
 */

export const SECCIONES = [
  { key: 'carta',      label: 'Carta Salón',        tipo: 'carta' },
  { key: 'delivery',   label: 'Delivery / Pedidos', tipo: 'delivery' },
  { key: 'especiales', label: 'Especiales Web',     tipo: null },
]

export const REDONDEOS = [
  { key: '50',     label: 'Múltiplo de 50',  paso: 50 },
  { key: '100',    label: 'A la centena',    paso: 100 },
  { key: '10',     label: 'A la decena',     paso: 10 },
  { key: 'exacto', label: 'Sin redondeo',    paso: 1 },
]

// ── Helpers de cálculo (puros, testeables) ─────────────────────────────────

/** Redondea un valor según el modo elegido. Siempre devuelve entero (pesos). */
export function redondear(valor, modoRedondeo) {
  const paso = REDONDEOS.find(r => r.key === modoRedondeo)?.paso ?? 1
  if (paso <= 1) return Math.round(valor)
  return Math.round(valor / paso) * paso
}

/**
 * Calcula el precio nuevo a partir del actual.
 * @param actual número actual
 * @param modo 'porcentaje' | 'monto'
 * @param valor porcentaje (ej 10 = +10%) o monto fijo a sumar
 */
export function calcularNuevoPrecio(actual, modo, valor, modoRedondeo) {
  const base = Number(actual) || 0
  if (base <= 0) return base
  const v = Number(valor) || 0
  const crudo = modo === 'porcentaje' ? base * (1 + v / 100) : base + v
  return Math.max(0, redondear(crudo, modoRedondeo))
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePreciosMasivos() {
  const [snapshot, setSnapshot] = useState(null) // datos crudos por sección
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  /** Trae todos los precios actuales de las 3 secciones (una sola vez al abrir). */
  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [carta, delivery, especiales] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, nombre, precio, activo, menu_item_variantes(id, nombre, precio)')
          .eq('tipo', 'carta'),
        supabase
          .from('menu_items')
          .select('id, nombre, precio, activo, menu_item_variantes(id, nombre, precio)')
          .eq('tipo', 'delivery'),
        supabase
          .from('especiales')
          .select('id, titulo, precio, activo'),
      ])

      const firstError = carta.error || delivery.error || especiales.error
      if (firstError) throw firstError

      setSnapshot({
        carta:      carta.data || [],
        delivery:   delivery.data || [],
        especiales: especiales.data || [],
      })
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los precios')
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Calcula el preview de una sección sin tocar la base.
   * @returns { afectados, ejemplos: [{nombre, antes, despues}], cambios: [...] }
   */
  const previewSeccion = useCallback((seccionKey, { modo, valor, redondeo, soloActivos }) => {
    if (!snapshot) return { afectados: 0, ejemplos: [], cambios: [] }
    const rows = snapshot[seccionKey] || []
    const cambios = [] // { tabla, id, nombre, antes, despues }

    if (seccionKey === 'especiales') {
      rows.forEach(esp => {
        if (soloActivos && !esp.activo) return
        const antes = Number(esp.precio) || 0
        if (antes <= 0) return
        const despues = calcularNuevoPrecio(antes, modo, valor, redondeo)
        if (despues !== antes) {
          cambios.push({ tabla: 'especiales', id: esp.id, nombre: esp.titulo, antes, despues })
        }
      })
    } else {
      rows.forEach(item => {
        if (soloActivos && !item.activo) return
        const variantes = item.menu_item_variantes || []
        if (variantes.length > 0) {
          // El precio vive en las variantes
          variantes.forEach(v => {
            const antes = Number(v.precio) || 0
            if (antes <= 0) return
            const despues = calcularNuevoPrecio(antes, modo, valor, redondeo)
            if (despues !== antes) {
              cambios.push({
                tabla: 'menu_item_variantes',
                id: v.id,
                nombre: `${item.nombre} · ${v.nombre || 'variante'}`,
                antes, despues,
              })
            }
          })
        } else {
          const antes = Number(item.precio) || 0
          if (antes <= 0) return
          const despues = calcularNuevoPrecio(antes, modo, valor, redondeo)
          if (despues !== antes) {
            cambios.push({ tabla: 'menu_items', id: item.id, nombre: item.nombre, antes, despues })
          }
        }
      })
    }

    return {
      afectados: cambios.length,
      ejemplos: cambios.slice(0, 4),
      cambios,
    }
  }, [snapshot])

  /**
   * Aplica los cambios de una o varias secciones.
   * @param planes [{ seccionKey, modo, valor }]
   * @param opciones { redondeo, soloActivos }
   * @returns { ok, total, fallidos, error }
   */
  const aplicar = useCallback(async (planes, opciones) => {
    const todosLosCambios = []
    planes.forEach(plan => {
      const { cambios } = previewSeccion(plan.seccionKey, { ...plan, ...opciones })
      todosLosCambios.push(...cambios)
    })

    if (todosLosCambios.length === 0) {
      return { ok: true, total: 0, fallidos: 0, error: null }
    }

    let fallidos = 0
    let primerError = null

    // Actualizamos de a tandas para no saturar la conexión.
    const TANDA = 20
    for (let i = 0; i < todosLosCambios.length; i += TANDA) {
      const tanda = todosLosCambios.slice(i, i + TANDA)
      const resultados = await Promise.all(
        tanda.map(c =>
          supabase.from(c.tabla).update({ precio: c.despues }).eq('id', c.id)
        )
      )
      resultados.forEach(r => {
        if (r.error) {
          fallidos += 1
          if (!primerError) primerError = r.error.message
        }
      })
    }

    return {
      ok: fallidos === 0,
      total: todosLosCambios.length,
      fallidos,
      error: primerError,
    }
  }, [previewSeccion])

  return { snapshot, loading, error, cargar, previewSeccion, aplicar }
}
