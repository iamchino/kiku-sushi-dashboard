// Lecturas del IVA de las ventas. La lógica pura está en ivaVentas.js.
import { supabase } from './supabase'
import { desgloseDesdeResumen } from './ivaVentas'

function faltaEsquema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST205|42P01|42883|schema cache|Could not find|does not exist/i.test(msg)
}

/**
 * IVA de las ventas por fecha de emisión, ya sumado en la base
 * (iva_ventas_resumen, SQL 57). Lo usa Finanzas → Resumen: ese rol no lee los
 * comprobantes uno por uno, y un mes de facturas pasa las 1000 filas de la API.
 *   → { disponible: false }            si todavía no se corrió el SQL 57
 *   → { disponible: true, desglose }   mismo formato que desgloseIva()
 */
export async function cargarResumenIva(desde, hasta) {
  const { data, error } = await supabase.rpc('iva_ventas_resumen', { p_desde: desde, p_hasta: hasta })
  if (error) {
    if (faltaEsquema(error)) return { disponible: false, desglose: null }
    throw new Error(error.message || 'No se pudo leer el IVA de las ventas.')
  }
  return { disponible: true, desglose: desgloseDesdeResumen(data) }
}

// Solo lo que usa la hoja del Excel: sin los JSON de ARCA, que pesan.
const COLUMNAS = 'id, pedido_id, estado, letra, tipo_cbte, punto_venta, numero, fecha_emision, doc_tipo, doc_nro, '
  + 'receptor_nombre, receptor_condicion_iva, importe_neto, importe_iva, importe_total, cae, cbte_asociado_id'
const PAGINA = 1000

/**
 * Todos los comprobantes EMITIDOS entre dos fechas (las dos inclusive), para
 * la hoja "IVA ventas" del Excel. Va de a páginas: la API devuelve hasta 1000
 * filas por pedido y un mes de facturas las pasa.
 */
export async function cargarComprobantesEmitidos(desde, hasta) {
  const todos = []
  for (let pagina = 0; pagina < 500; pagina++) {
    const { data, error } = await supabase
      .from('comprobantes_fiscales')
      .select(COLUMNAS)
      .gte('fecha_emision', desde)
      .lte('fecha_emision', hasta)
      .in('estado', ['autorizado', 'anulado'])
      .order('fecha_emision', { ascending: true })
      .order('id', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
    if (error) throw new Error(error.message || 'No se pudieron leer los comprobantes emitidos.')
    todos.push(...(data || []))
    if (!data || data.length < PAGINA) break
  }
  return todos
}

/**
 * Número de pedido de cada comprobante: los que ya están en pantalla salen de
 * ahí; los que no (facturas emitidas otro día que el pedido), se piden.
 * → Map pedido_id → número
 */
export async function cargarNumerosDePedido(comprobantes, pedidosEnPantalla = []) {
  const mapa = new Map(pedidosEnPantalla.filter(p => p.numero != null).map(p => [p.id, p.numero]))
  const faltan = [...new Set((comprobantes || []).map(c => c.pedido_id).filter(id => id && !mapa.has(id)))]
  for (let i = 0; i < faltan.length; i += 200) {
    const { data, error } = await supabase.from('pedidos').select('id, numero').in('id', faltan.slice(i, i + 200))
    if (error) break   // el número de pedido es un dato de referencia: sin él la hoja sale igual
    for (const p of data || []) if (p.numero != null) mapa.set(p.id, p.numero)
  }
  return mapa
}
