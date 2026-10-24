// Stock en tres niveles y LA REGLA de descuento.
//
//   materia_prima → lo que se compra
//   produccion    → producción intermedia (subrecetas: arroz, salsas…)
//   servicio      → rolls armados para el servicio (unidad: roll)
//
// LA REGLA: al descontar se baja por la receta y se descuenta en el PRIMER
// nivel que tenga stock propio; nunca más abajo. Es la misma lógica que la
// función explotar_receta() de la base (migración 20260929000000): esto es
// solo la vista previa para la pantalla, la base es la que descuenta.

export const TIPOS_STOCK = [
  { id: 'materia_prima', label: 'Materia prima',          corto: 'Materia prima' },
  { id: 'produccion',    label: 'Producción intermedia',  corto: 'Intermedia' },
  { id: 'servicio',      label: 'Servicio',               corto: 'Servicio' },
]

export const TIPOS_RECETA = [
  { id: 'final',      label: 'Productos finales',     singular: 'Producto final',
    ayuda: 'Lo que se vende. Se vincula a un producto del menú.' },
  { id: 'intermedia', label: 'Producción intermedia', singular: 'Producción intermedia',
    ayuda: 'Subrecetas que cocina produce y guarda: arroz, salsas, pescado porcionado.' },
  { id: 'servicio',   label: 'Rolls de servicio',     singular: 'Roll de servicio',
    ayuda: 'Rolls que se arman para el servicio. Rinde en rolls (1 = un roll entero).' },
]

// En qué se cuenta lo que rinde una receta (y su stock, si lleva).
// Los rolls de servicio van siempre en 'roll'.
export const UNIDADES_RINDE = [
  { id: 'porc', label: 'Porciones',  corto: 'porc.', plural: 'porciones',  singular: 'porción' },
  { id: 'u',    label: 'Unidades',   corto: 'u.',    plural: 'unidades',   singular: 'unidad' },
  { id: 'kg',   label: 'Kilos',      corto: 'kg',    plural: 'kilos',      singular: 'kilo' },
  { id: 'g',    label: 'Gramos',     corto: 'g',     plural: 'gramos',     singular: 'gramo' },
  { id: 'l',    label: 'Litros',     corto: 'l',     plural: 'litros',     singular: 'litro' },
  { id: 'ml',   label: 'Mililitros', corto: 'ml',    plural: 'mililitros', singular: 'mililitro' },
]

export const unidadRinde = (r) => {
  if (tipoReceta(r) === 'servicio') return 'roll'
  return UNIDADES_RINDE.some(u => u.id === r?.unidad_rinde) ? r.unidad_rinde : 'porc'
}

// Etiqueta corta de la unidad del rinde: 'porc.', 'kg', 'roll'…
export const unidadRindeCorta = (r) => {
  const u = unidadRinde(r)
  return u === 'roll' ? 'roll' : (UNIDADES_RINDE.find(x => x.id === u)?.corto || u)
}

// Producto de reventa: se vende tal cual se compra (bebidas). Receta final 1:1.
export const esReventa = (r) => tipoReceta(r) === 'final' && !!r?.reventa

export const normTipoStock = (item) =>
  item?.tipo_stock === 'produccion' || item?.tipo_stock === 'servicio'
    ? item.tipo_stock
    : 'materia_prima'

export const esElaborado = (item) => normTipoStock(item) !== 'materia_prima'

export const tipoReceta = (r) =>
  r?.tipo === 'intermedia' || r?.tipo === 'servicio' || r?.tipo === 'final'
    ? r.tipo
    : (r?.es_subreceta ? 'intermedia' : 'final')

// Receta que lleva stock. Si la base todavía no tiene la columna (SQL sin
// correr), se toma como antes: subreceta o con ítem vinculado.
export const llevaStock = (r, stockItems = []) =>
  typeof r?.lleva_stock === 'boolean'
    ? r.lleva_stock
    : Boolean(r?.es_subreceta || stockItems.some(s => s.receta_id === r?.id))

// Ítem de stock propio de una receta (o null si no lleva stock).
export function stockDeReceta(recetaId, recetas = [], stockItems = []) {
  const r = recetas.find(x => x.id === recetaId)
  if (!r || !llevaStock(r, stockItems)) return null
  const propios = stockItems.filter(s => s.receta_id === recetaId)
  if (propios.length === 0) return null
  return propios.find(s => esElaborado(s)) || propios[0]
}

/**
 * Qué ítems de stock se consumen para `porciones` de una receta.
 *   pararEnRaiz = true  → venta: si la receta misma tiene stock, se descuenta ella.
 *   pararEnRaiz = false → producción: la receta se fabrica, bajan sus ingredientes.
 * Devuelve [{ stock_id, nombre, unidad, cantidad, stock_actual, tipo_stock }].
 */
export function explotarReceta(receta, porciones, recetas = [], stockItems = [], pararEnRaiz = false) {
  const acc = new Map()
  const sumar = (stock, cantidad) => {
    if (!stock || !(cantidad > 0)) return
    const prev = acc.get(stock.id)
    if (prev) { prev.cantidad += cantidad; return }
    acc.set(stock.id, {
      stock_id: stock.id,
      nombre: stock.nombre,
      unidad: stock.unidad,
      cantidad,
      stock_actual: parseFloat(stock.stock_actual) || 0,
      tipo_stock: normTipoStock(stock),
    })
  }
  const stockPorId = (id) => stockItems.find(s => s.id === id) || null

  if (!receta) return []
  if (pararEnRaiz) {
    const propio = stockDeReceta(receta.id, recetas, stockItems)
    if (propio) { sumar(propio, porciones); return [...acc.values()] }
  }

  const bajar = (rec, cantPorciones, nivel) => {
    if (!rec || nivel > 8) return
    const factor = cantPorciones / (parseFloat(rec.porciones) || 1)
    for (const ri of (rec.receta_ingredientes || [])) {
      const cant = (parseFloat(ri.cantidad) || 0) * factor
      if (ri.stock_id) {
        sumar(stockPorId(ri.stock_id) || ri.stock, cant)
      } else if (ri.subreceta_id) {
        const propio = stockDeReceta(ri.subreceta_id, recetas, stockItems)
        if (propio) sumar(propio, cant)                     // se corta acá
        else bajar(recetas.find(r => r.id === ri.subreceta_id), cant, nivel + 1)
      }
    }
  }
  bajar(receta, porciones, 0)
  return [...acc.values()]
}

// ─── Vínculos de la carta (menu_item_stock_vinculos) ────────────────────────
// Cada producto de la carta (o cada variante) apunta a una receta (final o
// intermedia) o a un ítem de inventario, con una cantidad. Es el espejo de la
// función consumos_stock_pedido() de la base (migración 20261024000000): esto
// es la vista previa de la pantalla; la base es la que descuenta.
//
// Regla con variantes: los vínculos del producto (variante_id null) valen para
// todas las variantes y su cantidad se multiplica por las piezas de la variante
// vendida; los de una variante puntual se suman y su cantidad es por unidad.

export const GRUPOS_VINCULO = [
  { id: 'final',      label: 'Productos finales' },
  { id: 'intermedia', label: 'Producción intermedia' },
  { id: 'inventario', label: 'Inventario (bebidas, reventa, insumos)' },
]

// Vínculos que aplican a una venta de `variante` (null = producto sin variantes):
// los del producto (se multiplican por piezas) y los de esa variante (no).
export function vinculosQueAplican(vinculos = [], varianteId = null) {
  return vinculos
    .filter(v => !v.variante_id || v.variante_id === varianteId)
    .map(v => ({ ...v, porPieza: !v.variante_id }))
}

/**
 * Qué ítems de stock consume vender `unidades` de un producto.
 *   vinculos   filas de menu_item_stock_vinculos del producto
 *   variante   la variante vendida ({ id, piezas }) o null
 * Devuelve [{ stock_id, nombre, unidad, cantidad, stock_actual, tipo_stock }].
 */
export function consumosDeVinculos(vinculos, variante, unidades = 1, recetas = [], stockItems = []) {
  const lista = vinculosQueAplican(vinculos, variante?.id || null)
  const piezasVariante = parseFloat(variante?.piezas) || 1
  const acc = new Map()
  const sumar = (c) => {
    if (!c || !(c.cantidad > 0)) return
    const prev = acc.get(c.stock_id)
    if (prev) prev.cantidad += c.cantidad
    else acc.set(c.stock_id, { ...c })
  }
  for (const v of lista) {
    const cant = (parseFloat(v.cantidad) || 0) * unidades * (v.porPieza ? piezasVariante : 1)
    if (!(cant > 0)) continue
    if (v.stock_id) {
      const s = stockItems.find(x => x.id === v.stock_id)
      if (s) sumar({
        stock_id: s.id, nombre: s.nombre, unidad: s.unidad, cantidad: cant,
        stock_actual: parseFloat(s.stock_actual) || 0, tipo_stock: normTipoStock(s),
      })
    } else if (v.receta_id) {
      const r = recetas.find(x => x.id === v.receta_id)
      for (const c of explotarReceta(r, cant, recetas, stockItems, true)) sumar(c)
    }
  }
  return [...acc.values()]
}
