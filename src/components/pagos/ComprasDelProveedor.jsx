import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { cantidadTxt, plata } from '../../lib/compras'
import { cargarProductosCompra } from '../../lib/comprasApi'

// Qué se le compra a un proveedor, según las boletas cargadas con productos
// (SQL 56). Es solo lectura: la lista se arma sola con cada boleta. Si la base
// todavía no tiene el SQL 56, no muestra nada.
const fechaCorta = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : ''
}

export default function ComprasDelProveedor({ proveedorId }) {
  const [estado, setEstado] = useState({ listo: false, disponible: false, productos: [] })

  useEffect(() => {
    let vivo = true
    cargarProductosCompra(proveedorId)
      .then(res => { if (vivo) setEstado({ listo: true, disponible: res.disponible, productos: res.productos.filter(p => p.veces > 0) }) })
      .catch(() => { if (vivo) setEstado({ listo: true, disponible: false, productos: [] }) })
    return () => { vivo = false }
  }, [proveedorId])

  if (!estado.listo || !estado.disponible) return null

  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }} data-compras-proveedor>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        <Package size={10} /> Qué se le compra
      </p>
      {estado.productos.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Todavía no hay boletas con productos de este proveedor. Se cargan en Caja → Pagos → Registrar pago.
        </p>
      ) : (
        <div className="space-y-1">
          {estado.productos.map(p => (
            <div key={p.stock_id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{p.nombre}</span>
              <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                última vez {cantidadTxt(p.ultima_cantidad, p.unidad)} a {plata(p.ultimo_precio)}/{p.unidad || 'u'}
                {p.ultima_compra ? ` · ${fechaCorta(p.ultima_compra)}` : ''}
                {p.veces > 1 ? ` · ${p.veces} compras` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
