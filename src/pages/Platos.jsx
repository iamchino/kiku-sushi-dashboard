import { useState, useEffect, useMemo } from 'react'
import { ConciergeBell, ChefHat, CheckCircle2, Clock, Flame, WifiOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePedidos, getTipoPedido } from '../hooks/usePedidos'

// ── Timer: re-render cada 10s para refrescar tiempos ─────────────────────────
function useTick() {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const id = setInterval(update, 10000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Elapsed({ createdAt, now }) {
  const mins = now > 0
    ? Math.floor((now - new Date(createdAt).getTime()) / 60000)
    : 0
  const urgencia = mins >= 20 ? 'critica' : mins >= 10 ? 'alta' : 'normal'

  const colors = {
    normal:  { color: 'var(--text-xmuted)', bg: 'transparent' },
    alta:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
    critica: { color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  }[urgencia]

  return (
    <span
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${urgencia === 'critica' ? 'animate-pulse' : ''}`}
      style={{ color: colors.color, background: colors.bg }}
    >
      <Clock size={11} />
      {mins === 0 ? 'Ahora' : `${mins} min`}
    </span>
  )
}

function PlatoCard({ pedido, listo, onServir, busy }) {
  const now = useTick()
  const shortId = pedido.id.slice(-4).toUpperCase()
  const items = pedido.pedido_items || []
  const esMesa = getTipoPedido(pedido) === 'salon'

  return (
    <div
      className="rounded-2xl flex flex-col gap-3"
      style={{
        background: listo ? 'rgba(52,211,153,0.07)' : 'rgba(79,142,247,0.05)',
        border: `2px solid ${listo ? 'rgba(52,211,153,0.4)' : 'rgba(79,142,247,0.25)'}`,
        padding: '16px',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-xmuted)' }}>#{shortId}</span>
          {pedido.mesa
            ? <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Mesa {pedido.mesa}</span>
            : <span className="text-sm font-semibold capitalize" style={{ color: '#4f8ef7' }}>{pedido.canal}</span>
          }
        </div>
        <Elapsed createdAt={pedido.created_at} now={now} />
      </div>

      <div className="space-y-1.5 flex-1">
        {items.map(item => (
          <div key={item.id} className="flex items-baseline gap-2.5">
            <span
              className="text-lg font-black leading-none flex-shrink-0 w-7 text-right"
              style={{ color: listo ? '#34d399' : '#4f8ef7' }}
            >
              {item.cantidad}×
            </span>
            <span className="text-[15px] font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
              {item.nombre}
              {item.notas && (
                <span className="block text-xs italic" style={{ color: '#fbbf24' }}>📝 {item.notas}</span>
              )}
            </span>
          </div>
        ))}
        {pedido.notas && (
          <p className="text-xs italic pt-2 mt-1" style={{ color: '#fbbf24', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
            📝 {pedido.notas}
          </p>
        )}
      </div>

      {listo && (
        <button
          onClick={() => onServir(pedido)}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl font-bold text-white transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #34d399, #059669)',
            padding: '14px 20px',
            fontSize: '15px',
            letterSpacing: '0.04em',
            boxShadow: '0 4px 20px rgba(52,211,153,0.25)',
          }}
        >
          <CheckCircle2 size={20} />
          {esMesa ? 'SERVIDO EN MESA' : 'ENTREGADO'}
        </button>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, label, color, count }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <Icon size={17} style={{ color }} />
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color }}>{label}</span>
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {count}
      </span>
    </div>
  )
}

// ── Página: estado de platos para el mozo ─────────────────────────────────────
export default function PlatosPage() {
  const { grouped, loading, error, avanzarEstado, refetch } = usePedidos()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const onOnline = () => setConnected(true)
    const onOffline = () => setConnected(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Listos sin servir todavía.
  const listos = useMemo(
    () => (grouped.listo || []).filter(p => !p.servido_at),
    [grouped]
  )
  const enPreparacion = useMemo(
    () => [...(grouped.preparando || []), ...(grouped.pendiente || [])],
    [grouped]
  )

  const servir = async (pedido) => {
    setBusyId(pedido.id)
    setActionError(null)
    try {
      if (getTipoPedido(pedido) === 'salon') {
        // Pedido de mesa: marcar servido SIN cerrar el pedido
        // (la mesa se cierra al cobrar, desde Mesas).
        const { error: updErr } = await supabase
          .from('pedidos')
          .update({ servido_at: new Date().toISOString() })
          .eq('id', pedido.id)
        if (updErr) throw updErr
        refetch?.()
      } else {
        // Llevar / delivery: entregar cierra el pedido.
        const err = await avanzarEstado(pedido.id, 'listo')
        if (err) throw err
      }
    } catch (e) {
      setActionError(e.message || 'No se pudo actualizar el pedido')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col min-h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
        style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <ConciergeBell size={20} style={{ color: 'var(--accent-lift)' }} />
          <h1 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Platos</h1>
        </div>
        <div className="flex items-center gap-2">
          {!connected && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              <WifiOff size={12} /> Sin conexión
            </span>
          )}
          {listos.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full animate-pulse"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              {listos.length} para servir
            </span>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <div className="px-4 py-2 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          ⚠️ {actionError || error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1 py-20">
          <div className="w-7 h-7 border-2 border-[var(--accent-lift)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-6">
          {/* Listos para servir — prioridad */}
          <section className="flex flex-col gap-3 flex-1 min-w-0">
            <SectionHeader icon={CheckCircle2} label="Listos para servir" color="#34d399" count={listos.length} />
            {listos.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 opacity-25">
                <ConciergeBell size={36} style={{ color: '#34d399' }} />
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#34d399' }}>
                  Nada para servir
                </p>
              </div>
            ) : (
              listos.map(p => (
                <PlatoCard key={p.id} pedido={p} listo onServir={servir} busy={busyId === p.id} />
              ))
            )}
          </section>

          <div className="hidden lg:block flex-shrink-0 w-px self-stretch" style={{ background: 'var(--border)' }} />

          {/* En preparación — solo lectura */}
          <section className="flex flex-col gap-3 flex-1 min-w-0">
            <SectionHeader icon={ChefHat} label="En preparación" color="#4f8ef7" count={enPreparacion.length} />
            {enPreparacion.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 opacity-25">
                <Flame size={36} style={{ color: '#4f8ef7' }} />
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#4f8ef7' }}>
                  Cocina sin pendientes
                </p>
              </div>
            ) : (
              enPreparacion.map(p => (
                <PlatoCard key={p.id} pedido={p} listo={false} onServir={servir} busy={false} />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  )
}
