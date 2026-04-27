import { useState, useEffect } from 'react'
import { X, Loader2, User, Phone, Mail, Calendar, FileText, ShoppingBag, Star } from 'lucide-react'
import { ALL_TAGS, TAGS_CONFIG } from '../../hooks/useClientes'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const CANAL_LABEL = {
  salon: 'Salón', delivery: 'Delivery', whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa', rappi: 'Rappi',
}

const EMPTY = { nombre: '', telefono: '', email: '', cumpleanos: '', notas: '', tags: '' }

export default function ClienteModal({ open, onClose, cliente, onSave }) {
  const [tab,    setTab]    = useState('datos')
  const [form,   setForm]   = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    if (open) {
      setForm(cliente
        ? {
            nombre:     cliente.nombre     || '',
            telefono:   cliente.telefono   || '',
            email:      cliente.email      || '',
            cumpleanos: cliente.cumpleanos || '',
            notas:      cliente.notas      || '',
            tags:       cliente.tags       || '',
          }
        : EMPTY)
      setTab('datos')
      setError(null)
    }
  }, [open, cliente])

  if (!open) return null

  const handleField = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const toggleTag = (tag) => {
    const current = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    setForm(f => ({ ...f, tags: next.join(', ') }))
  }

  const activeTags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError(null)
    const err = await onSave(form)
    setSaving(false)
    if (err) setError(err.message || 'Error al guardar.')
    else onClose()
  }

  const pedidos = [...(cliente?.pedidos || [])].sort((a, b) =>
    b.created_at > a.created_at ? 1 : -1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: '#1c1c1f', border: '1px solid #2a2a2e', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2a2a2e' }}>
          <div>
            <p className="font-semibold text-white text-base">
              {cliente ? cliente.nombre : 'Nuevo cliente'}
            </p>
            {cliente && (
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs" style={{ color: '#52525b' }}>
                  {cliente._visitas} {cliente._visitas === 1 ? 'visita' : 'visitas'} ·
                  ${(cliente._totalGastado || 0).toLocaleString('es-AR')} total
                </span>
                {/* Puntos de fidelidad */}
                {(cliente.puntos || 0) > 0 && (
                  <span
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                  >
                    <Star size={9} />
                    {cliente.puntos} pts
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: '#71717a' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs (solo al editar) */}
        {cliente && (
          <div className="flex px-6 pt-4 gap-1">
            {[
              { id: 'datos',    label: 'Datos' },
              { id: 'historial', label: `Historial (${pedidos.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={tab === t.id
                  ? { background: 'rgba(124,58,237,0.15)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.3)' }
                  : { color: '#52525b' }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── TAB DATOS ── */}
        {tab === 'datos' && (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">

            <Field icon={User} label="Nombre *">
              <input name="nombre" value={form.nombre} onChange={handleField}
                className="input-crm" placeholder="Nombre y apellido" required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field icon={Phone} label="Teléfono">
                <input name="telefono" value={form.telefono} onChange={handleField}
                  className="input-crm" placeholder="+54 9 341 000 0000" />
              </Field>
              <Field icon={Mail} label="Email">
                <input name="email" value={form.email} onChange={handleField} type="email"
                  className="input-crm" placeholder="cliente@email.com" />
              </Field>
            </div>

            <Field icon={Calendar} label="Cumpleaños">
              <input name="cumpleanos" value={form.cumpleanos} onChange={handleField} type="date"
                className="input-crm" />
            </Field>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: '#a1a1aa' }}>Etiquetas</label>
              <div className="flex flex-wrap gap-2">
                {ALL_TAGS.map(tag => {
                  const cfg = TAGS_CONFIG[tag]
                  const active = activeTags.includes(tag)
                  return (
                    <button key={tag} type="button" onClick={() => toggleTag(tag)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{
                        background: active ? cfg.bg : '#111113',
                        color:      active ? cfg.color : '#52525b',
                        border:     `1px solid ${active ? cfg.border : '#2a2a2e'}`,
                      }}>
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            <Field icon={FileText} label="Notas internas">
              <textarea name="notas" value={form.notas} onChange={handleField}
                rows={3} className="input-crm resize-none"
                placeholder="Preferencias, alergias, observaciones…" />
            </Field>

            {/* Puntos (solo al editar, read-only) */}
            {cliente && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                <Star size={15} style={{ color: '#fbbf24' }} />
                <div>
                  <p className="text-sm font-semibold text-white">{cliente.puntos || 0} puntos de fidelidad</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#52525b' }}>
                    Los puntos se acumulan automáticamente con cada pedido
                  </p>
                </div>
              </div>
            )}

            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ color: '#71717a', border: '1px solid #2a2a2e' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB HISTORIAL ── */}
        {tab === 'historial' && (
          <div className="flex-1 overflow-y-auto p-6">
            {pedidos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
                <ShoppingBag size={36} style={{ color: '#52525b' }} />
                <p className="text-sm" style={{ color: '#52525b' }}>Sin pedidos registrados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pedidos.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: '#111113', border: '1px solid #2a2a2e' }}>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {format(new Date(p.created_at), "d 'de' MMMM, yyyy · HH:mm", { locale: es })}
                      </p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: '#52525b' }}>
                        {CANAL_LABEL[p.canal] || p.canal}
                        {p.estado && <span className="ml-2">· {p.estado}</span>}
                      </p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#7c3aed' }}>
                      ${parseFloat(p.total || 0).toLocaleString('es-AR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .input-crm {
          width: 100%; background: #111113; border: 1px solid #2a2a2e;
          border-radius: 8px; padding: 9px 12px; font-size: 13px;
          color: #e4e4e7; outline: none; transition: border-color 0.15s;
        }
        .input-crm:focus { border-color: rgba(124,58,237,0.5); }
        .input-crm::placeholder { color: #3f3f46; }
      `}</style>
    </div>
  )
}

function Field({ icon: Icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#a1a1aa' }}>
        <Icon size={12} /> {label}
      </label>
      {children}
    </div>
  )
}
