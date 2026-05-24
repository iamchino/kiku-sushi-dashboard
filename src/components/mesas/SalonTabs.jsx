import { Plus } from 'lucide-react'

/**
 * Tabs horizontales de salones, con contador de mesas libres.
 * En modo edición permite agregar nuevo salón.
 */
export default function SalonTabs({
  salones = [],
  activeSalonId,
  onSelectSalon,
  countsBySalonId = {},   // { [salonId]: { libres, total } }
  onAddSalon,
  editMode = false,
}) {
  if (salones.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 md:px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin salones creados</span>
        {editMode && onAddSalon && (
          <button
            type="button"
            onClick={onAddSalon}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}
          >
            <Plus size={12} /> Nuevo salón
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-4 md:px-6 py-2.5 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {salones.map(salon => {
        const isActive = salon.id === activeSalonId
        const counts = countsBySalonId[salon.id] || {}
        return (
          <button
            key={salon.id}
            type="button"
            onClick={() => onSelectSalon?.(salon)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={isActive
              ? { background: 'var(--accent)', color: '#ffffff', border: '1px solid var(--accent)' }
              : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
            }
          >
            <span>{salon.nombre}</span>
            {counts.total !== undefined && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={isActive
                  ? { background: 'rgba(255,255,255,0.18)', color: '#ffffff' }
                  : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
                }
              >
                {counts.libres}/{counts.total}
              </span>
            )}
          </button>
        )
      })}

      {editMode && onAddSalon && (
        <button
          type="button"
          onClick={onAddSalon}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={12} /> Salón
        </button>
      )}
    </div>
  )
}
