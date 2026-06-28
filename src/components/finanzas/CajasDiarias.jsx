import { useState, useEffect, useCallback } from 'react'
import { Wallet, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtMoney, fmtFecha } from '../../lib/finanzas'

export default function CajasDiarias({ desde, hasta }) {
  const [turnos, setTurnos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchTurnos = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase
        .from('caja_turnos')
        .select('*')
        .eq('estado', 'cerrado')
        .gte('business_date', desde).lte('business_date', hasta)
        .order('business_date', { ascending: false })
        .order('cierre_at', { ascending: false })
      if (e) throw e
      setTurnos(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => { fetchTurnos() }, [fetchTurnos])

  const totalDeposito = turnos.reduce((s, t) => s + Number(t.deposito_monto || 0), 0)
  const totalDif      = turnos.reduce((s, t) => s + Number(t.diferencia || 0), 0)
  const cuadran       = turnos.filter(t => Math.abs(Number(t.diferencia || 0)) < 1).length

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Cierres</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{turnos.length}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{cuadran} cuadran</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Depósitos</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalDeposito)}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-xmuted)' }}>Diferencia acum.</p>
          <p className="text-xl font-bold mt-1" style={{ color: Math.abs(totalDif) < 1 ? '#10b981' : '#f87171' }}>
            {totalDif > 0 ? '+' : ''}{fmtMoney(totalDif)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Historial de cierres</p>
        <button onClick={fetchTurnos} disabled={loading}
          className="p-2 rounded-lg disabled:opacity-50 transition-all" style={{ border: '1px solid var(--border)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : turnos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <Wallet size={22} style={{ color: 'var(--accent-lift)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No hay cierres de caja en el período</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {turnos.map(t => {
            const dif = Number(t.diferencia || 0)
            const ok = Math.abs(dif) < 1
            return (
              <div key={t.id} className="rounded-xl p-4"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{fmtFecha(t.business_date)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.caja_nombre}</span>
                  </div>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                    style={ok ? { background: 'rgba(16,185,129,0.12)', color: '#10b981' } : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
                    {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                    {ok ? 'Cuadra' : `${dif > 0 ? 'Sobra ' : 'Falta '}${fmtMoney(Math.abs(dif))}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Apertura', value: fmtMoney(t.apertura_monto) },
                    { label: 'Esperado', value: fmtMoney(t.efectivo_esperado) },
                    { label: 'Contado', value: fmtMoney(t.cierre_monto) },
                    { label: 'Depósito', value: fmtMoney(t.deposito_monto) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-xmuted)' }}>{label}</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{value}</p>
                    </div>
                  ))}
                </div>
                {t.notas_cierre && (
                  <p className="text-[11px] mt-2.5 pt-2.5" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>{t.notas_cierre}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
