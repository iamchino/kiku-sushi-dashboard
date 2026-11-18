import { useEffect, useState } from 'react'
import { AlertTriangle, Landmark, Receipt, Scale } from 'lucide-react'
import { cargarResumenIvaCompras } from '../../lib/ivaComprasApi'
import { cargarResumenIva } from '../../lib/ivaVentasApi'
import { ALICUOTAS_COMPRA, saldoIva } from '../../lib/ivaCompras'
import { fmtPlata } from '../../lib/finanzas'

// IVA de las compras (crédito fiscal, SQL 61): lo que suman los pagos que
// tienen cargado el IVA de la factura del proveedor, por fecha de la factura.
// Al lado, el saldo estimado contra el IVA de las ventas (SQL 57). Sin el
// SQL 61 el recuadro no aparece.

const plural = (n, uno, muchos) => `${Number(n).toLocaleString('es-AR')} ${n === 1 ? uno : muchos}`

function Dato({ icon: Icon, label, value, sub, color, attr }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }} {...attr}>
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
        {Icon && <Icon size={12} style={{ color }} />} {label}
      </p>
      <p className="mt-1 text-xl font-bold tracking-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function IvaComprasResumen({ desde, hasta, label }) {
  const [estado, setEstado] = useState({ clave: null, disponible: true, resumen: null, ivaVentas: null, error: null })
  const clave = `${desde}|${hasta}`

  useEffect(() => {
    let vivo = true
    Promise.all([
      cargarResumenIvaCompras(desde, hasta),
      // El IVA de las ventas es para el saldo estimado; si falla, el recuadro sigue.
      cargarResumenIva(desde, hasta).catch(() => ({ disponible: false })),
    ])
      .then(([c, v]) => {
        if (!vivo) return
        setEstado({
          clave: `${desde}|${hasta}`, disponible: c.disponible, resumen: c.resumen, error: null,
          ivaVentas: v?.disponible && v.desglose ? v.desglose.iva : null,
        })
      })
      .catch(err => { if (vivo) setEstado({ clave: `${desde}|${hasta}`, disponible: true, resumen: null, ivaVentas: null, error: err.message }) })
    return () => { vivo = false }
  }, [desde, hasta])

  if (!estado.disponible) return null

  const cargando = estado.clave !== clave
  const r = estado.resumen
  const saldo = r && estado.ivaVentas !== null ? saldoIva(estado.ivaVentas, r.iva) : null
  const porAlicuota = r
    ? ALICUOTAS_COMPRA
        .map(a => ({ ...a, d: r.porAlicuota?.[a.id] }))
        .filter(a => a.d && Number(a.d.facturas) > 0)
    : []

  return (
    <div data-iva-compras className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <Receipt size={15} style={{ color: 'var(--accent-lift)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>IVA de las compras · {label}</p>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>El IVA de las facturas de los proveedores: crédito fiscal</p>
      </div>

      {estado.error && !cargando ? (
        <p className="flex items-center gap-1.5 py-2 text-xs" style={{ color: '#F2708C' }}>
          <AlertTriangle size={12} /> {estado.error}
        </p>
      ) : cargando || !r ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-[72px] rounded-lg" />)}</div>
      ) : r.facturas === 0 ? (
        <p className="py-4 text-center text-xs" style={{ color: 'var(--text-xmuted)' }} data-iva-compras-vacio>
          Sin facturas de proveedores con el IVA cargado en el período. Se carga en Caja → Pagos, al registrar o
          corregir el pago: «Cargar el IVA de la factura».
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Dato icon={Receipt} label="Facturas de proveedores" value={fmtPlata(r.total)}
              sub={`${plural(r.facturas, 'factura', 'facturas')} · sin IVA ${fmtPlata(r.sinIva)}`} />
            <Dato icon={Landmark} label="IVA de las compras · a favor" value={fmtPlata(r.iva)} color="#3FBF8A"
              attr={{ 'data-iva-compras-total': '' }}
              sub={porAlicuota.length > 0
                ? porAlicuota.map(a => `${a.tasa ? a.label : 'varias'}: ${fmtPlata(a.d.iva)}`).join(' · ')
                : 'Se le resta al IVA de las ventas'} />
            {saldo ? (
              <Dato icon={Scale} attr={{ 'data-iva-saldo': '' }}
                label={saldo.aFavor > 0 ? 'Saldo estimado · a favor' : 'Saldo estimado · a pagar'}
                value={fmtPlata(saldo.aFavor > 0 ? saldo.aFavor : saldo.aPagar)}
                color={saldo.aFavor > 0 ? '#3FBF8A' : '#E8A23F'}
                sub={`IVA ventas ${fmtPlata(estado.ivaVentas)} − IVA compras ${fmtPlata(r.iva)}`} />
            ) : (
              <Dato icon={Scale} label="Saldo estimado" value="—"
                sub="Falta el IVA de las ventas para comparar" />
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Cuentan los pagos que tienen cargado el IVA de la factura, por la fecha de la factura (pagadas, pendientes y
            con canje). Es una estimación: no incluye percepciones, retenciones ni el saldo a favor de meses anteriores.
            El número que se le paga a ARCA lo calcula el contador.
          </p>
        </>
      )}
    </div>
  )
}
