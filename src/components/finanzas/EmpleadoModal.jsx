import { useState } from 'react'
import { AlertTriangle, UserCog } from 'lucide-react'
import { Field, Select, TextArea, ModalShell } from './fields'

const EMPTY = {
  nombre: '', apellido: '', puesto: '', sueldo_base: '', tipo_sueldo: 'fijo',
  fecha_ingreso: '', cuit_cuil: '', cbu: '', alias: '', telefono: '',
  frecuencia_pago: 'mensual', dia_pago: '', dia_pago_semana: '6',
  activo: true, notas: '',
}

const DIAS_SEMANA = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
]

export default function EmpleadoModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => initial
    ? {
        ...EMPTY, ...initial,
        fecha_ingreso: initial.fecha_ingreso?.slice(0, 10) || '',
        tipo_sueldo: initial.tipo_sueldo || 'fijo',
        frecuencia_pago: initial.frecuencia_pago || 'mensual',
        dia_pago: initial.dia_pago ?? '',
        dia_pago_semana: initial.dia_pago_semana != null ? String(initial.dia_pago_semana) : '6',
      }
    : EMPTY)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setErr('El nombre es obligatorio.'); return }
    setSaving(true); setErr(null)
    const payload = {
      nombre: form.nombre.trim(),
      apellido: form.apellido?.trim() || null,
      puesto: form.puesto?.trim() || null,
      sueldo_base: Number(form.sueldo_base) || 0,
      tipo_sueldo: form.tipo_sueldo === 'hora' ? 'hora' : 'fijo',
      fecha_ingreso: form.fecha_ingreso || null,
      cuit_cuil: form.cuit_cuil?.trim() || null,
      cbu: form.cbu?.trim() || null,
      alias: form.alias?.trim() || null,
      telefono: form.telefono?.trim() || null,
      frecuencia_pago: form.frecuencia_pago || 'mensual',
      dia_pago: form.frecuencia_pago === 'semanal' ? null : (form.dia_pago ? Number(form.dia_pago) : null),
      dia_pago_semana: form.frecuencia_pago === 'semanal'
        ? (form.dia_pago_semana !== '' ? Number(form.dia_pago_semana) : 6)
        : null,
      activo: form.activo === true || form.activo === 'true',
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
    <ModalShell title={initial ? 'Editar empleado' : 'Nuevo empleado'} icon={UserCog} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {err && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
            <AlertTriangle size={12} /> {err}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" value={form.nombre} onChange={v => set('nombre', v)} placeholder="Juan" required />
          <Field label="Apellido" value={form.apellido} onChange={v => set('apellido', v)} placeholder="Pérez" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Puesto" value={form.puesto} onChange={v => set('puesto', v)} placeholder="Cocinero / Mozo / Cajero" />
          <Select label="Tipo de sueldo" value={form.tipo_sueldo} onChange={v => set('tipo_sueldo', v)}
            options={[{ value: 'fijo', label: 'Fijo (mensual)' }, { value: 'hora', label: 'Por hora' }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={form.tipo_sueldo === 'hora' ? 'Valor por hora' : 'Sueldo base'}
            value={form.sueldo_base} onChange={v => set('sueldo_base', v.replace(/[^\d.]/g, ''))} placeholder="0" inputMode="decimal" />
          <Field label="Fecha de ingreso" value={form.fecha_ingreso} onChange={v => set('fecha_ingreso', v)} type="date" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Frecuencia de pago" value={form.frecuencia_pago} onChange={v => set('frecuencia_pago', v)}
            options={[
              { value: 'mensual', label: 'Mensual' },
              { value: 'quincenal', label: 'Quincenal' },
              { value: 'semanal', label: 'Semanal' },
            ]} />
          {form.frecuencia_pago === 'semanal'
            ? <Select label="Día de la semana" value={form.dia_pago_semana} onChange={v => set('dia_pago_semana', v)} options={DIAS_SEMANA} />
            : <Field label="Día de pago (1-31)" value={form.dia_pago} onChange={v => set('dia_pago', v.replace(/\D/g, '').slice(0, 2))} placeholder="Ej: 5" inputMode="numeric" />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CUIT / CUIL" value={form.cuit_cuil} onChange={v => set('cuit_cuil', v)} placeholder="20-12345678-9" inputMode="numeric" />
          <Field label="Teléfono" value={form.telefono} onChange={v => set('telefono', v)} placeholder="+54 9 11 …" inputMode="tel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CBU" value={form.cbu} onChange={v => set('cbu', v.replace(/\D/g, ''))} placeholder="22 dígitos" inputMode="numeric" maxLength={22} />
          <Field label="Alias" value={form.alias} onChange={v => set('alias', v)} placeholder="mi.alias.banco" />
        </div>
        <Select label="Estado" value={String(form.activo)} onChange={v => set('activo', v === 'true')}
          options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo / baja' }]} />
        <TextArea label="Notas" value={form.notas} onChange={v => set('notas', v)} placeholder="Observaciones…" />

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear empleado')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
