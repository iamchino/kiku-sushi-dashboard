import { useEffect, useState } from 'react'
import { X, Calendar, Clock, Users, User, Phone, Mail, FileText, Loader2, AlertCircle, Salad, Accessibility } from 'lucide-react'

/**
 * Modal para crear una reserva manual desde el dashboard.
 * Origen = 'dashboard'. No aplica la restricción de anticipación mínima.
 */
export default function NuevaReservaModal({ open, onClose, onCreate }) {
  const [fecha,    setFecha]    = useState('')
  const [hora,     setHora]     = useState('20:30')
  const [personas, setPersonas] = useState(2)
  const [nombre,   setNombre]   = useState('')
  const [telefono, setTelefono] = useState('')
  const [email,    setEmail]    = useState('')
  const [notas,    setNotas]    = useState('')
  const [restricciones, setRestricciones] = useState('')
  const [accesibilidad, setAccesibilidad] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setFecha(''); setHora('20:30'); setPersonas(2)
      setNombre(''); setTelefono(''); setEmail(''); setNotas('')
      setRestricciones(''); setAccesibilidad('')
      setBusy(false); setError(null)
    } else {
      // Default: hoy
      setFecha(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) { setError('Falta el nombre del cliente'); return }
    if (!fecha || !hora) { setError('Falta fecha u hora'); return }

    setBusy(true)
    const { error: err } = await onCreate?.({
      fecha,
      hora,
      personas: Math.max(1, parseInt(personas) || 1),
      cliente_nombre:   nombre.trim(),
      cliente_telefono: telefono.trim() || null,
      cliente_email:    email.trim()    || null,
      notas:            notas.trim()    || null,
      restricciones:    restricciones.trim() || null,
      accesibilidad:    accesibilidad.trim() || null,
      origen:           'dashboard',
      auto_confirmar:   true,
    }) || {}
    setBusy(false)
    if (err) { setError(err.message || 'Error al crear la reserva'); return }
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full md:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex-shrink-0 flex items-start justify-between px-5 py-4 gap-3"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
            color: '#fff',
          }}
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">Nueva reserva</p>
            <p className="font-bold text-base mt-0.5">Cargar reserva manual</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="rounded-lg p-2.5 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field icon={Calendar} label="Fecha">
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                required
                className="w-full px-2 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </Field>
            <Field icon={Clock} label="Hora">
              <input
                type="time"
                value={hora}
                onChange={e => setHora(e.target.value)}
                required
                className="w-full px-2 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </Field>
          </div>

          <Field icon={Users} label="Personas">
            <input
              type="number"
              min={1} max={100}
              value={personas}
              onChange={e => setPersonas(e.target.value)}
              required
              className="w-full px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </Field>

          <Field icon={User} label="Nombre del cliente">
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
              required
              className="w-full px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field icon={Phone} label="Teléfono">
              <input
                type="tel"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="+54 11..."
                className="w-full px-2 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </Field>
            <Field icon={Mail} label="Email">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="opcional"
                className="w-full px-2 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </Field>
          </div>

          <Field icon={Salad} label="Restricciones alimentarias (opcional)">
            <input
              type="text"
              value={restricciones}
              onChange={e => setRestricciones(e.target.value)}
              placeholder="Vegetariano, celíaco, alergias, etc."
              className="w-full px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </Field>

          <Field icon={Accessibility} label="Accesibilidad (opcional)">
            <input
              type="text"
              value={accesibilidad}
              onChange={e => setAccesibilidad(e.target.value)}
              placeholder="Silla de ruedas, planta baja, etc."
              className="w-full px-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </Field>

          <Field icon={FileText} label="Notas (opcional)">
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Cumpleaños, ocasión especial, etc."
              className="w-full px-2 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </Field>
        </div>

        <div className="flex-shrink-0 flex gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creando…</> : 'Crear reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ icon: Icon, label, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
        <Icon size={11} /> {label}
      </span>
      {children}
    </label>
  )
}
