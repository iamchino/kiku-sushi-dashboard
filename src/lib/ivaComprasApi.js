import { supabase } from './supabase'

// Lecturas y escrituras del IVA de las compras (SQL 61). La lógica pura está
// en ivaCompras.js. Sin el SQL 61 todo responde "no disponible" y las
// pantallas esconden la sección y el recuadro.

let disponible = null

function faltaEsquema(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST204|PGRST205|42703|42883|42P01|schema cache|Could not find|does not exist/i.test(msg)
}

/** ¿Corrió el SQL 61? Se pregunta una vez por sesión. */
export async function ivaComprasDisponible() {
  if (disponible !== null) return disponible
  // Se filtra por la columna (no solo se la pide): así la pregunta falla sin
  // el SQL 61 en cualquier servidor. Un corte de red no se recuerda.
  const { error } = await supabase.from('egresos').select('id').is('iva_credito', null).limit(1)
  if (error && !faltaEsquema(error)) return false
  disponible = !error
  return disponible
}

/** Pone, cambia o saca (iva = null) el IVA de un pago. */
export async function guardarIvaDePago(egresoId, { iva, alicuota = null, facturaFecha = null }) {
  const { data, error } = await supabase.rpc('egreso_guardar_iva', {
    p_egreso_id: egresoId,
    p_iva: iva === null || iva === undefined ? null : Number(iva),
    p_alicuota: iva === null || iva === undefined ? null : (alicuota || 'mixto'),
    p_factura_fecha: facturaFecha || null,
  })
  if (error) throw new Error(error.message)
  return data
}

/** { disponible, resumen: { facturas, total, iva, sinIva, porAlicuota } } del período, por fecha de factura. */
export async function cargarResumenIvaCompras(desde, hasta) {
  const { data, error } = await supabase.rpc('iva_compras_resumen', { p_desde: desde, p_hasta: hasta })
  if (error) {
    if (faltaEsquema(error)) return { disponible: false, resumen: null }
    throw new Error(error.message)
  }
  const d = data || {}
  return {
    disponible: true,
    resumen: {
      facturas: Number(d.facturas) || 0,
      total: Number(d.total) || 0,
      iva: Number(d.iva) || 0,
      sinIva: Number(d.sin_iva) || 0,
      porAlicuota: d.por_alicuota || {},
    },
  }
}

/** Los pagos con IVA cargado cuya factura cae en el período (para la hoja "IVA compras"). */
export async function cargarComprasConIva(desde, hasta) {
  const armar = (conCuit) => supabase.from('egresos')
    .select(`id, fecha, factura_fecha, descripcion, monto, iva_credito, iva_alicuota, estado, medio_pago, comprobante_nro, proveedor:proveedores(${conCuit ? 'razon_social, cuit_cuil' : 'razon_social'})`)
    .not('iva_credito', 'is', null)
    .gte('factura_fecha', desde).lte('factura_fecha', hasta)
    .order('factura_fecha', { ascending: true })
    .limit(1000)
  let { data, error } = await armar(true)
  if (error && !faltaEsquema(error)) ({ data, error } = await armar(false))
  if (error) {
    if (faltaEsquema(error)) return null
    throw new Error(error.message)
  }
  return data || []
}
