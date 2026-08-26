import { supabase } from './supabase'

// Edición, anulación e historial de los pagos del negocio (los egresos).
//
// Un pago no es una fila sola: cuando sale plata de verdad, la base también
// guarda su REFLEJO — un movimiento de la caja del día o de la caja fuerte.
// Editar el egreso a mano tocaba solo la primera mitad y dejaba el arqueo y el
// saldo de la caja fuerte mal, sin avisar. Por eso todo pasa por los RPC
// editar_pago() / anular_pago(), que corrigen las dos mitades juntas.

function faltaLaFuncion(err) {
  const code = err?.code || ''
  const msg = String(err?.message || '').toLowerCase()
  return code === 'PGRST202' || code === '42883' ||
    msg.includes('could not find the function') || msg.includes('does not exist')
}

// Un pago con origen registrado tiene reflejo en alguna caja: sin el RPC no se
// puede tocar sin romper el arqueo, así que preferimos no hacerlo.
function tieneReflejo(pago) {
  return Boolean(pago?.pagado_desde)
}

const SIN_RPC = 'Para editar este pago falta correr la migración de pagos en Supabase: salió de una caja y hay que mover también el movimiento de esa caja, si no el arqueo queda mal.'
const SIN_RPC_BORRAR = 'Para anular este pago falta correr la migración de pagos en Supabase: salió de una caja y hay que revertir también el movimiento de esa caja.'

/**
 * Corrige un pago y su reflejo en la caja. `form` usa los mismos nombres que
 * el alta. `origen`: 'auto' mantiene el que ya tenía.
 * Devuelve { egreso_id, origen, movimiento_id, descuenta_arqueo, ... }.
 */
export async function editarPago(pago, form, motivo = null) {
  const id = pago?.id || pago
  if (!id) throw new Error('Falta el pago a editar.')

  const { data, error } = await supabase.rpc('editar_pago', {
    p_egreso_id:    id,
    p_categoria:    form.categoria,
    p_descripcion:  form.descripcion,
    p_monto:        Number(form.monto),
    p_medio_pago:   form.medio_pago,
    p_estado:       form.estado,
    p_fecha:        form.fecha || null,
    p_proveedor_id: form.proveedor_id || null,
    p_empleado_id:  form.empleado_id || null,
    p_subtipo:      form.subtipo || null,
    p_periodo:      form.periodo || null,
    p_vencimiento:  form.vencimiento || null,
    p_comprobante:  form.comprobante_nro || null,
    p_notas:        form.notas || null,
    p_origen:       form.origen || 'auto',
    p_motivo:       motivo?.trim() || null,
  })
  if (!error) return data
  if (!faltaLaFuncion(error)) throw new Error(error.message)

  // Plan B sin el RPC: solo para pagos que no movieron ninguna caja. Si movió
  // plata, editarlo a medias es peor que no editarlo.
  if (tieneReflejo(pago)) throw new Error(SIN_RPC)

  const { data: filas, error: e2 } = await supabase
    .from('egresos')
    .update({
      fecha: form.fecha || null,
      categoria: form.categoria,
      subtipo: form.subtipo || null,
      descripcion: form.descripcion,
      monto: Number(form.monto),
      medio_pago: form.medio_pago,
      estado: form.estado,
      vencimiento: form.estado === 'pendiente' ? (form.vencimiento || null) : null,
      proveedor_id: form.proveedor_id || null,
      empleado_id: form.empleado_id || null,
      comprobante_nro: form.comprobante_nro || null,
      notas: form.notas || null,
    })
    .eq('id', id)
    .select('id')
  if (e2) throw new Error(e2.message)
  if (!filas?.length) {
    throw new Error('No se pudo guardar: tu usuario no tiene permiso para editar pagos.')
  }
  return { egreso_id: id, origen: null, sin_rpc: true }
}

/** Anula un pago y revierte su movimiento de caja. */
export async function anularPago(pago, motivo = null) {
  const id = pago?.id || pago
  if (!id) throw new Error('Falta el pago a anular.')

  const { data, error } = await supabase.rpc('anular_pago', {
    p_egreso_id: id,
    p_motivo: motivo?.trim() || null,
  })
  if (!error) return data
  if (!faltaLaFuncion(error)) throw new Error(error.message)

  if (tieneReflejo(pago)) throw new Error(SIN_RPC_BORRAR)

  const { data: filas, error: e2 } = await supabase
    .from('egresos').delete().eq('id', id).select('id')
  if (e2) throw new Error(e2.message)
  if (!filas?.length) {
    throw new Error('No se pudo anular: tu usuario no tiene permiso para borrar pagos.')
  }
  return { egreso_id: id, sin_rpc: true }
}

/** Historial de un pago, del cambio más nuevo al más viejo. */
export async function historialDePago(egresoId) {
  if (!egresoId) return []
  const { data, error } = await supabase
    .from('egresos_auditoria')
    .select('*')
    .eq('egreso_id', egresoId)
    .order('created_at', { ascending: false })
  // Sin la migración corrida la tabla no existe: se muestra vacío, no se rompe.
  if (error) return []
  return data || []
}

// ── Cómo se lee un renglón del historial ────────────────────────────────────
export const EVENTO_PAGO = {
  creado:  { label: 'Se registró', color: '#34d399' },
  editado: { label: 'Se corrigió', color: '#f59e0b' },
  anulado: { label: 'Se anuló',    color: '#f87171' },
}

// Nombres de campo en criollo, para no mostrarle `comprobante_nro` a nadie.
export const CAMPO_PAGO = {
  fecha: 'fecha',
  categoria: 'categoría',
  subtipo: 'tipo',
  descripcion: 'descripción',
  monto: 'monto',
  medio_pago: 'medio de pago',
  estado: 'estado',
  vencimiento: 'vencimiento',
  periodo: 'período',
  proveedor_id: 'proveedor',
  empleado_id: 'empleado',
  comprobante_nro: 'comprobante',
  notas: 'notas',
  caja_turno_id: 'turno de caja',
  pagado_desde: 'de dónde salió',
  recurrente: 'recurrente',
}

const ORIGEN_TEXTO = {
  caja: 'la caja del día',
  caja_fuerte: 'la caja fuerte',
  banco: 'la cuenta del banco',
}

// Un valor crudo del historial, listo para mostrar.
export function valorPago(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (campo === 'monto') return `$${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
  if (campo === 'pagado_desde') return ORIGEN_TEXTO[valor] || String(valor)
  if (campo === 'caja_turno_id' || campo === 'proveedor_id' || campo === 'empleado_id') return 'asignado'
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  return String(valor)
}

// Los cambios de un renglón 'editado', ya filtrados y traducidos.
// Se ocultan los campos que no le dicen nada a nadie.
const OCULTOS = new Set(['id', 'created_at', 'updated_at', 'usuario_id', 'periodo'])

export function cambiosDePago(fila) {
  const cambios = fila?.detalle?.cambios
  if (!cambios) return []
  return Object.entries(cambios)
    .filter(([campo]) => !OCULTOS.has(campo))
    .map(([campo, v]) => ({
      campo,
      label: CAMPO_PAGO[campo] || campo,
      antes: valorPago(campo, v?.antes),
      despues: valorPago(campo, v?.despues),
    }))
}
