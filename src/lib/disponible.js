// "Disponible hoy" (Finanzas → Resumen): con cuánta plata cuenta el negocio
// ahora mismo y dónde está. Lógica pura, sin Supabase ni React (se prueba con
// `npm run verificar:finanzas`).
//
// Tres lugares:
//   · caja del día   → el efectivo esperado del turno abierto o, con la caja
//                      cerrada, lo que quedó en el cajón del último cierre;
//   · caja fuerte    → su saldo;
//   · cuentas del negocio (banco, Mercado Pago…) → el último saldo que cargó
//     administración mirando el home banking (SQL 59). El dashboard NO se
//     conecta a ningún banco: es un saldo informado, con su fecha.
//
// Lo que no se puede ver (sin permiso, o una cuenta sin saldo cargado) queda
// con monto null: se muestra, pero no suma, y el total avisa que es parcial.

import { fmtFecha, fmtPlata, localDateISO } from './finanzas'

/** Un saldo de banco con estos días (o más) se marca como viejo. */
export const DIAS_SALDO_VIEJO = 7

/** Días entre dos fechas 'YYYY-MM-DD' (b − a). Sin horas: no hay corrimientos. */
export function diasEntre(a, b) {
  const [ya, ma, da] = String(a || '').slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = String(b || '').slice(0, 10).split('-').map(Number)
  if (!ya || !yb) return null
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

const haceDias = (n) => (n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`)

/** La plata del recuadro: con centavos solo si los tiene. */
export const fmtSaldo = fmtPlata

/** Fila de la caja del día. `caja` = { visible, abierta, monto, fecha } o null. */
export function filaCaja(caja) {
  if (!caja || caja.visible === false) {
    return { id: 'caja', tipo: 'caja', nombre: 'Caja del día', monto: null, detalle: 'Sin acceso a Caja', sinAcceso: true }
  }
  if (caja.abierta) {
    return { id: 'caja', tipo: 'caja', nombre: 'Caja del día', monto: Number(caja.monto) || 0, detalle: 'Turno abierto · efectivo esperado' }
  }
  const monto = caja.monto === null || caja.monto === undefined ? 0 : Number(caja.monto) || 0
  return {
    id: 'caja', tipo: 'caja', nombre: 'Caja del día', monto,
    detalle: caja.fecha
      ? `Caja cerrada · lo que quedó en el cajón del cierre del ${fmtFecha(caja.fecha)}`
      : 'Caja cerrada · sin efectivo en el cajón',
  }
}

/** Fila de la caja fuerte. `cajaFuerte` = { visible, saldo } o null. */
export function filaCajaFuerte(cajaFuerte) {
  if (!cajaFuerte || cajaFuerte.visible === false || cajaFuerte.saldo === null || cajaFuerte.saldo === undefined) {
    return { id: 'caja_fuerte', tipo: 'caja_fuerte', nombre: 'Caja fuerte', monto: null, detalle: 'Sin acceso a la caja fuerte', sinAcceso: true }
  }
  return { id: 'caja_fuerte', tipo: 'caja_fuerte', nombre: 'Caja fuerte', monto: Number(cajaFuerte.saldo) || 0, detalle: 'Efectivo guardado' }
}

/**
 * Fila de una cuenta del negocio. `c` = fila de cuentas_negocio_saldos_vigentes():
 * { cuenta_id, nombre, tipo, activa, saldo, fecha, usuario_nombre, pagado_despues, pagos_despues }.
 */
export function filaCuenta(c, hoyISO = localDateISO()) {
  const sinSaldo = c.saldo === null || c.saldo === undefined
  const base = {
    id: c.cuenta_id, tipo: 'cuenta', clase: c.tipo || 'banco', nombre: c.nombre,
    activa: c.activa !== false, cuenta: c,
  }
  if (sinSaldo) {
    return { ...base, monto: null, sinSaldo: true, detalle: 'Sin saldo cargado todavía' }
  }
  const dias = diasEntre(c.fecha, hoyISO)
  const viejo = dias !== null && dias >= DIAS_SALDO_VIEJO
  const pagado = Number(c.pagado_despues) || 0
  const pagos = Number(c.pagos_despues) || 0
  return {
    ...base,
    monto: Number(c.saldo) || 0,
    fecha: c.fecha, dias, viejo,
    detalle: `Saldo del ${fmtFecha(c.fecha)}${dias !== null ? ` (${haceDias(dias)})` : ''}${c.usuario_nombre ? ` · lo cargó ${c.usuario_nombre}` : ''}`,
    // Lo que salió después de ese saldo: no se resta (el sistema no ve lo que
    // entró), pero avisa que el número ya no es el del banco.
    aviso: pagado > 0
      ? `Después de ese saldo se ${pagos === 1 ? 'pagó' : 'pagaron'} ${fmtSaldo(pagado)} por transferencia desde esta cuenta${pagos > 1 ? ` (${pagos} pagos)` : ''}. Conviene actualizarlo.`
      : viejo ? 'Tiene más de una semana: conviene actualizarlo.' : null,
  }
}

/**
 * Arma el recuadro completo.
 * @param {object} caja        { visible, abierta, monto, fecha }
 * @param {object} cajaFuerte  { visible, saldo }
 * @param {object} cuentas     { disponible, filas } — disponible=false: falta el SQL 59
 * @returns {{ filas, total, parcial, faltan, cuentasDisponible }}
 */
export function armarDisponible({ caja, cajaFuerte, cuentas, hoyISO = localDateISO() } = {}) {
  const cuentasDisponible = cuentas?.disponible !== false
  const filas = [
    filaCaja(caja),
    filaCajaFuerte(cajaFuerte),
    ...(cuentasDisponible ? (cuentas?.filas || []).map(c => filaCuenta(c, hoyISO)) : []),
  ]
  const total = filas.reduce((s, f) => s + (f.monto === null ? 0 : f.monto), 0)
  const faltan = filas.filter(f => f.monto === null).map(f => f.nombre)
  return { filas, total, parcial: faltan.length > 0 || !cuentasDisponible, faltan, cuentasDisponible }
}

/** "Sin contar Banco Galicia y Mercado Pago" para el pie del total. */
export function textoFaltan(faltan) {
  if (!faltan || faltan.length === 0) return ''
  const lista = faltan.length === 1 ? faltan[0]
    : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`
  return `Sin contar ${lista}`
}

/**
 * Lee un saldo tipeado como lo escribe la gente y como lo muestra el home
 * banking: "500.000" son quinientos mil (los puntos de a tres cifras son
 * miles), "1.250.000,50" y "500000.75" llevan centavos, "-35.000" es un
 * descubierto. Devuelve null si no es un número.
 *
 * Ojo: es la misma regla que usa la caja (parseAmount) y NO la del campo
 * Monto de Registrar pago, donde un punto solo se lee como decimal.
 */
export function leerSaldo(texto) {
  let s = String(texto ?? '').trim().replace(/\s|\$/g, '')
  if (!s) return null
  const negativo = s.startsWith('-')
  if (negativo) s = s.slice(1)
  if (!/^\d[\d.,]*$/.test(s)) return null
  const comas = (s.match(/,/g) || []).length
  const puntos = (s.match(/\./g) || []).length
  if (comas && puntos) {
    // Conviven los dos: el que está más a la derecha es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (comas) {
    s = comas > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (puntos && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/**
 * Valida lo que se tipea al cargar un saldo. Acepta el formato argentino
 * ("1.250.000,50") y negativos (descubierto).
 * @returns {{ ok, saldo?, fecha?, nota?, error? }}
 */
export function validarSaldo({ saldo, fecha, nota } = {}, hoyISO = localDateISO()) {
  const texto = String(saldo ?? '').trim()
  if (!texto) return { ok: false, error: 'Escribí el saldo que figura en el banco.' }
  const valor = leerSaldo(texto)
  if (valor === null) return { ok: false, error: 'Ese saldo no es un número.' }
  if (Math.abs(valor) >= 1e12) return { ok: false, error: 'Ese saldo es demasiado grande: revisá los ceros.' }
  const f = String(fecha || hoyISO).slice(0, 10)
  if (f > hoyISO) return { ok: false, error: 'La fecha del saldo no puede ser futura.' }
  const n2 = String(nota ?? '').trim()
  if (n2.length > 200) return { ok: false, error: 'La nota es muy larga (máximo 200 letras).' }
  return { ok: true, saldo: Math.round(valor * 100) / 100, fecha: f, nota: n2 || null }
}
