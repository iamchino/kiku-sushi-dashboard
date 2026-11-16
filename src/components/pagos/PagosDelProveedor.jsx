import { useEffect, useMemo, useState } from 'react'
import { Clock, FileText } from 'lucide-react'
import { cargarPagosDeProveedor } from '../../lib/pagos'
import { fmtFecha, fmtMoney, medioLabel, resumenPagosProveedor } from '../../lib/finanzas'

// Facturas y pagos de un proveedor: todo lo que se le cargó en Caja → Pagos,
// con su número de comprobante, lo más nuevo primero. Es solo lectura: se
// carga y se corrige en Pagos. Lo ve quien tiene Pagos o Finanzas.
const VISIBLES = 6

export default function PagosDelProveedor({ proveedorId }) {
  const [estado, setEstado] = useState({ listo: false, error: false, pagos: [] })
  const [verTodos, setVerTodos] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarPagosDeProveedor(proveedorId)
      .then(pagos => { if (vivo) setEstado({ listo: true, error: false, pagos }) })
      .catch(() => { if (vivo) setEstado({ listo: true, error: true, pagos: [] }) })
    return () => { vivo = false }
  }, [proveedorId])

  const resumen = useMemo(() => resumenPagosProveedor(estado.pagos), [estado.pagos])

  if (!estado.listo || estado.error) return null
  const pagos = verTodos ? estado.pagos : estado.pagos.slice(0, VISIBLES)

  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }} data-pagos-proveedor>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          <FileText size={10} /> Facturas y pagos
        </p>
        {estado.pagos.length > 0 && (
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Pagado <strong style={{ color: 'var(--text-secondary)' }}>{fmtMoney(resumen.pagado)}</strong>
            {resumen.cantPendientes > 0 && (
              <> · Pendiente <strong style={{ color: '#E8A23F' }}>{fmtMoney(resumen.pendiente)}</strong></>
            )}
            {resumen.cantVencidos > 0 && (
              <> · <span style={{ color: '#F2708C' }}>{fmtMoney(resumen.vencido)} vencido</span></>
            )}
          </p>
        )}
      </div>

      {estado.pagos.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Todavía no hay facturas ni pagos cargados a este proveedor. Se cargan en Caja y facturación → Pagos → Registrar pago, eligiéndolo en «Proveedor».
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {pagos.map(p => (
              <div key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="min-w-0" style={{ color: 'var(--text-secondary)' }}>
                  <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtFecha(p.fecha)}</span>
                  {' · '}
                  <span className="font-medium">
                    {String(p.comprobante_nro || '').trim() ? `Comp. ${String(p.comprobante_nro).trim()}` : 'Sin N° de comprobante'}
                  </span>
                  {p.descripcion ? <span style={{ color: 'var(--text-muted)' }}> · {p.descripcion}</span> : null}
                </span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  {p.estado === 'pendiente' ? (
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: '#E8A23F' }}>
                      <Clock size={10} /> pendiente{p.vencimiento ? ` · vence ${fmtFecha(p.vencimiento)}` : ''}
                    </span>
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{medioLabel(p.medio_pago)}</span>
                  )}
                  <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(p.monto)}</strong>
                </span>
              </div>
            ))}
          </div>
          {estado.pagos.length > VISIBLES && (
            <button type="button" onClick={() => setVerTodos(v => !v)}
              className="mt-2 w-full rounded-lg py-1 text-[11px] font-semibold"
              style={{ color: 'var(--accent-lift)', border: '1px dashed var(--accent-border)' }}>
              {verTodos ? 'Ver menos' : `Ver los ${estado.pagos.length}`}
            </button>
          )}
          <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
            Se cargan y se corrigen en Caja y facturación → Pagos (ahí el buscador también encuentra por N° de comprobante).
          </p>
        </>
      )}
    </div>
  )
}
