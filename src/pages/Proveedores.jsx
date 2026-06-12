import { useState } from 'react'
import { Plus, Search, Edit2, Trash2, X, RefreshCw, Truck, Phone, CreditCard, FileText, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useProveedores } from '../hooks/useProveedores'

const EMPTY_FORM = {
  razon_social: '',
  nro_cuenta: '',
  cuit_cuil: '',
  cbu: '',
  alias: '',
  telefono: '',
  notas: '',
}

// ── Campo de formulario (definido a nivel de módulo para no perder el foco) ────
// IMPORTANTE: este componente NO debe definirse dentro de ProveedorModal.
// Si se define adentro, React lo recrea en cada tecla, remonta el <input> y se
// pierde el foco (había que volver a hacer clic tras escribir un solo carácter).
function Field({ label, value, onChange, placeholder, icon: Icon, inputMode, maxLength, autoCapitalize = 'none' }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-xmuted)' }} />
        )}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize={autoCapitalize}
          spellCheck={false}
          className="w-full rounded-lg text-sm outline-none transition-all"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: Icon ? '8px 12px 8px 32px' : '8px 12px',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>
    </div>
  )
}

// Solo dígitos (para CBU)
const onlyDigits = (s) => s.replace(/\D/g, '')

// ── Modal alta/edición ────────────────────────────────────────────────────────
function ProveedorModal({ initial, onClose, onSave }) {
  const [form, setForm]   = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const razon = form.razon_social.trim()
    if (!razon) { setErr('La razón social es obligatoria.'); return }
    if (form.cbu && form.cbu.length !== 22) {
      setErr('El CBU debe tener 22 dígitos.'); return
    }
    setSaving(true); setErr(null)
    // Limpia espacios sobrantes en todos los campos de texto antes de guardar
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-soft)' }}>
              <Truck size={14} style={{ color: 'var(--accent-lift)' }} />
            </div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {initial ? 'Editar proveedor' : 'Nuevo proveedor'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              <AlertTriangle size={12} /> {err}
            </div>
          )}

          <Field label="Razón social *" value={form.razon_social} onChange={v => set('razon_social', v)}
            placeholder="Nombre o empresa" icon={Truck} autoCapitalize="words" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT / CUIL" value={form.cuit_cuil} onChange={v => set('cuit_cuil', v)}
              placeholder="20-12345678-9" icon={FileText} inputMode="numeric" maxLength={13} />
            <Field label="Nro. de cuenta" value={form.nro_cuenta} onChange={v => set('nro_cuenta', v)}
              placeholder="000-123456/7" icon={CreditCard} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CBU" value={form.cbu} onChange={v => set('cbu', onlyDigits(v))}
              placeholder="22 dígitos" inputMode="numeric" maxLength={22} />
            <Field label="Alias" value={form.alias} onChange={v => set('alias', v)}
              placeholder="mi.alias.banco" />
          </div>

          <Field label="Teléfono" value={form.telefono} onChange={v => set('telefono', v)}
            placeholder="+54 9 11 1234-5678" icon={Phone} inputMode="tel" />

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Notas
            </label>
            <textarea
              rows={3}
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Condiciones de pago, contacto adicional, etc."
              className="w-full rounded-lg text-sm outline-none resize-none transition-all"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

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
              {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear proveedor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tarjeta proveedor ─────────────────────────────────────────────────────────
function ProveedorCard({ prov, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-soft)' }}>
            <Truck size={15} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {prov.razon_social}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              {prov.cuit_cuil && (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  CUIT: {prov.cuit_cuil}
                </span>
              )}
              {prov.telefono && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Phone size={9} /> {prov.telefono}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={() => onEdit(prov)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Edit2 size={14} />
          </button>
          <button onClick={() => onDelete(prov)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-3 pt-3">
            {[
              { label: 'Nro. de cuenta', value: prov.nro_cuenta },
              { label: 'CBU',            value: prov.cbu        },
              { label: 'Alias',          value: prov.alias      },
              { label: 'Teléfono',       value: prov.telefono   },
            ].map(({ label, value }) => value ? (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{value}</p>
              </div>
            ) : null)}
          </div>
          {prov.notas && (
            <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-input)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Notas</p>
              <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{prov.notas}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal confirmación eliminar ───────────────────────────────────────────────
function ConfirmDeleteModal({ prov, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try { await onConfirm(); onClose() } catch { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
          style={{ background: 'rgba(248,113,113,0.1)' }}>
          <Trash2 size={18} style={{ color: '#f87171' }} />
        </div>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          Eliminar proveedor
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          ¿Eliminás a <strong style={{ color: 'var(--text-secondary)' }}>{prov.razon_social}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ProveedoresPage() {
  const { proveedores, loading, error, refetch, crearProveedor, actualizarProveedor, eliminarProveedor } = useProveedores()
  const [search, setSearch]       = useState('')
  const [modal, setModal]         = useState(null) // null | 'nuevo' | proveedor (editar)
  const [toDelete, setToDelete]   = useState(null)

  const filtrados = proveedores.filter(p =>
    [p.razon_social, p.cuit_cuil, p.alias, p.telefono].some(
      v => v?.toLowerCase().includes(search.toLowerCase())
    )
  )

  const handleSave = async (form) => {
    if (modal === 'nuevo') {
      await crearProveedor(form)
    } else {
      await actualizarProveedor(modal.id, form)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Proveedores
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Datos bancarios y de contacto — solo visible para administradores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetch} disabled={loading}
            className="p-2 rounded-lg disabled:opacity-50 transition-all"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={() => setModal('nuevo')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
            <Plus size={14} /> Nuevo proveedor
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-xmuted)' }} />
        <input
          type="text"
          placeholder="Buscar por razón social, CUIT, alias o teléfono…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}>
            <Truck size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {search ? 'No hay proveedores que coincidan' : 'No hay proveedores cargados'}
          </p>
          {!search && (
            <button onClick={() => setModal('nuevo')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
              + Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(p => (
            <ProveedorCard
              key={p.id}
              prov={p}
              onEdit={p => setModal(p)}
              onDelete={p => setToDelete(p)}
            />
          ))}
          <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-xmuted)' }}>
            {filtrados.length} proveedor{filtrados.length !== 1 ? 'es' : ''}
          </p>
        </div>
      )}

      {/* Modales */}
      {modal && (
        <ProveedorModal
          initial={modal !== 'nuevo' ? modal : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {toDelete && (
        <ConfirmDeleteModal
          prov={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={() => eliminarProveedor(toDelete.id)}
        />
      )}
    </div>
  )
}
