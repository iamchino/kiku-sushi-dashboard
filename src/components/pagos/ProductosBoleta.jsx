import { useMemo } from 'react'
import { Package, Trash2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import Buscador from '../ui/Buscador'
import {
  cantidadTxt, diferenciaBoleta, boletaCierra, filaCargada, filasCargadas, plata,
  productosDisponibles, subtotalFila, totalProductos, numero,
} from '../../lib/compras'

// Los productos de una boleta, dentro de Registrar pago. Lo que se carga acá
// entra al stock al guardar el pago y actualiza el precio de costo de cada
// producto (lo hace la base, SQL 56). No toca nada por su cuenta: solo edita
// la lista de filas que le pasa el modal.
//
// Una fila = { key, stock_id, nombre, unidad, cantidad, precio_unitario,
//              habitual, ultima_compra, ultima_cantidad, precio_sugerido }.
// Solo cuentan las filas con cantidad: los habituales del proveedor aparecen
// con la cantidad vacía para completar lo que vino.

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

const fechaCorta = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}` : ''
}

function Fila({ fila, onChange, onQuitar }) {
  const cargada = filaCargada(fila)
  const sub = subtotalFila(fila)
  const precio = numero(fila.precio_unitario)
  const cambioPrecio = cargada && fila.precio_sugerido && precio !== null && precio > 0
    && Math.abs(precio - fila.precio_sugerido) > 0.004
  return (
    <div className="rounded-lg px-3 py-2" data-fila={fila.nombre}
      style={{ background: cargada ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${cargada ? 'var(--accent-border)' : 'var(--border)'}` }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {/* En el celular: nombre y tacho arriba, cantidad y precio en el medio,
            subtotal abajo. En pantalla grande, todo en un renglón. */}
        <p className="order-1 min-w-0 flex-1 basis-[60%] truncate text-sm font-medium sm:basis-0" style={{ color: 'var(--text-primary)' }}>
          {fila.nombre}
        </p>
        <label className="order-3 flex items-center gap-1.5">
          <input value={fila.cantidad} onChange={e => onChange({ cantidad: e.target.value })}
            inputMode="decimal" placeholder="Cant." aria-label={`Cantidad de ${fila.nombre}`}
            autoComplete="off"
            className="w-16 rounded-lg px-2 py-1.5 text-right text-sm outline-none tabular-nums sm:w-20" style={inputStyle} />
          <span className="w-7 text-[11px]" style={{ color: 'var(--text-muted)' }}>{fila.unidad}</span>
        </label>
        <label className="order-4 flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>$</span>
          <input value={fila.precio_unitario} onChange={e => onChange({ precio_unitario: e.target.value })}
            inputMode="decimal" placeholder="Precio" aria-label={`Precio por ${fila.unidad || 'unidad'} de ${fila.nombre}`}
            autoComplete="off"
            className="w-20 rounded-lg px-2 py-1.5 text-right text-sm outline-none tabular-nums sm:w-24" style={inputStyle} />
          <span className="w-8 text-[11px]" style={{ color: 'var(--text-muted)' }}>/{fila.unidad || 'u'}</span>
        </label>
        <span className="order-5 basis-full text-right text-sm font-semibold tabular-nums sm:w-20 sm:basis-auto"
          style={{ color: cargada ? 'var(--text-primary)' : 'var(--text-xmuted)' }}>
          {cargada ? plata(sub) : '—'}
        </span>
        <button type="button" onClick={onQuitar} aria-label={`Quitar ${fila.nombre}`} title="Quitar de la boleta"
          className="order-2 rounded p-1.5 sm:order-6" style={{ color: 'var(--text-xmuted)' }}>
          <Trash2 size={13} />
        </button>
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
        {fila.ultima_compra
          ? `Última vez: ${cantidadTxt(fila.ultima_cantidad, fila.unidad)} a ${plata(fila.precio_sugerido)} · ${fechaCorta(fila.ultima_compra)}`
          : fila.precio_sugerido
            ? `Precio cargado en Inventario: ${plata(fila.precio_sugerido)}`
            : 'Sin precio cargado todavía'}
      </p>
      {cambioPrecio && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--warn, #E8A23F)' }}>
          El precio cambió de {plata(fila.precio_sugerido)} a {plata(precio)}: al guardar se actualiza el costo del producto.
        </p>
      )}
    </div>
  )
}

export default function ProductosBoleta({
  productos, filas, setFilas, monto, onUsarTotal,
  permitirDiferencia, setPermitirDiferencia,
  proveedorNombre = '', cargando = false, onCerrar, puedeCerrar = true,
}) {
  const cargadas = filasCargadas(filas)
  const total = totalProductos(filas)
  const dif = diferenciaBoleta(monto, filas)
  const cierra = boletaCierra(monto, filas)
  const hayMonto = numero(monto) > 0

  const opciones = useMemo(() => {
    const libres = productosDisponibles(productos, filas)
    const opcion = (p) => ({
      value: p.stock_id,
      label: p.nombre,
      detalle: `${p.unidad || 'u'}${Number(p.precio_actual) > 0 ? ` · ${plata(p.precio_actual)}` : ''}`,
    })
    const hab = libres.filter(p => p.habitual).map(opcion)
    const resto = libres.filter(p => !p.habitual).map(opcion)
    return hab.length
      ? [{ label: 'Habituales de este proveedor', opciones: hab }, { label: 'Todo el inventario', opciones: resto }]
      : [{ label: null, opciones: resto }]
  }, [productos, filas])

  const cambiar = (key, patch) => setFilas(fs => fs.map(f => (f.key === key ? { ...f, ...patch } : f)))
  const quitar = (key) => setFilas(fs => fs.filter(f => f.key !== key))
  const agregar = (stockId) => {
    const p = (productos || []).find(x => x.stock_id === stockId)
    if (!p) return
    const sugerido = Number(p.ultimo_precio ?? p.precio_actual) || 0
    setFilas(fs => [...fs, {
      key: `m${stockId}`, stock_id: p.stock_id, nombre: p.nombre, unidad: p.unidad || '',
      cantidad: '', precio_unitario: sugerido > 0 ? String(sugerido) : '',
      precio_sugerido: sugerido > 0 ? sugerido : null,
      ultima_compra: p.ultima_compra || null, ultima_cantidad: p.ultima_cantidad ?? null,
      habitual: Boolean(p.habitual), manual: true,
    }])
  }

  const habituales = filas.filter(f => f.habitual && !f.manual && !f.existente).length

  return (
    <section className="rounded-xl p-3 space-y-3" aria-label="Productos de la boleta"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Package size={14} style={{ color: 'var(--accent-lift)' }} /> Productos de la boleta
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Lo que cargues acá entra al stock al guardar y actualiza el precio de costo. Completá solo la cantidad de lo que vino.
          </p>
        </div>
        {puedeCerrar && (
          <button type="button" onClick={onCerrar} className="flex-shrink-0 text-[11px] underline"
            style={{ color: 'var(--text-muted)' }}>
            No cargar productos
          </button>
        )}
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={13} className="animate-spin" /> Buscando los productos…
        </p>
      ) : (
        <>
          {habituales > 0 && (
            <p className="text-[11px] font-medium" style={{ color: 'var(--accent-lift)' }}>
              {proveedorNombre ? `Lo que se le compra a ${proveedorNombre}` : 'Productos habituales'} ({habituales})
            </p>
          )}
          {filas.length === 0 && (
            <p className="rounded-lg px-3 py-3 text-xs" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
              {proveedorNombre
                ? `Todavía no hay compras cargadas a ${proveedorNombre}. Agregá los productos de esta boleta: la próxima vez van a aparecer solos.`
                : 'Agregá los productos de la boleta. Si elegís el proveedor arriba, la próxima vez aparecen solos.'}
            </p>
          )}
          <div className="space-y-1.5">
            {filas.map(f => (
              <Fila key={f.key} fila={f} onChange={patch => cambiar(f.key, patch)} onQuitar={() => quitar(f.key)} />
            ))}
          </div>

          <div data-agregar-producto>
            <Buscador value="" onChange={agregar} grupos={opciones}
              placeholder="+ Agregar otro producto…" allowEmpty={false} />
          </div>

          <div className="space-y-1 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-input)' }}>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>
                Total de productos{cargadas.length ? ` (${cargadas.length})` : ''}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }} data-total-productos>{plata(total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>Monto del pago</span>
              <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{hayMonto ? plata(numero(monto)) : '—'}</span>
            </div>
            {cargadas.length > 0 && (cierra && hayMonto ? (
              <p className="flex items-center gap-1.5 pt-1 text-xs font-medium" style={{ color: 'var(--ok, #3FBF8A)' }}>
                <CheckCircle2 size={13} /> Coincide con el monto del pago.
              </p>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="flex items-start gap-1.5 text-xs font-medium" style={{ color: 'var(--warn, #E8A23F)' }}>
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  {!hayMonto
                    ? 'Falta el monto del pago.'
                    : dif > 0
                      ? `A los productos les faltan ${plata(dif)} para llegar al monto del pago.`
                      : `Los productos se pasan ${plata(-dif)} del monto del pago.`}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button type="button" onClick={() => onUsarTotal(total)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    style={{ border: '1px solid var(--accent-border)', color: 'var(--accent-lift)', background: 'var(--accent-soft)' }}>
                    Usar {plata(total)} como monto
                  </button>
                  {hayMonto && (
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={permitirDiferencia} onChange={e => setPermitirDiferencia(e.target.checked)} />
                      La diferencia son impuestos, envío o descuentos
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
