import { useMemo } from 'react'
import {
  COND_IVA_RECEPTOR_LABEL,
  CONDICIONES_FACTURA_A,
  validateCuit,
} from '../../lib/fiscal'
import { comprobanteInicial } from '../../lib/comprobante'

const inputStyle = {
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
}

export default function ElegirComprobante({ value, onChange, permiteFacturaA = true, disabled = false }) {
  const c = value || comprobanteInicial()
  const set = patch => onChange?.({ ...c, ...patch })
  const esA = c.tipo === 'A'
  const cuitDigits = String(c.cuit || '').replace(/\D/g, '')
  const cuitMal = useMemo(
    () => cuitDigits.length > 0 && (cuitDigits.length !== 11 || !validateCuit(cuitDigits)),
    [cuitDigits],
  )

  const opciones = [
    { id: 'B', label: 'Factura B', detail: 'Consumidor final' },
    { id: 'A', label: 'Factura A', detail: 'Empresa con CUIT' },
  ]

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        Tipo de factura
      </p>
      <div className="grid grid-cols-2 gap-2">
        {opciones.map(opt => {
          const bloqueado = opt.id === 'A' && !permiteFacturaA
          const active = c.tipo === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || bloqueado}
              onClick={() => set({ tipo: opt.id })}
              className="rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={active
                ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                : { background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-[10px] mt-0.5 opacity-80">{opt.detail}</p>
            </button>
          )
        })}
      </div>
      {!permiteFacturaA && (
        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Factura A está deshabilitada en la configuración fiscal.
        </p>
      )}

      {esA && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
                CUIT *
              </label>
              <input
                inputMode="numeric"
                value={c.cuit}
                disabled={disabled}
                onChange={e => set({ cuit: e.target.value.replace(/[^\d-]/g, '') })}
                placeholder="30712345678"
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ ...inputStyle, border: `1px solid ${cuitMal ? '#f87171' : 'var(--border)'}` }}
              />
              {cuitMal && (
                <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>CUIT inválido, revisalo.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
                Condición IVA *
              </label>
              <select
                value={c.condicion}
                disabled={disabled}
                onChange={e => set({ condicion: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                {CONDICIONES_FACTURA_A.map(id => (
                  <option key={id} value={id}>{COND_IVA_RECEPTOR_LABEL[id]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
              Razón social *
            </label>
            <input
              value={c.nombre}
              disabled={disabled}
              onChange={e => set({ nombre: e.target.value })}
              placeholder="Empresa SRL"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>
              Domicilio (opcional)
            </label>
            <input
              value={c.domicilio}
              disabled={disabled}
              onChange={e => set({ domicilio: e.target.value })}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </div>
  )
}
