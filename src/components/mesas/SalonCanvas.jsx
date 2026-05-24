import { useEffect, useRef, useState } from 'react'
import { Grid3X3, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import MesaTile from './MesaTile'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1

/**
 * Canvas que muestra el plano del salón con mesas posicionadas en absoluto.
 * Soporta zoom in/out y reset.
 * Click sobre mesa → onSelectMesa(mesa)
 */
export default function SalonCanvas({
  salon,
  mesas = [],
  selectedMesaId = null,
  onSelectMesa,
  loading = false,
  emptyHint = 'Aún no hay mesas en este salón.',
  renderMesa, // override opcional, recibe (mesa, props) → ReactNode (para modo edición)
}) {
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef(null)

  // Reset zoom al cambiar de salón
  useEffect(() => { setZoom(1) }, [salon?.id])

  const canvasW = (salon?.ancho || 1200) * zoom
  const canvasH = (salon?.alto  || 800)  * zoom

  return (
    <div className="relative flex-1 overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar zoom */}
      <div
        className="absolute top-3 left-3 z-20 flex items-center gap-0.5 rounded-lg px-1 py-1"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}
      >
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          className="w-7 h-7 rounded flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="Alejar"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-xs font-medium px-2" style={{ color: 'var(--text-secondary)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          className="w-7 h-7 rounded flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="Acercar"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="w-7 h-7 rounded flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title="Tamaño real"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* Área scrollable */}
      <div ref={containerRef} className="absolute inset-0 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--accent-lift)', borderTopColor: 'transparent' }} />
          </div>
        ) : mesas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <Grid3X3 size={48} style={{ color: 'var(--text-xmuted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{emptyHint}</p>
          </div>
        ) : (
          <div
            className="relative"
            style={{
              width: canvasW,
              height: canvasH,
              minWidth: '100%',
              minHeight: '100%',
              backgroundImage: `radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)`,
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            }}
          >
            {mesas.map(m => (
              renderMesa
                ? renderMesa(m, { selected: m.id === selectedMesaId, onClick: onSelectMesa, scale: zoom })
                : <MesaTile
                    key={m.id}
                    mesa={m}
                    selected={m.id === selectedMesaId}
                    onClick={onSelectMesa}
                    scale={zoom}
                  />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
