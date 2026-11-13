// Lógica pura de "la boleta con sus productos" y del reporte de faltantes.
// Sin supabase ni React: se prueba con `npm run verificar:compras`.
//
// La idea: el pago a un proveedor y la entrada de mercadería son UNA sola
// carga. En Registrar pago se anotan los productos de la boleta; al guardar,
// la base mete cada cantidad al stock, actualiza el precio de costo y deja
// todo atado a ese pago (SQL 56, compra_items).

// Categorías de pago donde tiene sentido cargar productos.
export const CATEGORIAS_CON_PRODUCTOS = ['mercaderia', 'proveedores']

// Diferencia tolerada entre la suma de los productos y el monto del pago
// (redondeos de centavos). Tiene que coincidir con compra_guardar_items().
export const TOLERANCIA_BOLETA = 1

export const puedeLlevarProductos = (categoria) => CATEGORIAS_CON_PRODUCTOS.includes(categoria)

/**
 * Texto de un input → número. Acepta punto o coma decimal ("1,5" = 1.5) y el
 * formato argentino completo ("12.500,50"). Con punto solo se lee como lo
 * hace el campo Monto del mismo formulario: decimal ("12.5" = 12,5).
 * Devuelve null si no es un número.
 */
export function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v ?? '').trim().replace(/\s|\$/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Redondeos como los hace la base: cantidad a 2 decimales, precio a 4. El
// EPSILON evita que 1,005 quede en 1,00 por el punto flotante.
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
const r4 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 10000) / 10000

/** Subtotal de un renglón, calculado igual que compra_items.subtotal. */
export function subtotalFila(fila) {
  const c = numero(fila?.cantidad)
  const p = numero(fila?.precio_unitario)
  if (c === null || p === null) return 0
  return r2(r2(c) * r4(p))
}

/** Una fila cuenta cuando tiene producto y cantidad mayor a cero. */
export function filaCargada(fila) {
  const c = numero(fila?.cantidad)
  return Boolean(fila?.stock_id) && c !== null && c > 0
}

export const filasCargadas = (filas) => (filas || []).filter(filaCargada)

export const totalProductos = (filas) => r2(filasCargadas(filas).reduce((s, f) => s + subtotalFila(f), 0))

/** Monto del pago − suma de productos (positivo = la boleta trae algo más). */
export function diferenciaBoleta(monto, filas) {
  return r2((numero(monto) || 0) - totalProductos(filas))
}

export function boletaCierra(monto, filas) {
  return Math.abs(diferenciaBoleta(monto, filas)) <= TOLERANCIA_BOLETA
}

/**
 * Por qué no se puede guardar, o null si está todo bien.
 * `permitirDiferencia`: el usuario marcó que la diferencia son impuestos,
 * envío o descuentos de la boleta.
 */
export function problemaBoleta({ filas, monto, permitirDiferencia = false }) {
  const cargadas = filasCargadas(filas)
  if (cargadas.length === 0) return null
  const vistos = new Set()
  for (const f of cargadas) {
    if (vistos.has(f.stock_id)) return `${f.nombre || 'Un producto'} está dos veces: juntá las cantidades en un solo renglón.`
    vistos.add(f.stock_id)
    const p = numero(f.precio_unitario)
    if (p === null) return `Falta el precio de ${f.nombre || 'un producto'}.`
    if (p < 0) return `El precio de ${f.nombre || 'un producto'} no puede ser negativo.`
  }
  if (!(numero(monto) > 0)) return 'Falta el monto del pago.'
  if (!permitirDiferencia && !boletaCierra(monto, filas)) {
    const dif = diferenciaBoleta(monto, filas)
    return dif > 0
      ? `A los productos les faltan ${plata(dif)} para llegar al monto del pago.`
      : `Los productos se pasan ${plata(-dif)} del monto del pago.`
  }
  return null
}

/** Lo que se le manda a la base: solo las filas cargadas, en números. */
export function itemsParaGuardar(filas) {
  return filasCargadas(filas).map(f => ({
    stock_id: f.stock_id,
    cantidad: r2(numero(f.cantidad)),
    precio_unitario: r4(numero(f.precio_unitario)),
  }))
}

/** True si la lista a guardar es distinta de la que ya tenía el pago. */
export function cambioLaBoleta(originales, filas) {
  const a = (originales || []).filter(i => i.stock_id)
    .map(i => `${i.stock_id}|${r2(i.cantidad)}|${Number(i.precio_unitario)}`).sort()
  const b = itemsParaGuardar(filas).map(i => `${i.stock_id}|${i.cantidad}|${i.precio_unitario}`).sort()
  return a.length !== b.length || a.some((x, i) => x !== b[i])
}

let serie = 0
const nuevaKey = () => `f${++serie}`

/** Fila vacía para "Agregar producto". */
export const filaVacia = () => ({ key: nuevaKey(), stock_id: '', nombre: '', unidad: '', cantidad: '', precio_unitario: '', habitual: false })

function filaDeProducto(p, extra = {}) {
  const sugerido = p.ultimo_precio ?? p.precio_actual
  return {
    key: nuevaKey(),
    stock_id: p.stock_id,
    nombre: p.nombre,
    unidad: p.unidad || '',
    cantidad: '',
    precio_unitario: Number(sugerido) > 0 ? String(Number(sugerido)) : '',
    precio_sugerido: Number(sugerido) > 0 ? Number(sugerido) : null,
    ultima_compra: p.ultima_compra || null,
    ultima_cantidad: p.ultima_cantidad ?? null,
    habitual: Boolean(p.habitual),
    ...extra,
  }
}

/**
 * Arma las filas del formulario:
 *   1) lo que el pago ya tenía cargado (edición), con su cantidad y precio;
 *   2) los productos habituales del proveedor que todavía no están, con la
 *      cantidad vacía y el último precio como sugerencia.
 * `actuales` son filas que el usuario ya tocó: se conservan tal cual.
 */
export function armarFilas({ productos = [], existentes = [], actuales = [] } = {}) {
  const porId = new Map(productos.map(p => [p.stock_id, p]))
  const filas = []
  const usados = new Set()

  for (const f of actuales) {
    if (!f.stock_id) { if (filaCargada(f) || f.manual) filas.push(f); continue }
    // Lo que el usuario cargó o agregó a mano se queda; un habitual sin tocar
    // se recalcula (puede haber cambiado el proveedor).
    if (filaCargada(f) || f.manual || f.existente) { filas.push(f); usados.add(f.stock_id) }
  }

  for (const it of existentes) {
    if (!it.stock_id || usados.has(it.stock_id)) continue
    const p = porId.get(it.stock_id)
    filas.push({
      ...filaDeProducto(p || { stock_id: it.stock_id, nombre: it.nombre, unidad: it.unidad }),
      nombre: p?.nombre || it.nombre,
      unidad: p?.unidad || it.unidad || '',
      cantidad: String(Number(it.cantidad)),
      precio_unitario: String(Number(it.precio_unitario)),
      existente: true,
    })
    usados.add(it.stock_id)
  }

  for (const p of productos) {
    if (!p.habitual || usados.has(p.stock_id)) continue
    filas.push(filaDeProducto(p))
    usados.add(p.stock_id)
  }
  return filas
}

/** Opciones para el buscador de "Agregar producto": lo que no está en la lista. */
export function productosDisponibles(productos, filas) {
  const usados = new Set((filas || []).map(f => f.stock_id).filter(Boolean))
  return (productos || []).filter(p => !usados.has(p.stock_id))
}

/** Los datos del pago como los espera registrar_compra() / editar_compra(). */
export function pagoParaRpc(form) {
  return {
    categoria: form.categoria,
    descripcion: form.descripcion,
    monto: numero(form.monto),
    medio_pago: form.medio_pago,
    estado: form.estado,
    fecha: form.fecha || null,
    proveedor_id: form.proveedor_id || null,
    empleado_id: form.empleado_id || null,
    subtipo: form.subtipo || null,
    periodo: form.periodo || null,
    vencimiento: form.vencimiento || null,
    comprobante: form.comprobante_nro || null,
    notas: form.notas || null,
    origen: form.origen || 'auto',
    cuenta_id: form.cuenta_id || null,
  }
}

// ── Formato ─────────────────────────────────────────────────────────────────
export const plata = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

export function cantidadTxt(n, unidad = '') {
  const v = Number(n) || 0
  const txt = v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return unidad ? `${txt} ${unidad}` : txt
}

// ── Reporte de faltantes ────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const PERIODOS_FALTANTES = [
  { id: 'semana',       label: 'Últimos 7 días' },
  { id: 'mes',          label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes pasado' },
  { id: 'custom',       label: 'Elegir fechas' },
]

/** Rango { desde, hasta } (YYYY-MM-DD, inclusive) de un período, relativo a `hoy`. */
export function rangoPeriodo(id, hoy = new Date()) {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  if (id === 'semana') {
    const d = new Date(h); d.setDate(d.getDate() - 6)
    return { desde: iso(d), hasta: iso(h) }
  }
  if (id === 'mes_anterior') {
    const d = new Date(h.getFullYear(), h.getMonth() - 1, 1)
    const f = new Date(h.getFullYear(), h.getMonth(), 0)
    return { desde: iso(d), hasta: iso(f) }
  }
  return { desde: iso(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: iso(h) }
}

const n = (v) => Number(v) || 0

/** Normaliza una fila de stock_faltantes() a números. */
export function filaFaltante(f) {
  const precio = n(f.precio_unitario)
  return {
    ...f,
    precio_unitario: precio,
    stock_inicial: n(f.stock_inicial), stock_final: n(f.stock_final),
    comprado: n(f.comprado), otras_entradas: n(f.otras_entradas),
    vendido: n(f.vendido), otras_salidas: n(f.otras_salidas), merma: n(f.merma),
    conteos: n(f.conteos), faltante: n(f.faltante), sobrante: n(f.sobrante),
    valor_faltante: n(f.valor_faltante), valor_sobrante: n(f.valor_sobrante), valor_merma: n(f.valor_merma),
    // Lo que entró y lo que salió "por sistema", para leer la fila de corrido.
    entro: n(f.comprado) + n(f.otras_entradas),
    salio: n(f.vendido) + n(f.otras_salidas),
    neto: n(f.sobrante) - n(f.faltante),
    // Hubo diferencia en unidades pero no se puede valuar: no tiene precio.
    sin_precio: (n(f.faltante) > 0 || n(f.sobrante) > 0 || n(f.merma) > 0)
      && n(f.valor_faltante) === 0 && n(f.valor_sobrante) === 0 && n(f.valor_merma) === 0,
    detalle: Array.isArray(f.detalle) ? f.detalle : [],
  }
}

export const tieneDiferencia = (f) => f.faltante > 0 || f.sobrante > 0 || f.merma > 0

/** Totales del reporte. */
export function resumenFaltantes(filas) {
  const base = { faltante: 0, sobrante: 0, merma: 0, comprado: 0, productosConFaltante: 0, productosContados: 0, sinPrecio: 0 }
  return (filas || []).reduce((t, f) => {
    t.faltante += f.valor_faltante
    t.sobrante += f.valor_sobrante
    t.merma += f.valor_merma
    if (f.faltante > 0) t.productosConFaltante += 1
    if (f.conteos > 0) t.productosContados += 1
    if (f.sin_precio) t.sinPrecio += 1
    return t
  }, base)
}

/** Filtra y ordena para la tabla. */
export function filtrarFaltantes(filas, { soloDiferencias = true, tipo = 'todos', texto = '' } = {}) {
  const q = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  return (filas || [])
    .filter(f => !soloDiferencias || tieneDiferencia(f))
    .filter(f => tipo === 'todos' || f.tipo_stock === tipo)
    .filter(f => !q || String(f.nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
    .sort((a, b) => (b.valor_faltante - a.valor_faltante) || (b.faltante - a.faltante) || (b.valor_merma - a.valor_merma) || a.nombre.localeCompare(b.nombre))
}

/** Matriz para el Excel: título, totales y una fila por producto. */
export function matrizFaltantes(filas, { desde, hasta, negocio = 'Kiku Sushi' } = {}) {
  const t = resumenFaltantes(filas)
  const fecha = (s) => String(s || '').split('-').reverse().join('/')
  return [
    [`${negocio} · Faltantes de stock`],
    [`Del ${fecha(desde)} al ${fecha(hasta)}`],
    [],
    ['Faltante en conteos ($)', Math.round(t.faltante)],
    ['Sobrante en conteos ($)', Math.round(t.sobrante)],
    ['Merma declarada ($)', Math.round(t.merma)],
    [],
    ['Producto', 'Unidad', 'Había al empezar', 'Comprado', 'Otras entradas', 'Vendido', 'Otras salidas',
      'Merma declarada', 'Faltó en conteos', 'Sobró en conteos', 'Hay al terminar', 'Precio de costo',
      'Faltante ($)', 'Sobrante ($)', 'Merma ($)', 'Veces contado'],
    ...filas.map(f => [
      f.nombre, f.unidad, f.stock_inicial, f.comprado, f.otras_entradas, f.vendido, f.otras_salidas,
      f.merma, f.faltante, f.sobrante, f.stock_final, f.precio_unitario,
      Math.round(f.valor_faltante), Math.round(f.valor_sobrante), Math.round(f.valor_merma), f.conteos,
    ]),
  ]
}
