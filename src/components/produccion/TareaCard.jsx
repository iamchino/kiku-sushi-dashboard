import { CheckCircle2, RotateCcw, AlertTriangle, Trash2 } from 'lucide-react'

const ESTADO_CONFIG = {
  pendiente:   { color: 'var(--accent-lift)', border: 'rgba(var(--accent-rgb),0.3)',  bg: 'rgba(var(--accent-rgb),0.05)', label: 'Pendiente' },
  en_progreso: { color: '#3b82f6', border: 'rgba(59,130,246,0.3)',  bg: 'rgba(59,130,246,0.05)', label: 'En progreso' },
  completada:  { color: '#22c55e', border: 'rgba(34,197,94,0.25)',  bg: 'rgba(34,197,94,0.04)',  label: 'Completada' },
}

export default function TareaCard({ tarea, receta, stockProduccion, isAdmin, onCompletar, onRevertir, onDelete }) {
  const cfg = ESTADO_CONFIG[tarea.estado] || ESTADO_CONFIG.pendiente
  const completada = tarea.estado === 'completada'

  const fechaCompletada = tarea.completada_at
    ? new Date(tarea.completada_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  const tieneReceta = !!tarea.receta_id
  const sinIngredientes = tieneReceta && receta && (!receta.receta_ingredientes || receta.receta_ingredientes.length === 0)
  const detalleConsumos = Array.isArray(tarea.descuento_detalle)
    ? tarea.descuento_detalle
    : tarea.descuento_detalle?.consumos || []
  const detalleProduccion = Array.isArray(tarea.descuento_detalle)
    ? null
    : tarea.descuento_detalle?.produccion || null
  const unidadObjetivo = stockProduccion?.unidad || 'porc.'

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        opacity: completada ? 0.75 : 1,
      }}
    >
      {/* Header: Nombre + estado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-[15px] leading-snug"
            style={{
              color: completada ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: completada ? 'line-through' : 'none',
            }}
          >
            {tarea.descripcion}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Cantidad objetivo */}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              Objetivo: {parseFloat(tarea.cantidad)} {unidadObjetivo}
            </span>
            {/* Vinculada o no */}
            {tieneReceta ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent-lift)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                🔗 {receta?.nombre || 'Receta'}
              </span>
            ) : (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-xmuted)' }}>
                📝 Sin receta
              </span>
            )}
            {sinIngredientes && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1"
                style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={9} /> Sin ingredientes
              </span>
            )}
          </div>
        </div>

        {/* Admin: delete button */}
        {isAdmin && !completada && (
          <button onClick={() => onDelete(tarea)}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ color: 'var(--text-xmuted)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xmuted)'}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Resultado (si completada) */}
      {completada && (
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
            <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
              {tarea.completada_por}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-xmuted)' }}>
              {fechaCompletada}
            </span>
            <span className="text-xs font-medium ml-auto tabular-nums" style={{ color: 'var(--text-muted)' }}>
              Hizo: {parseFloat(tarea.cantidad_real)} {unidadObjetivo}
            </span>
          </div>
          {/* Detalles de descuento */}
          {(detalleProduccion || detalleConsumos.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {detalleProduccion && (
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(34,197,94,0.06)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.12)' }}>
                  +{parseFloat(detalleProduccion.cantidad).toFixed(2)} {detalleProduccion.unidad} {detalleProduccion.nombre}
                </span>
              )}
              {detalleConsumos.map((d, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.12)' }}>
                  -{parseFloat(d.cantidad).toFixed(2)} {d.unidad} {d.nombre}
                </span>
              ))}
            </div>
          )}
          {tarea.notas_equipo && (
            <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
              📝 {tarea.notas_equipo}
            </p>
          )}
          {/* Admin: revertir */}
          {isAdmin && (
            <button onClick={() => onRevertir(tarea)}
              className="flex items-center gap-1.5 text-[11px] font-medium mt-1 px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}>
              <RotateCcw size={11} /> Revertir
            </button>
          )}
        </div>
      )}

      {/* Botón COMPLETAR (solo si no completada y no es admin-only view) */}
      {!completada && (
        <button
          onClick={() => onCompletar(tarea)}
          className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl font-bold text-white transition-all active:scale-[0.97] hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            padding: '14px 20px',
            fontSize: '14px',
            letterSpacing: '0.02em',
            boxShadow: '0 4px 16px rgba(34,197,94,0.25)',
          }}
        >
          <CheckCircle2 size={18} />
          COMPLETAR
        </button>
      )}
    </div>
  )
}
