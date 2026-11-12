import { AlertTriangle, Split } from 'lucide-react'
import { formatMoney } from '../../lib/printing'
import { cuentaTieneDatosFiscales, cuentaUsable, etiquetaCuenta } from '../../lib/cuentasCorrientes'

/**
 * Bloque que aparece al elegir "Cuenta corriente" como único medio de pago
 * (Cobrar mesa / Cerrar pedido): a qué cuenta va, cuánto saldo queda y, si no
 * alcanza, el atajo para cobrar la diferencia con otro medio.
 *
 * Controlado: el padre tiene cuentaId y nroOp.
 */
export default function CuentaCorrienteCobro({
  cuentas, cuentaId, setCuentaId, nroOp, setNroOp, total, disabled = false, onDividir,
}) {
  const cuenta = cuentas.find(c => c.id === cuentaId) || null
  const monto = Number(total || 0)
  const saldo = Number(cuenta?.saldo || 0)
  const alcanza = cuenta ? monto <= saldo + 1 : true
  const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="mt-3 space-y-2">
      <div>
        <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
          Cuenta *
        </label>
        <select
          value={cuentaId || ''}
          onChange={e => setCuentaId(e.target.value || null)}
          disabled={disabled}
          aria-label="Cuenta corriente"
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={inputStyle}
        >
          <option value="">Elegí la cuenta…</option>
          {cuentas.map(c => (
            <option key={c.id} value={c.id} disabled={!cuentaUsable(c)}>{etiquetaCuenta(c)}</option>
          ))}
        </select>
      </div>

      {cuenta && alcanza && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Saldo ${formatMoney(saldo)}</span>
          <span className="font-semibold" style={{ color: '#5FD3A3' }}>
            Le quedan ${formatMoney(Math.max(0, saldo - monto))}
          </span>
        </div>
      )}

      {cuenta && !alcanza && (
        <div className="rounded-lg p-3 text-xs space-y-2"
          style={{ background: 'rgba(242,179,92,0.08)', border: '1px solid rgba(242,179,92,0.25)', color: '#F2B35C' }}>
          <p className="flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              El saldo no alcanza: a <strong>{cuenta.nombre}</strong> le quedan ${formatMoney(saldo)} y
              el total es ${formatMoney(monto)}. Faltan ${formatMoney(monto - saldo)}.
            </span>
          </p>
          <button
            type="button"
            onClick={() => onDividir?.(cuenta)}
            disabled={disabled}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(242,179,92,0.4)', color: '#F2B35C' }}
          >
            <Split size={13} /> Cargar ${formatMoney(saldo)} a la cuenta y cobrar el resto con otro medio
          </button>
        </div>
      )}

      {cuenta && (
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
            Nro. de operación / voucher (opcional)
          </label>
          <input
            value={nroOp}
            onChange={e => setNroOp(e.target.value)}
            disabled={disabled}
            maxLength={40}
            placeholder="Ej: V-0012"
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          />
        </div>
      )}

      <p className="text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>
        No es plata: queda anotado en la cuenta y no entra al arqueo de caja.
        {cuenta && !cuentaTieneDatosFiscales(cuenta) && ' Esta cuenta no tiene CUIT y razón social cargados: para Factura A completalos en Dinero → Cuentas corrientes.'}
      </p>
    </div>
  )
}
