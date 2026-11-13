import { useEffect, useState } from 'react'
import { AlertTriangle, Landmark, ReceiptText, Store } from 'lucide-react'
import { cargarResumenIva } from '../../lib/ivaVentasApi'
import { fmtMoney } from '../../lib/finanzas'

// De lo que se facturó en el período, cuánto es IVA (se le debe a ARCA) y
// cuánto queda sin IVA (es del negocio). Cuenta las facturas y notas de
// crédito por su fecha de emisión, y lo suma la base (SQL 57): si ese SQL
// todavía no se corrió, el recuadro no aparece.
//
// A propósito NO se muestra un "quedó sin IVA" del negocio entero: lo que se
// le paga a ARCA es este IVA menos el de las compras, y eso lo calcula el
// contador.

const plural = (n, uno, muchos) => `${Number(n).toLocaleString('es-AR')} ${n === 1 ? uno : muchos}`

function Dato({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }}>
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>
        {Icon && <Icon size={12} style={{ color }} />} {label}
      </p>
      <p className="mt-1 text-xl font-bold tracking-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function IvaVentasResumen({ desde, hasta, label }) {
  const [estado, setEstado] = useState({ clave: null, disponible: true, desglose: null, error: null })
  const clave = `${desde}|${hasta}`

  useEffect(() => {
    let vivo = true
    cargarResumenIva(desde, hasta)
      .then(r => { if (vivo) setEstado({ clave: `${desde}|${hasta}`, disponible: r.disponible, desglose: r.desglose, error: null }) })
      .catch(err => { if (vivo) setEstado({ clave: `${desde}|${hasta}`, disponible: true, desglose: null, error: err.message }) })
    return () => { vivo = false }
  }, [desde, hasta])

  if (!estado.disponible) return null

  const cargando = estado.clave !== clave
  const d = estado.desglose
  const sinFacturas = d && d.facturas.cantidad === 0 && d.notasCredito.cantidad === 0 && d.notasDebito.cantidad === 0
  const pctIva = d && d.total > 0 ? Math.max(0, Math.min(100, (d.iva / d.total) * 100)) : 0

  return (
    <div data-iva-ventas className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <ReceiptText size={15} style={{ color: 'var(--accent-lift)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>IVA de las ventas · {label}</p>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>De lo facturado, qué parte es de ARCA y qué parte es del negocio</p>
      </div>

      {estado.error && !cargando ? (
        <p className="flex items-center gap-1.5 py-2 text-xs" style={{ color: '#F2708C' }}>
          <AlertTriangle size={12} /> {estado.error}
        </p>
      ) : cargando || !d ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-[72px] rounded-lg" />)}</div>
      ) : sinFacturas ? (
        <p className="py-4 text-center text-xs" style={{ color: 'var(--text-xmuted)' }}>Sin facturas emitidas en el período</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Dato icon={ReceiptText} label="Facturado" value={fmtMoney(d.total)} color="var(--text-primary)"
              sub={[
                plural(d.facturas.cantidad, 'factura', 'facturas'),
                d.notasCredito.cantidad > 0 ? `${plural(d.notasCredito.cantidad, 'nota de crédito', 'notas de crédito')} ya restadas` : null,
              ].filter(Boolean).join(' · ')} />
            <Dato icon={Landmark} label="IVA · va a ARCA" value={fmtMoney(d.iva)} color="#E8A23F"
              sub="Se cobró con la venta, pero no es del negocio" />
            <Dato icon={Store} label="Sin IVA · queda en el negocio" value={fmtMoney(d.neto)} color="#3FBF8A"
              sub="Lo facturado, sacando el IVA" />
          </div>

          {d.total > 0 && (
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-input)' }}
              title={`De cada $100 facturados, $${pctIva.toFixed(1).replace('.', ',')} son IVA`}>
              <div style={{ width: `${100 - pctIva}%`, background: '#3FBF8A' }} />
              <div style={{ width: `${pctIva}%`, background: '#E8A23F' }} />
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Cuenta las facturas y notas de crédito por su fecha de emisión. Lo que se termina pagando a ARCA lo calcula el
            contador: a este IVA le resta el IVA de las compras. Las ventas sin factura no entran acá.
            {d.estimados > 0 && ` ${plural(d.estimados, 'comprobante no tenía', 'comprobantes no tenían')} el desglose guardado: su IVA se calculó.`}
          </p>
        </>
      )}
    </div>
  )
}
