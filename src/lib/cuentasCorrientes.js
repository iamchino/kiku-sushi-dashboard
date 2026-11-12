// Cuentas corrientes: canjes y consumos a cuenta (revista, proveedor, etc.).
//
// Una cuenta tiene un monto acordado; cada consumo lo va bajando. Saldo =
// acordado − suma de movimientos (cuenta_corriente_movimientos.monto).
//
// Al cobrar una mesa o un pedido, "Cuenta corriente" es un medio de pago más:
// el pago queda en `pagos` con medio_pago = 'cuenta_corriente' y
// cuenta_corriente_id, y un trigger de la base crea el movimiento. NO es
// plata: no entra al arqueo ni al total cobrado.
//
// Acá va solo la lógica pura (sin Supabase), así se puede probar con node. Las
// lecturas de la base viven en cuentasCorrientesApi.js.
import { CONDICIONES_FACTURA_A, validateCuit } from './fiscal'
import { formatMoney } from './escposFormatter'

export const MEDIO_CUENTA_CORRIENTE = 'cuenta_corriente'
export const LABEL_CUENTA_CORRIENTE = 'Cuenta corriente'
export const COLOR_CUENTA_CORRIENTE = '#1FB8A6'

const TOLERANCIA = 1   // $1 por redondeo, igual que el pago dividido

export function faltaMigracionCuentas(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return /PGRST202|PGRST205|42P01|42703|42883|schema cache|Could not find|does not exist/i.test(msg)
}

export function normalizarCuenta(c) {
  return {
    ...c,
    monto_acordado: Number(c.monto_acordado || 0),
    consumido: Number(c.consumido || 0),
    saldo: Number(c.saldo || 0),
    vencida: Boolean(c.vencida),
  }
}

/** Se puede cargar algo a esta cuenta ahora (no vencida y con saldo). */
export function cuentaUsable(cuenta) {
  return Boolean(cuenta) && !cuenta.vencida && Number(cuenta.saldo || 0) > 0
}

/** Texto del desplegable: "Revista X · saldo $ 120.000". */
export function etiquetaCuenta(cuenta) {
  if (!cuenta) return ''
  if (cuenta.vencida) return `${cuenta.nombre} · vencida`
  if (Number(cuenta.saldo || 0) <= 0) return `${cuenta.nombre} · sin saldo`
  return `${cuenta.nombre} · saldo $${formatMoney(cuenta.saldo)}`
}

/** La cuenta tiene lo necesario para una Factura A (CUIT, razón social, condición). */
export function cuentaTieneDatosFiscales(cuenta) {
  return Boolean(cuenta)
    && validateCuit(cuenta.cuit)
    && String(cuenta.razon_social || '').trim().length > 0
    && CONDICIONES_FACTURA_A.includes(Number(cuenta.condicion_iva))
}

/** Estado del selector de comprobante con los datos fiscales de la cuenta. */
export function facturaDesdeCuenta(cuenta) {
  return {
    tipo: 'A',
    cuit: String(cuenta.cuit || ''),
    nombre: String(cuenta.razon_social || '').trim(),
    condicion: Number(cuenta.condicion_iva),
    domicilio: String(cuenta.domicilio || '').trim(),
    // Marca de "precargado desde la cuenta": si después se cambia el medio de
    // pago, el modal sabe que puede volver al comprobante del pedido.
    autoCuenta: true,
  }
}

/**
 * Revisa las líneas de pago que van a cuenta corriente contra los saldos.
 * Devuelve el texto del primer problema, o null si está todo bien.
 *
 * @param {Array} pagos    [{ medio_pago, monto, cuenta_corriente_id }]
 * @param {Array} cuentas  resultado de cargarCuentasParaCobro()
 * @param {Array} previos  pagos a cuenta que este mismo pedido ya tenía (se
 *                         borran al re-cobrar, así que su monto vuelve al saldo)
 */
export function problemaCuentaCorriente(pagos = [], cuentas = [], previos = []) {
  const porCuenta = new Map()
  for (const p of pagos) {
    if (p.medio_pago !== MEDIO_CUENTA_CORRIENTE) continue
    if (!p.cuenta_corriente_id) return 'Elegí a qué cuenta corriente va el consumo.'
    porCuenta.set(p.cuenta_corriente_id, (porCuenta.get(p.cuenta_corriente_id) || 0) + Number(p.monto || 0))
  }
  for (const [id, monto] of porCuenta) {
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) return 'La cuenta corriente elegida ya no está disponible (se desactivó o se borró).'
    if (cuenta.vencida) return `La cuenta corriente "${cuenta.nombre}" está vencida. Un admin puede extender la vigencia desde Dinero → Cuentas corrientes.`
    const devuelto = previos
      .filter(p => p.cuenta_corriente_id === id)
      .reduce((a, p) => a + Number(p.monto || 0), 0)
    const disponible = Number(cuenta.saldo || 0) + devuelto
    if (monto > disponible + TOLERANCIA) {
      return `El saldo de "${cuenta.nombre}" no alcanza: quedan $${formatMoney(Math.max(0, disponible))} y se quieren cargar $${formatMoney(monto)}. Cobrá la diferencia con otro medio (dividir pago).`
    }
  }
  return null
}

// ─── Sección Dinero → Cuentas corrientes ────────────────────────────────────

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date (evita el corrimiento UTC). */
export function fechaCorta(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

/**
 * Estado de una cuenta para mostrar: { id, label, color }.
 * hoyISO se pasa para poder testear.
 */
export function estadoCuenta(cuenta, hoyISO) {
  if (!cuenta) return { id: 'sin_datos', label: '', color: 'var(--text-muted)' }
  if (!cuenta.activa) return { id: 'inactiva', label: 'Inactiva', color: 'var(--text-muted)' }
  if (cuenta.vigencia_hasta && hoyISO && cuenta.vigencia_hasta < hoyISO) {
    return { id: 'vencida', label: 'Vencida', color: 'var(--warn)' }
  }
  const saldo = Number(cuenta.saldo || 0)
  if (saldo < -TOLERANCIA) return { id: 'excedida', label: 'Excedida', color: 'var(--bad)' }
  if (saldo <= TOLERANCIA) return { id: 'agotada', label: 'Agotada', color: 'var(--bad)' }
  return { id: 'vigente', label: 'Vigente', color: 'var(--ok)' }
}

/** Porcentaje consumido (0–100) para la barra de avance. */
export function porcentajeConsumido(cuenta) {
  const acordado = Number(cuenta?.monto_acordado || 0)
  const consumido = Number(cuenta?.consumido || 0)
  if (acordado <= 0) return consumido > 0 ? 100 : 0
  return Math.max(0, Math.min(100, (consumido / acordado) * 100))
}

/**
 * Movimientos con el saldo que quedó después de cada uno. Entran en cualquier
 * orden; salen del más nuevo al más viejo (como se muestran).
 */
export function conSaldoCorrido(movimientos = [], montoAcordado = 0) {
  const ordenados = [...movimientos].sort((a, b) => (
    String(a.fecha).localeCompare(String(b.fecha))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  ))
  let saldo = Number(montoAcordado || 0)
  const conSaldo = ordenados.map(m => {
    saldo -= Number(m.monto || 0)
    return { ...m, saldo_despues: Math.round(saldo * 100) / 100 }
  })
  return conSaldo.reverse()
}
