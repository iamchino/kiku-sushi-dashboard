import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

export function KpiCard({ label, valor, delta, loading }) {
  const positivo = delta > 0
  const neutro = delta === 0 || delta === null

  return (
    <div
      className="rounded-xl p-5 transition-all duration-150 hover:-translate-y-0.5"
      style={{ background: '#1c1c1f', border: '1px solid #2a2a2e' }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#52525b' }}>{label}</p>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-7 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      ) : (
        <>
          <div className="mt-2.5 text-2xl font-bold text-white tracking-tight">
            {valor}
          </div>
          <div className={clsx('mt-1.5 flex items-center gap-1 text-xs font-medium', {
            'text-emerald-400': positivo,
            'text-red-400': !positivo && !neutro,
            'text-zinc-600': neutro,
          })}>
            {neutro ? <Minus size={12} /> : positivo ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta !== null ? `${Math.abs(delta)}% vs ayer` : 'Sin datos de ayer'}
          </div>
        </>
      )}
    </div>
  )
}