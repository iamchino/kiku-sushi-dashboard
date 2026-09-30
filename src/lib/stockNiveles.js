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
