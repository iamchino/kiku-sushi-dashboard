import { useState, useEffect, useMemo } from 'react'
import { X, Percent, DollarSign, Loader2, TrendingUp, AlertTriangle, Check, ArrowRight } from 'lucide-react'
import { usePreciosMasivos, SECCIONES, REDONDEOS } from '../../hooks/usePreciosMasivos'

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR')

const planInicial = () =>
  SECCIONES.reduce((acc, s) => {
    acc[s.key] = { enabled: false, modo: 'porcentaje', valor: '' }
    return acc
  }, {})

export default function AjustePreciosModal({ open, onClose, onAplicado }) {
  const { snapshot, loading, error, cargar, previewSeccion, aplicar } = usePreciosMasivos()

  const [planes, setPlanes]         = useState(planInicial)
  const [redondeo, setRedondeo]     = useState('50')
  const [soloActivos, setSoloActivos] = useState(false) // false = incluye ocultos (todos)
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando]   = useState(false)
  const [resultado, setResultado]   = useState(null)

  // Cargar precios al abrir
  useEffect(() => {
    if (open) {
      cargar()
      setPlanes(planInicial())
      setConfirmando(false)
      setResultado(null)
    }
  }, [open, cargar])

  // Previews por sección (en vivo)
  const previews = useMemo(() => {
    if (!snapshot) return {}
    const out = {}
    SECCIONES.forEach(s => {
      const p = planes[s.key]
      const valorNum = parseFloat(p.valor)
      if (p.enabled && !Number.isNaN(valorNum) && valorNum !== 0) {
        out[s.key] = previewSeccion(s.key, { modo: p.modo, valor: valorNum, redondeo, soloActivos })
      } else {
        out[s.key] = { afectados: 0, ejemplos: [], cambios: [] }
      }
    })
    return out
  }, [snapshot, planes, redondeo, soloActivos, previewSeccion])

  const totalAfectados = useMemo(
    () => Object.values(previews).reduce((acc, p) => acc + (p?.afectados || 0), 0),
    [previews]
  )

  const planesActivos = useMemo(
    () => SECCIONES
      .filter(s => {
        const p = planes[s.key]
        const v = parseFloat(p.valor)
        return p.enabled && !Number.isNaN(v) && v !== 0
      })
      .map(s => ({ seccionKey: s.key, modo: planes[s.key].modo, valor: parseFloat(planes[s.key].valor) })),
    [planes]
  )

  if (!open) return null

  const setPlan = (key, patch) =>
    setPlanes(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const handleAplicar = async () => {
    setAplicando(true)
    const res = await aplicar(planesActivos, { redondeo, soloActivos })
    setAplicando(false)
    setResultado(res)
    setConfirmando(false)
    if (res.ok && res.total > 0) {
      onAplicado?.(res)
    }
  }

  const countSeccion = (key) => {
    if (!snapshot) return 0
    const rows = snapshot[key] || []
    return soloActivos ? rows.filter(r => r.activo).length : rows.length
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-xl rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.35)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.12)' }}>
              <TrendingUp size={17} style={{ color: 'var(--accent-lift)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Ajuste masivo de precios</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Subí los precios por sección, por % o por monto</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="animate-spin" /> Cargando precios…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* Resultado final */}
          {resultado && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
              style={{
                background: resultado.ok ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${resultado.ok ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: 'var(--text-primary)',
              }}>
              {resultado.ok ? <Check size={16} className="mt-0.5 shrink-0" style={{ color: '#34d399' }} /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#f87171' }} />}
              <span>
                {resultado.total === 0
                  ? 'No hubo precios para actualizar.'
                  : resultado.ok
                    ? `Listo. Se actualizaron ${resultado.total} precios.`
                    : `Se actualizaron ${resultado.total - resultado.fallidos} de ${resultado.total}. ${resultado.fallidos} fallaron: ${resultado.error || ''}`}
              </span>
            </div>
          )}

          {!loading && !error && snapshot && !resultado && (
            <>
              {/* Filas por sección */}
              {SECCIONES.map(s => {
                const p = planes[s.key]
                const prev = previews[s.key]
                const total = countSeccion(s.key)
                return (
                  <div key={s.key} className="rounded-xl p-4"
                    style={{
                      background: p.enabled ? 'var(--bg-input)' : 'transparent',
                      border: `1px solid ${p.enabled ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border)'}`,
                      transition: 'all .15s',
                    }}>
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => setPlan(s.key, { enabled: !p.enabled })}
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: p.enabled ? 'var(--accent)' : 'transparent',
                          border: `1.5px solid ${p.enabled ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                        {p.enabled && <Check size={13} className="text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.label}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{total} productos</p>
                      </div>

                      {/* Toggle %/monto */}
                      <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)', opacity: p.enabled ? 1 : 0.4 }}>
                        {[
                          { m: 'porcentaje', icon: Percent },
                          { m: 'monto',      icon: DollarSign },
                        ].map(({ m, icon: Ic }) => (
                          <button key={m}
                            disabled={!p.enabled}
                            onClick={() => setPlan(s.key, { modo: m })}
                            className="w-8 h-8 flex items-center justify-center"
                            style={{
                              background: p.modo === m ? 'var(--accent)' : 'var(--bg-card)',
                              color: p.modo === m ? '#fff' : 'var(--text-muted)',
                            }}>
                            <Ic size={13} />
                          </button>
                        ))}
                      </div>

                      {/* Valor */}
                      <input
                        type="number"
                        inputMode="decimal"
                        disabled={!p.enabled}
                        value={p.valor}
                        onChange={e => setPlan(s.key, { valor: e.target.value })}
                        placeholder={p.modo === 'porcentaje' ? '10' : '500'}
                        className="w-20 px-2.5 py-1.5 rounded-lg text-sm text-right outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: p.enabled ? 1 : 0.4 }}
                      />
                    </div>

                    {/* Preview de la sección */}
                    {p.enabled && prev?.afectados > 0 && (
                      <div className="mt-3 pl-8 space-y-1">
                        <p className="text-xs font-medium" style={{ color: 'var(--accent-lift)' }}>
                          {prev.afectados} precios cambian
                        </p>
                        {prev.ejemplos.map((ej, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span className="truncate max-w-[180px]">{ej.nombre}</span>
                            <span className="ml-auto flex items-center gap-1.5 shrink-0">
                              <span style={{ textDecoration: 'line-through' }}>{fmt(ej.antes)}</span>
                              <ArrowRight size={11} />
                              <span className="font-semibold" style={{ color: '#34d399' }}>{fmt(ej.despues)}</span>
                            </span>
                          </div>
                        ))}
                        {prev.afectados > prev.ejemplos.length && (
                          <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
                            y {prev.afectados - prev.ejemplos.length} más…
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Opciones globales */}
              <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Redondeo</span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {REDONDEOS.map(r => (
                      <button key={r.key}
                        onClick={() => setRedondeo(r.key)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={redondeo === r.key
                          ? { background: 'var(--accent)', color: '#fff' }
                          : { background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Incluir productos ocultos</span>
                  <button
                    onClick={() => setSoloActivos(v => !v)}
                    className="relative w-11 h-6 rounded-full transition-colors"
                    style={{ background: !soloActivos ? 'var(--accent)' : 'var(--border)' }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                      style={{ left: !soloActivos ? '22px' : '2px' }} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && snapshot && !resultado && (
          <div className="px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            {!confirmando ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {totalAfectados > 0
                    ? <>Se actualizarán <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{totalAfectados}</span> precios</>
                    : 'Activá una sección y poné un valor'}
                </span>
                <button
                  onClick={() => setConfirmando(true)}
                  disabled={totalAfectados === 0}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
                  Revisar y aplicar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
                  <span>Vas a cambiar <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{totalAfectados}</span> precios. Esta acción no se puede deshacer automáticamente.</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmando(false)}
                    disabled={aplicando}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    Volver
                  </button>
                  <button
                    onClick={handleAplicar}
                    disabled={aplicando}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
                    {aplicando ? <><Loader2 size={15} className="animate-spin" /> Aplicando…</> : <>Confirmar aumento</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer cuando ya hay resultado */}
        {resultado && (
          <div className="px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
