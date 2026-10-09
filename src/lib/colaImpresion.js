import { supabase } from './supabase'

/**
 * Cola de impresión: cuando este dispositivo no llega a Comandera Print, deja
 * el ticket en `cola_impresion` y la PC del local (que sí está conectada) lo
 * imprime. Ver supabase/migrations/20261009000000_cola_impresion.sql.
 */

// Más viejo que esto, un ticket no se ofrece: evita una ráfaga de comandas
// viejas cuando la PC vuelve después de un rato.
export const VENCIMIENTO_MS = 15 * 60 * 1000
// Más de esto en "imprimiendo" = la PC que lo tomó se cerró a mitad de camino.
export const TOMADO_MAX_MS = 60 * 1000
// Cuánto espera el celular a que la PC imprima antes de decir "quedó pendiente".
const ESPERA_RESULTADO_MS = 90 * 1000

export function colaHabilitada() {
  try { return localStorage.getItem('kiku.cola.deshabilitada') !== '1' } catch { return true }
}

async function nombreUsuario() {
  try {
    const { data } = await supabase.auth.getUser()
    const email = data?.user?.email || ''
    return email.split('@')[0] || ''
  } catch { return '' }
}

/**
 * Deja un ticket en la cola. Devuelve { id } enseguida; el resultado lo sigue
 * el aviso flotante (ColaImpresionAvisos) con esperarResultado().
 */
export async function encolarTicket({ tipo, titulo, printerName, printerType, content, fontSize, paperWidth, qrCodeData }) {
  const fila = {
    tipo,
    titulo: String(titulo || '').slice(0, 120),
    printer_name: printerName,
    printer_type: printerType || 'USB',
    contenido: String(content || ''),
    font_size: Number(fontSize || 1),
    paper_width: Number(paperWidth || 58),
    qr_code_data: qrCodeData ? String(qrCodeData) : null,
    creado_por_nombre: await nombreUsuario(),
  }
  const { data, error } = await supabase.from('cola_impresion').insert(fila).select('id').single()
  if (error) throw new Error(`No se pudo dejar el ticket en la cola: ${error.message}`)
  const res = { id: data.id, tipo, titulo: fila.titulo }
  // Aviso flotante en este dispositivo (ColaImpresionAvisos lo escucha).
  try { window.dispatchEvent(new CustomEvent('kiku:cola-impresion', { detail: res })) } catch { /* sin window */ }
  return res
}

/**
 * Espera (hasta ESPERA_RESULTADO_MS) a que la PC resuelva el ticket.
 * Devuelve { estado, error }: estado final, o 'pendiente' si nadie respondió.
 */
export async function esperarResultado(id, { esperaMs = ESPERA_RESULTADO_MS, cancelado } = {}) {
  const limite = Date.now() + esperaMs
  while (Date.now() < limite) {
    await new Promise(r => setTimeout(r, 1500))
    if (cancelado?.()) return { estado: 'pendiente', error: null }
    const { data: f } = await supabase.from('cola_impresion').select('estado, error').eq('id', id).maybeSingle()
    if (f && (f.estado === 'impreso' || f.estado === 'error' || f.estado === 'descartado')) {
      return { estado: f.estado, error: f.error || null }
    }
  }
  return { estado: 'pendiente', error: null }
}

/** Texto para la persona según cómo terminó. */
export function explicarResultadoCola(res) {
  if (!res) return ''
  if (res.estado === 'impreso') return 'Impreso desde la PC del local.'
  if (res.estado === 'error') return `La PC no pudo imprimirlo: ${res.error || 'error en la impresora'}.`
  if (res.estado === 'descartado') return 'Alguien lo descartó en la PC del local.'
  return 'Enviado a la PC del local: queda pendiente hasta que alguien lo imprima ahí.'
}

/** Pendientes vigentes (para la PC): sin vencer; los "imprimiendo" colgados y los errores recientes cuentan. */
export async function cargarPendientes() {
  const desde = new Date(Date.now() - VENCIMIENTO_MS).toISOString()
  const { data, error } = await supabase
    .from('cola_impresion')
    .select('id, creado_at, tipo, titulo, printer_name, printer_type, contenido, font_size, paper_width, qr_code_data, estado, error, tomado_at, creado_por_nombre')
    .in('estado', ['pendiente', 'imprimiendo', 'error'])
    .gte('creado_at', desde)
    .order('creado_at', { ascending: true })
  if (error) throw error
  const ahora = Date.now()
  // Los 'error' recientes también se muestran (para reintentar o descartar).
  return (data || []).filter(f =>
    f.estado === 'pendiente' || f.estado === 'error' ||
    (f.estado === 'imprimiendo' && f.tomado_at && ahora - new Date(f.tomado_at).getTime() > TOMADO_MAX_MS)
  )
}

/**
 * Reserva un ticket para imprimirlo desde este dispositivo. Devuelve false si
 * otro ya lo tomó (dos PCs con el dashboard abierto no imprimen el mismo).
 */
export async function tomarTicket(id) {
  const limiteColgado = new Date(Date.now() - TOMADO_MAX_MS).toISOString()
  const { data, error } = await supabase
    .from('cola_impresion')
    .update({ estado: 'imprimiendo', tomado_at: new Date().toISOString() })
    .eq('id', id)
    .in('estado', ['pendiente', 'imprimiendo'])
    .or(`estado.eq.pendiente,tomado_at.lt.${limiteColgado}`)
    .select('id')
  if (error) throw error
  return (data || []).length === 1
}

export async function resolverTicket(id, estado, errorTexto = null) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('cola_impresion')
    .update({
      estado,
      error: errorTexto ? String(errorTexto).slice(0, 500) : null,
      resuelto_at: new Date().toISOString(),
      resuelto_por: u?.user?.id || null,
    })
    .eq('id', id)
  if (error) throw error
}

/** Lo vuelve a dejar disponible (después de un error, para reintentar). */
export async function reabrirTicket(id) {
  const { error } = await supabase
    .from('cola_impresion')
    .update({ estado: 'pendiente', error: null, tomado_at: null })
    .eq('id', id)
  if (error) throw error
}

export function tituloTipo(tipo) {
  return tipo === 'comanda' ? 'Comanda' : tipo === 'fiscal' ? 'Factura' : 'Ticket'
}
