import { useEffect, useMemo, useState } from 'react'
import {
  X, Save, Loader2, Calendar, Clock, User, Phone, MapPin,
  Utensils, ShoppingBag, Truck, Users, StickyNote, AlertTriangle,
} from 'lucide-react'

const CANAL_OPCIONES = [
  { id: 'salon',    label: 'Para Comer Aquí', icon: Utensils    },
  { id: 'llevar',   label: 'Para Llevar',     icon: ShoppingBag },
  { id: 'delivery', label: 'Delivery / Web',  icon: Truck       },
]

const pad = (n) => String(n).padStart(2, '0')

// Descompone un ISO (o Date) en fecha 'YYYY-MM-DD' y hora 'HH:MM' LOCALES.
function partesLocales(value) {
  const d = value ? new Date(value) : new Date()
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora:  `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

// Combina fecha 'YYYY-MM-DD' + hora 'HH:MM' en hora LOCAL y devuelve ISO (UTC).
function combinarISO(fecha, hora) {
  if (!fecha) return null
  const [y, m, d] = fecha.split('-').map(Number)
  const [hh, mm]  = (hora || '00:00').split(':').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0)
  if (isNaN(dt.getTime())) return null
  return dt.toISOString()
}

/**
 * Editor completo de los datos de cabecera de una orden:
 * fecha/hora, tipo (canal), cliente (nombre / teléfono / dirección),
 * mesa, personas y notas. Guarda solo los campos que cambiaron.
 */
export default function EditarDatosPedidoModal({ open, pedido, facturada = false, onClose, onGuardar }) {
  const inicial = useMemo(() => {
    const { fecha, hora } = partesLocales(pedido?.created_at)
    return {
      fecha,
      hora,
      canal:             pedido?.canal || (pedido?.mesa_id ? 'salon' : 'llevar'),
      cliente_nombre:    pedido?.cliente_nombre    || '',
      cliente_telefono:  pedido?.cliente_telefono  || '',
      cliente_direccion: pedido?.cliente_direccion || '',
      mesa:              pedido?.mesa != null ? String(pedido.mesa) : '',
      personas:          pedido?.personas != null ? String(pedido.personas) : '',
      notas:             pedido?.notas || '',
    }
  }, [pedido])

  const [form, setForm] = useState(inicial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (open) { setForm(inicial); setError(null); setBusy(false) } }, [open, inicial])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !pedido) return null

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  const handleGuardar = async () => {
    setError(null)

    if (!form.fecha) { setError('La fecha es obligatoria.'); return }
    const createdISO = combinarISO(form.fecha, form.hora)
    if (!createdISO) { setError('Fecha u hora inválida.'); return }

    // Armamos el patch solo con lo que cambió respecto del original.
    const patch = {}
    const nombre    = form.cliente_nombre.trim()    || null
    const telefono  = form.cliente_telefono.trim()  || null
    const direccion = form.cliente_direccion.trim() || null
    const mesa      = form.mesa.trim() || null
    const notas     = form.notas.trim() || null
    const personas  = form.personas.trim() === '' ? null : Math.max(0, parseInt(form.personas, 10) || 0)

    const origenISO = combinarISO(inicial.fecha, inicial.hora)
    if (createdISO !== origenISO)                        patch.created_at        = createdISO
    if (form.canal !== inicial.canal)                    patch.canal             = form.canal
    if ((pedido.cliente_nombre    || null) !== nombre)    patch.cliente_nombre    = nombre
    if ((pedido.cliente_telefono  || null) !== telefono)  patch.cliente_telefono  = telefono
    if ((pedido.cliente_direccion || null) !== direccion) patch.cliente_direccion = direccion
    if ((pedido.mesa != null ? String(pedido.mesa) : '') !== (mesa || '')) patch.mesa = mesa
    if ((pedido.personas ?? null) !== personas)          patch.personas          = personas
    if ((pedido.notas || null) !== notas)                patch.notas             = notas

    if (Object.keys(patch).length === 0) { onClose?.(); return }

    setBusy(true)
    const err = await onGuardar?.(pedido.id, patch)
    setBusy(false)
    if (err) { setError(err.message || 'No se pudieron guardar los cambios.'); return }
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))', color: '#fff' }}
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-90">Editar datos</p>
            <p className="font-bold text-lg leading-none mt-0.5">Orden {pedido.codigo || `KS${String(pedido.id).slice(-4).toUpperCase()}`}</p>
          </div>
          <button
            type="button" onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {facturada && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#f59e0b' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Orden facturada.</strong> Cambiar la fecha o los datos puede generar
                inconsistencias con el comprobante fiscal ya emitido.
              </span>
            </div>
          )}

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha" icon={Calendar}>
              <input type="date" value={form.fecha} onChange={set('fecha')} className={inputCls} style={inputStyle} />
            </Campo>
            <Campo label="Hora" icon={Clock}>
              <input type="time" value={form.hora} onChange={set('hora')} className={inputCls} style={inputStyle} />
            </Campo>
          </div>

          {/* Tipo / canal */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Tipo de orden</p>
            <div className="grid grid-cols-3 gap-2">
              {CANAL_OPCIONES.map(op => {
                const Icon = op.icon
                const activo = form.canal === op.id
                return (
                  <button
                    key={op.id} type="button"
                    onClick={() => setForm(f => ({ ...f, canal: op.id }))}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={activo
                      ? { background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }
                      : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    <Icon size={15} />
                    {op.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cliente */}
          <Campo label="Nombre del cliente" icon={User}>
            <input type="text" value={form.cliente_nombre} onChange={set('cliente_nombre')} placeholder="Nombre" className={inputCls} style={inputStyle} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Teléfono" icon={Phone}>
              <input type="tel" value={form.cliente_telefono} onChange={set('cliente_telefono')} placeholder="Teléfono" className={inputCls} style={inputStyle} />
            </Campo>
            <Campo label="Personas" icon={Users}>
              <input type="number" min="0" value={form.personas} onChange={set('personas')} placeholder="0" className={inputCls} style={inputStyle} />
            </Campo>
          </div>
          <Campo label="Dirección" icon={MapPin}>
            <input type="text" value={form.cliente_direccion} onChange={set('cliente_direccion')} placeholder="Dirección de entrega" className={inputCls} style={inputStyle} />
          </Campo>

          {/* Mesa */}
          <Campo label="Mesa" icon={Utensils}>
            <input type="text" value={form.mesa} onChange={set('mesa')} placeholder="Nº de mesa (opcional)" className={inputCls} style={inputStyle} />
          </Campo>

          {/* Notas */}
          <Campo label="Notas" icon={StickyNote}>
            <textarea rows={3} value={form.notas} onChange={set('notas')} placeholder="Notas de la orden…"
              className={`${inputCls} resize-none`} style={inputStyle} />
          </Campo>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-3 grid grid-cols-2 gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button" onClick={onClose}
            className="py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleGuardar} disabled={busy}
            className="py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors'
const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

function Campo({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 mb-1" style={{ color: 'var(--text-muted)' }}>
        {Icon && <Icon size={11} />} {label}
      </span>
      {children}
    </label>
  )
}
