import { useMemo } from 'react'
import { Users, Link2 } from 'lucide-react'
import { getEstadoConfig } from './mesaColors'
import { useMinutesSince } from '../../hooks/useNowTick'

/**
 * Tile visual de una mesa, posicionada en absoluto dentro del canvas.
 *
 * Soporte de agrupación:
 *   - Si la mesa es MIEMBRO de un grupo (mesa.mesa_grupo_id set), se renderiza
 *     usando el estado de la mesa líder (`leaderMesa` prop) para que ambas se
 *     vean igual de "ocupadas" y con el mismo color.
 *   - Si la mesa es LÍDER de un grupo, se muestra un badge "+N" con la
 *     cantidad de miembros.
 *   - El click en una mesa miembro debe ser ruteado al líder desde el padre
 *     (Mesas.jsx ya lo hace).
 */
export default function MesaTile({
  mesa,
  selected = false,
  onClick,
  editMode = false,
  dragging = false,
  scale = 1,
  leaderMesa = null, // si esta mesa es miembro, leaderMesa es el líder del grupo
}) {
  const esMiembro = Boolean(mesa.mesa_grupo_id)
  const esLider   = Boolean(mesa.es_lider_grupo)
  const miembros  = mesa.miembros_grupo || []

  // Si es miembro, el estado visual viene del líder.
  const refEstado = esMiembro && leaderMesa ? leaderMesa.estado_mesa : mesa.estado_mesa
  const refMozo   = esMiembro && leaderMesa ? leaderMesa.mozo_nombre : mesa.mozo_nombre
  const refMozoCol= esMiembro && leaderMesa ? leaderMesa.mozo_color  : mesa.mozo_color
  const refPersonas = esMiembro && leaderMesa ? leaderMesa.pedido_personas : mesa.pedido_personas
  const refAbiertaAt= esMiembro && leaderMesa ? leaderMesa.pedido_abierta_at : mesa.pedido_abierta_at

  const cfg = useMemo(() => getEstadoConfig(refEstado), [refEstado])

  const left   = (mesa.pos_x || 0) * scale
  const top    = (mesa.pos_y || 0) * scale
  const width  = (mesa.ancho || 80) * scale
  const height = (mesa.alto  || 80) * scale

  const isCircle = mesa.forma === 'circle'
  const minutos = useMinutesSince(refAbiertaAt)
  const mozoInitial = refMozo?.trim()?.charAt(0)?.toUpperCase() || null

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
            : esLider || esMiembro
              ? `0 0 0 2px var(--accent-lift), 0 4px 12px rgba(0,0,0,0.18)`
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
        {esLider && miembros.length > 0 && (
          <span className="ml-1 text-[10px] font-bold align-middle"
            style={{ color: 'var(--accent-lift)' }}>
            +{miembros.length}
          </span>
        )}
      </span>

      {/* Badge link cuando es miembro: muestra a quién está unida */}
      {esMiembro && leaderMesa && !editMode && (
        <span
          className="absolute -top-1 -left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow"
          style={{
            background: 'var(--accent-lift)',
            color: '#ffffff',
            border: '2px solid var(--bg-app)',
          }}
          title={`Agrupada con mesa ${leaderMesa.numero}`}
        >
          <Link2 size={8} /> {leaderMesa.numero}
        </span>
      )}

      {mozoInitial && !editMode && (
        <span
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow"
          style={{
            background: refMozoCol || 'var(--accent-lift)',
            color: '#ffffff',
            border: '2px solid var(--bg-app)',
          }}
        >
          {mozoInitial}
        </span>
      )}

      {!editMode && width >= 90 && height >= 70 && refEstado !== 'libre' && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-medium opacity-90">
          <Users size={10} />
          <span>{refPersonas || mesa.capacidad}</span>
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
