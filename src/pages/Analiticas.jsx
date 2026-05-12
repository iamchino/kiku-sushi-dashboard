import { useState } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  RefreshCw, TrendingUp, TrendingDown, ShoppingBag,
  XCircle, Clock, BarChart2, Calendar, AlertTriangle
} from 'lucide-react'
import { useAnaliticas, PRESETS, CANAL_CFG } from '../hooks/useAnaliticas'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Shared tooltip style ──────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 },
  cursor: { fill: 'rgba(124,58,237,0.05)' },
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ v }) {
  if (v === null || v === undefined) return null
  const up = v >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className="flex items-center gap-1 text-xs font-semibold mt-0.5"
      style={{ color: up ? '#34d399' : '#f87171' }}>
      <Icon size={11} /> {up ? '+' : ''}{v}% vs ant.
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, delta, icon: Icon, color }) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15` }}>
          <Icon size={13} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub   && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      {delta !== undefined && <Delta v={delta} />}
    </div>
  )
}

// ── Area chart — ventas por día ───────────────────────────────────────────────
function VentasChart({ data, loading, dias }) {
  if (loading) return <div className="skeleton h-48 rounded-xl" />
  const fmt = dias <= 7
    ? d => format(parseISO(d), 'EEE', { locale: es })
    : dias <= 31
      ? d => format(parseISO(d), 'd MMM', { locale: es })
      : d => format(parseISO(d), 'MMM', { locale: es })

  const chartData = data.map(d => ({ ...d, label: fmt(d.fecha) }))

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>Ventas por día</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-xmuted)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-xmuted)' }} axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v) => [`$${v.toLocaleString('es-AR')}`, 'Ventas']}
            labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
          />
          <Area type="monotone" dataKey="ventas" stroke="#7c3aed" strokeWidth={2}
            fill="url(#gVentas)" dot={false} activeDot={{ r: 4, fill: '#7c3aed' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Donut por canal (ventas $) ────────────────────────────────────────────────
function CanalDonut({ porCanal, loading }) {
  if (loading) return <div className="skeleton h-48 rounded-xl" />
  const data  = porCanal.filter(c => c.ventas > 0)
  const total = data.reduce((s, c) => s + c.ventas, 0)

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>Ventas por canal</p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm" style={{ color: 'var(--text-xmuted)' }}>Sin datos</div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={data} dataKey="ventas" cx="50%" cy="50%"
                  innerRadius={42} outerRadius={64} paddingAngle={2}>
                  {data.map(c => (
                    <Cell key={c.canal} fill={CANAL_CFG[c.canal]?.color || '#71717a'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE.contentStyle}
                  formatter={(v, _, p) => [`$${v.toLocaleString('es-AR')}`, CANAL_CFG[p.payload.canal]?.label || p.payload.canal]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>${(total/1000).toFixed(0)}k</p>
                <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>total</p>
              </div>
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            {data.map(c => {
              const cfg = CANAL_CFG[c.canal] || CANAL_CFG.otro
              return (
                <div key={c.canal} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{cfg.label}</span>
                  </span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    ${c.ventas.toLocaleString('es-AR')}
                    <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({Math.round(c.ventas / total * 100)}%)</span>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Top productos — barras horizontales CSS ───────────────────────────────────
function TopProductos({ topProductos, loading }) {
  if (loading) return <div className="skeleton h-64 rounded-xl" />
  const max = topProductos[0]?.unidades || 1

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>Top productos</p>
      {topProductos.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm" style={{ color: 'var(--text-xmuted)' }}>Sin datos</div>
      ) : (
        <div className="space-y-3">
          {topProductos.map((p, i) => (
            <div key={p.nombre} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-bold flex-shrink-0"
                style={{ color: i < 3 ? '#7c3aed' : 'var(--text-xmuted)' }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{p.nombre}</p>
                  <p className="text-xs font-bold flex-shrink-0 ml-2" style={{ color: '#7c3aed' }}>
                    {p.unidades} u
                  </p>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(p.unidades / max) * 100}%`,
                      background: i < 3
                        ? 'linear-gradient(90deg, #7c3aed, #5b21b6)'
                        : 'var(--border)',
                    }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tabla por canal ───────────────────────────────────────────────────────────
function CanalTable({ porCanal, loading }) {
  if (loading) return <div className="skeleton h-32 rounded-xl" />

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
            {['Canal','Pedidos','Ventas','Ticket prom.','Cancelaciones'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {porCanal.map((c, i) => {
            const cfg = CANAL_CFG[c.canal] || CANAL_CFG.otro
            return (
              <tr key={c.canal}
                style={{ background: 'var(--bg-card)', borderBottom: i < porCanal.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                    <span className="font-medium text-xs" style={{ color: 'var(--text-primary)' }}>{cfg.label}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.pedidos}</td>
                <td className="px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>${c.ventas.toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>${Math.round(c.ticket).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3">
                  {c.cancelados > 0
                    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>{c.cancelados}</span>
                    : <span className="text-xs" style={{ color: 'var(--text-xmuted)' }}>—</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Fugas insight card ────────────────────────────────────────────────────────
function Insight({ icon: Icon, color, title, value, sub }) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
      <Icon size={16} style={{ color }} className="mb-2" />
      <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: `${color}99` }}>{title}</p>
      <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function AnaliticasPage() {
  const [customMode, setCustomMode] = useState(false)
  const { data, loading, error, desde, hasta, preset, setDesde, setHasta, applyPreset, refetch } = useAnaliticas()

  const dias = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1

  const mejorCanal = data?.porCanal?.filter(c => c.pedidos > 0).sort((a, b) => b.ticket - a.ticket)[0]
  const peorCanal  = data?.porCanal?.filter(c => c.pedidos > 0).sort((a, b) => a.ticket - b.ticket)[0]
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Analíticas & Histórico</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {desde} → {hasta} · {dias} {dias === 1 ? 'día' : 'días'}
          </p>
        </div>
        <button onClick={refetch} disabled={loading}
          className="p-2 rounded-lg disabled:opacity-50 transition-all"
          style={{ border: '1px solid var(--border)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Date selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setCustomMode(false); applyPreset(p) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={preset === p.label && !customMode
              ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }
              : { color: 'var(--text-muted)', border: '1px solid var(--border)' }
            }>
            {p.label}
          </button>
        ))}
        <button onClick={() => setCustomMode(c => !c)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={customMode
            ? { background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.3)' }
            : { color: 'var(--text-muted)', border: '1px solid var(--border)' }
          }>
          <Calendar size={11} /> Personalizado
        </button>

        {customMode && (
          <div className="flex items-center gap-2">
            <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setCustomMode(true) }}
              className="px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <span style={{ color: 'var(--text-xmuted)' }}>→</span>
            <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setCustomMode(true) }}
              className="px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ventas totales"   icon={TrendingUp}   color="#7c3aed"
          value={loading ? '—' : `$${(data?.ventas || 0).toLocaleString('es-AR')}`}
          delta={data?.dVentas} />
        <KpiCard label="Ticket promedio"  icon={BarChart2}    color="#4f8ef7"
          value={loading ? '—' : `$${Math.round(data?.ticket || 0).toLocaleString('es-AR')}`} />
        <KpiCard label="Pedidos"          icon={ShoppingBag}  color="#34d399"
          value={loading ? '—' : data?.pedidosCount ?? 0}
          delta={data?.dPedidos} />
        <KpiCard label="Cancelaciones"    icon={XCircle}      color="#f87171"
          value={loading ? '—' : data?.cancelados ?? 0}
          sub={data?.canceladosValor > 0 ? `$${data.canceladosValor.toLocaleString('es-AR')} perdidos` : null} />
      </div>

      {/* Area chart */}
      {!loading && data?.porDia && (
        <VentasChart data={data.porDia} loading={loading} dias={dias} />
      )}
      {loading && <div className="skeleton h-48 rounded-xl" />}

      {/* Donut + Top productos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CanalDonut  porCanal={data?.porCanal || []} loading={loading} />
        <TopProductos topProductos={data?.topProductos || []} loading={loading} />
      </div>

      {/* Tabla por canal */}
      <div>
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
          Desglose por canal
        </p>
        {loading
          ? <div className="skeleton h-40 rounded-xl" />
          : <CanalTable porCanal={data?.porCanal || []} loading={loading} />
        }
      </div>

      {/* Fugas & Insights */}
      {!loading && data && (
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
            🚨 Análisis de fugas
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Insight icon={XCircle} color="#f87171" title="Cancelaciones"
              value={`${data.cancelados} pedidos`}
              sub={data.canceladosValor > 0 ? `$${data.canceladosValor.toLocaleString('es-AR')} perdidos` : 'Sin valor perdido'} />

            <Insight icon={TrendingUp} color="#34d399" title="Canal más rentable"
              value={mejorCanal ? (CANAL_CFG[mejorCanal.canal]?.label || mejorCanal.canal) : '—'}
              sub={mejorCanal ? `Ticket: $${Math.round(mejorCanal.ticket).toLocaleString('es-AR')}` : ''} />

            <Insight icon={TrendingDown} color="#fbbf24" title="Canal menor ticket"
              value={peorCanal && peorCanal !== mejorCanal ? (CANAL_CFG[peorCanal.canal]?.label || peorCanal.canal) : '—'}
              sub={peorCanal ? `Ticket: $${Math.round(peorCanal.ticket).toLocaleString('es-AR')}` : ''} />

            <Insight icon={Clock} color="#4f8ef7" title="Hora pico"
              value={data.horaPico}
              sub="Franja con más pedidos" />
          </div>
        </div>
      )}
    </div>
  )
}
