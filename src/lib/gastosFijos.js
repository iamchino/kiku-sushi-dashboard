// Gastos fijos (SQL 60): el alquiler, los autónomos, el F931… Se cargan UNA
// vez con el día del mes en que vencen y el sistema crea el pendiente de cada
// mes (generar_gastos_fijos(), en la base). Lógica pura, sin Supabase ni
// React: se prueba con `npm run verificar:gastosfijos`.
//
// Las reglas de fechas son las mismas que en la base:
//   · el pendiente del mes vence el día pedido o, si el mes es más corto, el
//     último día (31 en noviembre → 30; 30 en febrero → 28 o 29);
//   · cada mes se llama "Alquiler · noviembre 2026".

import { CATEGORIAS, MEDIOS_PAGO, MEDIO_CANJE, fmtFecha, localDateISO } from './finanzas'
import { leerSaldo } from './disponible'

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Las categorías que puede tener un gasto fijo: todas menos sueldos (van por la liquidación). */
export const CATEGORIAS_FIJAS = CATEGORIAS.filter(c => c.id !== 'sueldos')

/** Los medios previstos: todos menos canje (un pendiente no puede ser canje). */
export const MEDIOS_FIJOS = MEDIOS_PAGO.filter(m => m.id !== MEDIO_CANJE)

/** 'YYYY-MM' de una fecha 'YYYY-MM-DD'. */
export function periodoDe(fechaISO) {
  const s = String(fechaISO || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(s) ? s : null
}

/** El mes siguiente a 'YYYY-MM'. */
export function periodoSiguiente(periodo) {
  const [y, m] = String(periodo).split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** "noviembre 2026". */
export function mesTexto(periodo) {
  const [y, m] = String(periodo || '').split('-').map(Number)
  if (!y || !m) return ''
  return `${MESES[m - 1]} ${y}`
}

/** Días que tiene el mes 'YYYY-MM'. */
export function diasDelMes(periodo) {
  const [y, m] = String(periodo).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** El vencimiento de un mes: el día pedido, o el último del mes si no existe. 'YYYY-MM-DD'. */
export function vencimientoDelMes(periodo, dia) {
  const d = Math.min(Math.max(Number(dia) || 1, 1), diasDelMes(periodo))
  return `${periodo}-${String(d).padStart(2, '0')}`
}

/** "el 10 de cada mes", "el último día de cada mes", "el 30 de cada mes (en febrero, el último día)". */
export function textoDia(dia) {
  const d = Number(dia)
  if (!Number.isInteger(d) || d < 1 || d > 31) return ''
  if (d === 31) return 'el último día de cada mes'
  if (d >= 29) return `el ${d} de cada mes (en febrero, el último día)`
  return `el ${d} de cada mes`
}

/** La descripción con la que se crea el pendiente de cada mes. */
export function descripcionDelMes(descripcion, periodo) {
  return `${String(descripcion || '').trim()} · ${mesTexto(periodo)}`
}

/**
 * El primer mes que conviene proponer al cargar un gasto fijo nuevo: el
 * actual si su vencimiento todavía no pasó; si ya pasó, el que viene (lo de
 * este mes seguramente ya se pagó o ya se cargó a mano).
 */
export function primerMesSugerido(dia, hoyISO = localDateISO()) {
  const actual = periodoDe(hoyISO)
  return vencimientoDelMes(actual, dia) >= hoyISO ? actual : periodoSiguiente(actual)
}

/** Las dos opciones de "Primer mes": este y el que viene. */
export function mesesParaElegir(hoyISO = localDateISO()) {
  const actual = periodoDe(hoyISO)
  const sig = periodoSiguiente(actual)
  return [
    { value: actual, label: `${mesTexto(actual)} (este mes)` },
    { value: sig, label: mesTexto(sig) },
  ]
}

/**
 * El próximo vencimiento de un gasto fijo, contado desde hoy: el de este mes
 * si todavía no pasó, si no el del que viene; nunca antes de su primer mes.
 * Null si está pausado.
 */
export function proximoVencimiento(gasto, hoyISO = localDateISO()) {
  if (!gasto || gasto.activo === false) return null
  let periodo = periodoDe(hoyISO)
  if (gasto.desde && gasto.desde > periodo) periodo = gasto.desde
  let venc = vencimientoDelMes(periodo, gasto.dia_vencimiento)
  if (venc < hoyISO) venc = vencimientoDelMes(periodoSiguiente(periodo), gasto.dia_vencimiento)
  return venc
}

// Un mes suelto (entero o abreviado), con o sin año pegado: "NOVIEMBRE26",
// "oct 2026", "Dic.". No toca palabras que solo empiezan igual (Marketing,
// Junín): antes y después tiene que haber algo que no sea letra ni número.
const MES_SUELTO = new RegExp(
  `(?<![\\p{L}\\d])(?:${MESES.join('|')}|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)\\.?[-/ ]?(?:del? )?(?:\\d{4}|\\d{2})?(?![\\p{L}\\d])`,
  'giu',
)

/**
 * Le saca a una descripción el mes que tiene escrito, para proponer el nombre
 * del gasto fijo: "F931 NV NOVIEMBRE26" → "F931 NV", "Alquiler octubre 2026"
 * → "Alquiler", "Luz 10/2026" → "Luz". Si no queda nada, la deja como está.
 */
export function limpiarMes(descripcion) {
  const original = String(descripcion || '').trim()
  const limpio = original
    .replace(MES_SUELTO, ' ')
    .replace(/(?<!\d)(?:0?[1-9]|1[0-2])[/-](?:\d{4}|\d{2})(?!\d)/g, ' ')
    .replace(/\s*[-·,/]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[\s\-·,/]+$/g, '')
  return limpio || original
}

/** "4 gastos fijos · $1.234.000 por mes" (solo los activos). */
export function resumenGastosFijos(lista = []) {
  const activos = lista.filter(g => g.activo !== false)
  const total = activos.reduce((s, g) => s + (Number(g.monto) || 0), 0)
  return { activos: activos.length, pausados: lista.length - activos.length, total }
}

/**
 * Valida el formulario de un gasto fijo, con los mismos mensajes que la base.
 * @returns {{ ok, error?, datos? }}
 */
export function validarGastoFijo(form = {}, hoyISO = localDateISO()) {
  const descripcion = String(form.descripcion || '').trim()
  if (!descripcion) return { ok: false, error: 'Falta la descripción del gasto fijo.' }
  if (descripcion.length > 120) return { ok: false, error: 'La descripción es muy larga (máximo 120 letras).' }
  if (form.categoria === 'sueldos') return { ok: false, error: 'Los sueldos no van como gasto fijo: se pagan desde Personal → Liquidación.' }
  if (!CATEGORIAS_FIJAS.some(c => c.id === form.categoria)) return { ok: false, error: 'Elegí la categoría.' }
  // Como el saldo de los bancos: "800.000" son ochocientos mil (los puntos
  // de a tres cifras son miles) y "16644,03" / "16.644,03" llevan centavos.
  const monto = leerSaldo(form.monto)
  if (!(monto > 0)) return { ok: false, error: 'El monto tiene que ser mayor a cero.' }
  if (monto >= 1e10) return { ok: false, error: 'Ese monto es demasiado grande: revisá los ceros.' }
  const dia = Number(form.dia_vencimiento)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { ok: false, error: 'El día de vencimiento tiene que estar entre 1 y 31.' }
  const medio = form.medio_pago || 'transferencia'
  if (medio === MEDIO_CANJE) return { ok: false, error: 'Un gasto fijo no se puede pagar con canje: el canje se elige al pagarlo.' }
  if (!MEDIOS_FIJOS.some(m => m.id === medio)) return { ok: false, error: 'Elegí el medio de pago.' }
  const notas = String(form.notas || '').trim()
  if (notas.length > 300) return { ok: false, error: 'Las notas son muy largas (máximo 300 letras).' }
  const desde = form.desde || null
  if (desde && form.nuevo && desde < periodoDe(hoyISO)) return { ok: false, error: 'El primer mes no puede ser anterior al mes actual.' }
  return {
    ok: true,
    datos: {
      descripcion, categoria: form.categoria, monto: Math.round(monto * 100) / 100, dia_vencimiento: dia,
      medio_pago: medio, proveedor_id: form.proveedor_id || null, notas: notas || null, desde,
    },
  }
}

/**
 * Lo que se le cuenta a quien tilda "Se repite todos los meses" en un pago:
 * de qué mes es este pago y desde cuándo se carga solo.
 */
export function explicarRepeticion({ estado, fecha, vencimiento, dia, nombre }) {
  const base = estado === 'pendiente' && vencimiento ? vencimiento : fecha
  const periodo = periodoDe(base) || periodoDe(localDateISO())
  const sig = periodoSiguiente(periodo)
  const d = Number(dia)
  const venc = Number.isInteger(d) && d >= 1 && d <= 31 ? vencimientoDelMes(sig, d) : null
  return {
    periodo, siguiente: sig,
    texto: `Este pago queda como el de ${mesTexto(periodo)}. Desde ${mesTexto(sig)} se carga solo como pendiente`
      + ` («${descripcionDelMes(nombre, sig)}»${venc ? `, vence el ${fmtFecha(venc)}` : ''}).`,
  }
}
