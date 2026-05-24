import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { getEstadoConfig } from './mesaColors'
import { useMinutesSince } from '../../hooks/useNowTick'

/**
 * Tile visual de una mesa, posicionada en absoluto dentro del canvas.
 */
export default function MesaTile({
  mesa,
  selected = false,
  onClick,
  editMode = false,
  dragging = false,
  scale = 1,
}) {
  const cfg = useMemo(() => getEstadoConfig(mesa.estado_mesa), [mesa.estado_mesa])

  const left   = (mesa.pos_x || 0) * scale
  const top    = (mesa.pos_y || 0) * scale
  const width  = (mesa.ancho || 80) * scale
  const height = (mesa.alto  || 80) * scale

  const isCircle = mesa.forma === 'circle'

  const minutos = useMinutesSince(mesa.pedido_abierta_at)

  const mozoInitial = mesa.mozo_nombre?.trim()?.charAt(0)?.toUpperCase() || null

  return (
    <button
      type="button"
      onClick={() => !editMode && onClick?.(mesa)}
      className="absolute flex flex-col items-center justify-center font-bold transition-all duration-150 select-none"
      style={{
        left, top, width, height,
        background: cfg.bg,
        color: cfg.textLight,
        borderRadius: isCircle ? '50%' : '12px',
        border: cfg.isLibre ? `1.5px dashed ${cfg.borderHi}` : `1px solid ${cfg.border}`,
        boxShadow: selected
          ? `0 0 0 3px var(--accent-lift), 0 8px 24px rgba(0,0,0,0.3)`
          : dragging
            ? '0 12px 32px rgba(0,0,0,0.4)'
            : cfg.isLibre
              ? 'none'
              : '0 4px 12px rgba(0,0,0,0.18)',
        outline: 'none',
        cursor: editMode ? 'move' : 'pointer',
        opacity: dragging ? 0.85 : 1,
        zIndex: dragging || selected ? 10 : 1,
      }}
    >
      <span style={{ fontSize: Math.max(14, Math.min(width, height) * 0.35), lineHeight: 1 }}>
        {mesa.numero}
      </span>

      {mozoInitial && !editMode && (
        <span
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow"
          style={{
            background: mesa.mozo_color || 'var(--accent-lift)',
            color: '#ffffff',
            border: '2px solid var(--bg-app)',
          }}
        >
          {mozoInitial}
        </span>
      )}

      {!editMode && width >= 90 && height >= 70 && mesa.estado_mesa !== 'libre' && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-medium opacity-90">
          <Users size={10} />
          <span>{mesa.pedido_personas || mesa.capacidad}</span>
          {minutos !== null && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{minutos}m</span>
            </>
          )}
        </div>
      )}

      {editMode && (
        <span className="text-[9px] mt-0.5 opacity-70">
          {mesa.ancho}×{mesa.alto}
        </span>
      )}
    </button>
  )
}
