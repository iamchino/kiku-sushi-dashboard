// ── Barra de progreso del día ─────────────────────────────────────────────────
export default function ProgresoBar({ stats }) {
  const { total, completadas, porcentaje } = stats
  if (total === 0) return null

  const allDone = completadas === total

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Progreso del día
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: allDone ? '#22c55e' : 'var(--accent)' }}>
          {completadas}/{total} {allDone ? '✅' : ''}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${porcentaje}%`,
            background: allDone
              ? 'linear-gradient(90deg, #22c55e, #16a34a)'
              : 'linear-gradient(90deg, #7c3aed, #a855f7)',
            boxShadow: allDone
              ? '0 0 12px rgba(34,197,94,0.4)'
              : '0 0 12px rgba(124,58,237,0.3)',
          }}
        />
      </div>
    </div>
  )
}
