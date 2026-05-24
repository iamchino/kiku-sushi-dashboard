import { useRef, useCallback } from 'react'
import { getEstadoConfig } from './mesaColors'

const HANDLE_SIZE = 12
const MIN_SIZE = 50

/**
 * Tile en modo edición: arrastrable + resize via handle inferior-derecho.
 * onMove(dx, dy) / onResize(dw, dh) reportan deltas en coordenadas de canvas (no escaladas).
 * onClick (sin drag) abre edición de la mesa.
 */
export default function MesaEditorTile({
  mesa,
  selected = false,
  scale = 1,
  snap = 20,
  onSelect,
  onCommitMove,    // (newX, newY)
  onCommitResize,  // (newW, newH)
  onEdit,
}) {
  const cfg = getEstadoConfig(mesa.estado_mesa)
  const isCircle = mesa.forma === 'circle'

  const tileRef = useRef(null)
  const dragRef = useRef({
    mode: null,            // 'move' | 'resize' | null
    startX: 0, startY: 0,
    origX: 0, origY: 0,
    origW: 0, origH: 0,
    moved: false,
    transient: null,       // patch a aplicar en pantalla durante el drag
  })

  const snapVal = (v) => snap ? Math.round(v / snap) * snap : Math.round(v)

  const applyTransient = (patch) => {
    if (!tileRef.current) return
    if (patch.x !== undefined) tileRef.current.style.left   = `${Math.max(0, patch.x) * scale}px`
    if (patch.y !== undefined) tileRef.current.style.top    = `${Math.max(0, patch.y) * scale}px`
    if (patch.w !== undefined) tileRef.current.style.width  = `${Math.max(MIN_SIZE, patch.w) * scale}px`
    if (patch.h !== undefined) tileRef.current.style.height = `${Math.max(MIN_SIZE, patch.h) * scale}px`
  }

  const startDrag = useCallback((e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      mode,
      startX: e.clientX, startY: e.clientY,
      origX: mesa.pos_x || 0, origY: mesa.pos_y || 0,
      origW: mesa.ancho || 80, origH: mesa.alto || 80,
      moved: false,
      transient: null,
    }

    const onMove = (ev) => {
      const d = dragRef.current
      if (!d.mode) return
      const dx = (ev.clientX - d.startX) / scale
      const dy = (ev.clientY - d.startY) / scale
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true

      if (d.mode === 'move') {
        const x = snapVal(d.origX + dx)
        const y = snapVal(d.origY + dy)
        d.transient = { x, y }
        applyTransient({ x, y })
      } else if (d.mode === 'resize') {
        const w = snapVal(d.origW + dx)
        const h = snapVal(d.origH + dy)
        d.transient = { w, h }
        applyTransient({ w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) })
      }
    }

    const onUp = () => {
      const d = dragRef.current
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!d.moved) {
        // click puro → seleccionar
        onSelect?.(mesa)
        dragRef.current.mode = null
        return
      }
      if (d.mode === 'move' && d.transient) {
        onCommitMove?.(Math.max(0, d.transient.x), Math.max(0, d.transient.y))
      } else if (d.mode === 'resize' && d.transient) {
        onCommitResize?.(
          Math.max(MIN_SIZE, d.transient.w),
          Math.max(MIN_SIZE, d.transient.h)
        )
      }
      dragRef.current.mode = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [mesa, scale, snap, onSelect, onCommitMove, onCommitResize])

  return (
    <div
      ref={tileRef}
      onMouseDown={e => startDrag(e, 'move')}
      onDoubleClick={() => onEdit?.(mesa)}
      className="absolute flex flex-col items-center justify-center font-bold select-none transition-shadow"
      style={{
        left: (mesa.pos_x || 0) * scale,
        top:  (mesa.pos_y || 0) * scale,
        width: (mesa.ancho || 80) * scale,
        height: (mesa.alto || 80) * scale,
        background: cfg.bg,
        color: cfg.textLight,
        borderRadius: isCircle ? '50%' : '12px',
        boxShadow: selected
          ? `0 0 0 3px var(--accent-lift), 0 8px 24px rgba(0,0,0,0.3)`
          : '0 4px 12px rgba(0,0,0,0.15)',
        cursor: 'move',
        zIndex: selected ? 10 : 1,
      }}
    >
      <span style={{ fontSize: Math.max(14, Math.min(mesa.ancho, mesa.alto) * scale * 0.35), lineHeight: 1 }}>
        {mesa.numero}
      </span>
      <span className="text-[9px] mt-0.5 opacity-70">
        {mesa.ancho}×{mesa.alto}
      </span>

      {/* Handle resize esquina inferior derecha */}
      <div
        onMouseDown={e => startDrag(e, 'resize')}
        className="absolute"
        style={{
          right: 0, bottom: 0,
          width: HANDLE_SIZE, height: HANDLE_SIZE,
          cursor: 'nwse-resize',
          background: 'rgba(255,255,255,0.6)',
          borderBottomRightRadius: isCircle ? 0 : '12px',
          clipPath: isCircle ? 'none' : 'polygon(100% 0, 100% 100%, 0 100%)',
        }}
      />
    </div>
  )
}
