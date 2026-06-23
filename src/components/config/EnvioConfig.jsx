import { useEffect, useState } from 'react'
import {
  Truck, Save, Loader2, CheckCircle2, AlertTriangle,
  Plus, Trash2, MapPin, X,
} from 'lucide-react'
import {
  fetchBaseEnvio, fetchZonas, guardarBaseEnvio,
  crearZona, actualizarZona, eliminarZona, costoDeZona,
} from '../../lib/envio'

const FIELD_STYLE = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`

/**
 * Configuración del costo de envío:
 *  - Base (costo por defecto, ej. $3500)
 *  - Zonas con su recargo sobre la base (Centro +0, Norte +1500, etc.)
 * La web pública muestra la base; en el dashboard se elige la zona por pedido.
 */
export default function EnvioConfig() {
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState('')
  const [zonas, setZonas] = useState([])
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [saveError, setSaveError] = useState(null)

  // alta de zona
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRecargo, setNuevoRecargo] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const [b, z] = await Promise.all([fetchBaseEnvio(), fetchZonas({ soloActivas: false })])
    setBase(String(b))
    setZonas(z)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const handleGuardarBase = async () => {
    setSaveState('saving'); setSaveError(null)
    const { error } = await guardarBaseEnvio(base)
    if (error) {
      setSaveState('error')
      setSaveError(error.message || 'No se pudo guardar la base.')
      return
    }
    setSaveState('ok')
    setTimeout(() => setSaveState('idle'), 1800)
  }

  const handleAgregarZona = async () => {
    if (!nuevoNombre.trim()) { setSaveError('Poné un nombre para la zona.'); return }
    setAddBusy(true); setSaveError(null)
    const { error } = await crearZona({
      nombre: nuevoNombre,
      recargo: nuevoRecargo,
      orden: zonas.length,
    })
    setAddBusy(false)
    if (error) { setSaveError(error.message || 'No se pudo crear la zona.'); return }
    setNuevoNombre(''); setNuevoRecargo('')
    cargar()
  }

  const handleUpdateZona = async (id, patch) => {
    setZonas(zs => zs.map(z => z.id === id ? { ...z, ...patch } : z))
  }

  const handleBlurZona = async (zona) => {
    const { error } = await actualizarZona(zona.id, {
      nombre: zona.nombre,
      recargo: zona.recargo,
      activo: zona.activo,
    })
    if (error) setSaveError(error.message || 'No se pudo actualizar la zona.')
  }

  const handleEliminarZona = async (id) => {
    const { error } = await eliminarZona(id)
    if (error) { setSaveError(error.message || 'No se pudo eliminar la zona.'); return }
    setZonas(zs => zs.filter(z => z.id !== id))
  }

  const baseNum = Math.max(0, Math.round(Number(base) || 0))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" />
        Cargando configuración…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Banner explicativo */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <p className="mb-1">
          <strong style={{ color: 'var(--text-primary)' }}>Costo de envío.</strong> La{' '}
          <em>base</em> es lo que cuesta el delivery por defecto (lo que ve el cliente en la web).
        </p>
        <p>
          Cada <em>zona</em> suma un <em>recargo</em> sobre la base. En el pedido elegís la zona y el
          envío se calcula solo: <strong style={{ color: 'var(--text-primary)' }}>base + recargo</strong>.
        </p>
      </div>

      {/* Base */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Truck size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Costo de envío base
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-xmuted)' }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={base}
              onChange={e => setBase(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="3500"
              className="w-full pl-7 pr-3 py-2 rounded-lg text-sm outline-none"
              style={FIELD_STYLE}
            />
          </div>
          <button
            type="button"
            onClick={handleGuardarBase}
            disabled={saveState === 'saving'}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar base
          </button>
        </div>
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
      </div>

      {/* Zonas */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <MapPin size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Zonas y recargos
          </p>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {zonas.length === 0 && (
            <p className="px-4 py-5 text-xs text-center" style={{ color: 'var(--text-xmuted)' }}>
              Todavía no hay zonas. Agregá la primera abajo (ej. “Centro” con recargo $0).
            </p>
          )}

          {zonas.map((zona) => (
            <div key={zona.id} className="p-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={zona.nombre}
                onChange={e => handleUpdateZona(zona.id, { nombre: e.target.value })}
                onBlur={() => handleBlurZona(zona)}
                placeholder="Nombre de la zona"
                className="flex-1 min-w-[140px] px-3 py-2 rounded-lg text-sm outline-none"
                style={{ ...FIELD_STYLE, opacity: zona.activo ? 1 : 0.5 }}
              />
              <div className="relative w-32">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-xmuted)' }}>+$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={zona.recargo}
                  onChange={e => handleUpdateZona(zona.id, { recargo: e.target.value.replace(/[^\d]/g, '') })}
                  onBlur={() => handleBlurZona(zona)}
                  placeholder="0"
                  className="w-full pl-7 pr-2 py-2 rounded-lg text-sm outline-none"
                  style={{ ...FIELD_STYLE, opacity: zona.activo ? 1 : 0.5 }}
                />
              </div>
              <span className="text-[11px] tabular-nums w-24 text-right" style={{ color: 'var(--text-muted)' }}>
                = {money(costoDeZona(baseNum, zona))}
              </span>
              <button
                type="button"
                onClick={() => { handleUpdateZona(zona.id, { activo: !zona.activo }); handleBlurZona({ ...zona, activo: !zona.activo }) }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={zona.activo
                  ? { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                  : { background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
                title={zona.activo ? 'Zona activa (visible)' : 'Zona inactiva (oculta)'}
              >
                {zona.activo ? 'Activa' : 'Inactiva'}
              </button>
              <button
                type="button"
                onClick={() => handleEliminarZona(zona.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
                title="Eliminar zona"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Alta de zona */}
        <div className="p-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-input)' }}>
          <input
            type="text"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            placeholder="Nueva zona (ej. Norte)"
            className="flex-1 min-w-[140px] px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="relative w-32">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-xmuted)' }}>+$</span>
            <input
              type="text"
              inputMode="numeric"
              value={nuevoRecargo}
              onChange={e => setNuevoRecargo(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="w-full pl-7 pr-2 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            type="button"
            onClick={handleAgregarZona}
            disabled={addBusy}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {addBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Agregar
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
          <AlertTriangle size={13} className="mt-0.5" />
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}
