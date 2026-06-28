import { useState } from 'react'
import { AlertTriangle, ArrowDownCircle } from 'lucide-react'
import { Field, Select, TextArea, ModalShell } from './fields'
import { CATEGORIAS, MEDIOS_PAGO, localDateISO } from '../../lib/finanzas'

const SUBTIPOS_SUELDO = ['sueldo', 'adelanto', 'aguinaldo', 'extra']

function buildEmpty(defaults) {
  return {
    fecha: localDateISO(),
    categoria: 'otros',
    descripcion: '',
    monto: '',
    medio_pago: 'efectivo',
    estado: 'pagado',
    vencimiento: '',
    proveedor_id: '',
    empleado_id: '',
    subtipo: '',
    comprobante_nro: '',
    notas: '',
    ...defaults,
  }
}

// Modal reutilizable de alta/edición de egreso.
export default function EgresoModal({ initial, defaults, proveedores = [], empleados = [], title, onClose, onSave }) {
  const [form, setForm] = useState(() => initial
    ? { ...buildEmpty(), ...initial, fecha: initial.fecha?.slice(0, 10) || localDateISO(),
        proveedor_id: initial.proveedor_id || '', empleado_id: initial.empleado_id || '',
        vencimiento: initial.vencimiento?.slice(0, 10) || '' }
    : buildEmpty(defaults))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const esSueldo = form.categoria === 'sueldos'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.descripcion.trim()) { setErr('La descripción es obligatoria.'); return }
    const monto = Number(form.monto)
    if (!monto || monto <= 0) { setErr('El monto debe ser mayor a 0.'); return }
    setSaving(true); setErr(null)

    const payload = {
      fecha: form.fecha || localDateISO(),
      categoria: form.categoria,
      subtipo: form.subtipo?.trim() || null,
      descripcion: form.descripcion.trim(),
      monto,
      medio_pago: form.medio_pago,
      estado: form.estado,
      vencimiento: form.estado === 'pendiente' ? (form.vencimiento || null) : null,
      periodo: (form.fecha || localDateISO()).slice(0, 7),
      proveedor_id: form.proveedor_id || null,
      empleado_id: form.empleado_id || null,
      comprobante_nro: form.comprobante_nro?.trim() || null,
      notas: form.notas?.trim() || null,
    }
    try {
      await onSave(payload)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={title || (initial ? 'Editar egreso' : 'Nuevo egreso')} icon={ArrowDownCircle} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {err && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
            <AlertTriangle size={12} /> {err}
          </div>
        )}

        <Field label="Descripción" value={form.descripcion} onChange={v => set('descripcion', v)}
          placeholder="Ej: Pago de luz · Compra de pescado" required />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto" value={form.monto} onChange={v => set('monto', v.replace(/[^\d.]/g, ''))}
            placeholder="0" inputMode="decimal" required />
          <Field label="Fecha" value={form.fecha} onChange={v => set('fecha', v)} type="date" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Categoría" value={form.categoria} onChange={v => set('categoria', v)}
            options={CATEGORIAS.map(c => ({ value: c.id, label: c.label }))} />
          <Select label="Medio de pago" value={form.medio_pago} onChange={v => set('medio_pago', v)}
            options={MEDIOS_PAGO.map(m => ({ value: m.id, label: m.label }))} />
        </div>

        {esSueldo && empleados.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Empleado" value={form.empleado_id} onChange={v => set('empleado_id', v)}
              options={[{ value: '', label: '— Sin asignar —' },
                ...empleados.map(e => ({ value: e.id, label: `${e.nombre} ${e.apellido || ''}`.trim() }))]} />
            <Select label="Tipo" value={form.subtipo} onChange={v => set('subtipo', v)}
              options={[{ value: '', label: '—' }, ...SUBTIPOS_SUELDO.map(s => ({ value: s, label: s }))]} />
          </div>
        )}

        {!esSueldo && proveedores.length > 0 && (
          <Select label="Proveedor (opcional)" value={form.proveedor_id} onChange={v => set('proveedor_id', v)}
            options={[{ value: '', label: '— Sin proveedor —' },
              ...proveedores.map(p => ({ value: p.id, label: p.razon_social }))]} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select label="Estado" value={form.estado} onChange={v => set('estado', v)}
            options={[{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente (por pagar)' }]} />
          {form.estado === 'pendiente' && (
            <Field label="Vencimiento" value={form.vencimiento} onChange={v => set('vencimiento', v)} type="date" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nro. comprobante" value={form.comprobante_nro} onChange={v => set('comprobante_nro', v)}
            placeholder="Factura / recibo" />
        </div>

        <TextArea label="Notas" value={form.notas} onChange={v => set('notas', v)}
          placeholder="Detalle adicional…" />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Registrar egreso')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
