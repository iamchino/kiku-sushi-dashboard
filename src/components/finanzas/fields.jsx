// Campos de formulario reutilizables para Finanzas.
// Definidos a nivel de módulo para no perder el foco al re-renderizar.

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

export function Field({ label, value, onChange, placeholder, icon: Icon, inputMode, type = 'text', maxLength, required }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}{required && ' *'}
      </label>
      <div className="relative">
        {Icon && (
          <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-xmuted)' }} />
        )}
        <input
          type={type}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete="off" autoCorrect="off" spellCheck={false}
          className="w-full rounded-lg text-sm outline-none transition-all"
          style={{ ...inputStyle, padding: Icon ? '8px 12px 8px 32px' : '8px 12px' }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>
    </div>
  )
}

export function Select({ label, value, onChange, options, required }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}{required && ' *'}
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg text-sm outline-none transition-all"
        style={{ ...inputStyle, padding: '8px 12px' }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <textarea
        rows={rows}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg text-sm outline-none resize-none transition-all"
        style={{ ...inputStyle, padding: '8px 12px' }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

// Cáscara de modal (overlay + caja con header).
export function ModalShell({ title, icon: Icon, onClose, children, maxW = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className={`w-full ${maxW} rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto`}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--accent-soft)' }}>
                <Icon size={14} style={{ color: 'var(--accent-lift)' }} />
              </div>
            )}
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
