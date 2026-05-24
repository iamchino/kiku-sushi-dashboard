import { useEffect, useState, useRef } from 'react'
import { X, Loader2, Users, Search, User, Phone, Check } from 'lucide-react'
import { useMozos } from '../../hooks/useMozos'
import { supabase } from '../../lib/supabase'

/**
 * Modal para abrir una mesa.
 *  - Header con el color accent del dashboard
 *  - Cliente conectado a la tabla `clientes` (autocomplete por nombre/tel)
 *  - Permite también escribir un nombre/teléfono nuevo sin guardar en la BD
 */
export default function AbrirMesaModal({ open, mesa, onClose, onAbrir }) {
  const { mozos, loading: loadingMozos } = useMozos({ onlyActive: true })

  const [personas,        setPersonas]        = useState('2')
  const [mozoId,          setMozoId]          = useState('')
  const [clienteNombre,   setClienteNombre]   = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteId,       setClienteId]       = useState(null)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const [clientes,          setClientes]          = useState([])
  const [showSuggestions,   setShowSuggestions]   = useState(false)
  const [activeIndex,       setActiveIndex]       = useState(-1)
  const [searchingClientes, setSearchingClientes] = useState(false)
  const inputWrapRef = useRef(null)

  useEffect(() => {
    if (open) {
      setPersonas(String(mesa?.capacidad || 2))
      setMozoId('')
      setClienteNombre('')
      setClienteTelefono('')
      setClienteId(null)
      setClientes([])
      setShowSuggestions(false)
      setError(null)
    }
  }, [open, mesa])

  useEffect(() => {
    if (!open) return
    const query = (clienteNombre || clienteTelefono).trim()
    if (query.length < 2) { setClientes([]); return }
    let cancelled = false
    setSearchingClientes(true)
    const timer = setTimeout(async () => {
      const isPhone = /^[\d+\s()-]+$/.test(query)
      let q = supabase.from('clientes').select('id, nombre, telefono, tags, pedidos_total, gasto_total').limit(8)
      q = isPhone ? q.ilike('telefono', `%${query}%`) : q.ilike('nombre', `%${query}%`)
      const { data } = await q
      if (cancelled) return
      setClientes(data || [])
      setSearchingClientes(false)
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [clienteNombre, clienteTelefono, open])

  useEffect(() => {
    const onDocClick = (e) => {
      if (inputWrapRef.current && !inputWrapRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    if (showSuggestions) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showSuggestions])

  if (!open || !mesa) return null

  const elegirCliente = (c) => {
    setClienteId(c.id)
    setClienteNombre(c.nombre || '')
    setClienteTelefono(c.telefono || '')
    setShowSuggestions(false)
    setActiveIndex(-1)
  }

  const limpiarCliente = () => {
    setClienteId(null)
    setClienteNombre('')
    setClienteTelefono('')
  }

  const onNombreChange = (v) => { setClienteNombre(v); setClienteId(null); setShowSuggestions(true) }
  const onTelChange    = (v) => { setClienteTelefono(v); setClienteId(null); setShowSuggestions(true) }

  const onKeyDown = (e) => {
    if (!showSuggestions || clientes.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(clientes.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); elegirCliente(clientes[activeIndex]) }
    else if (e.key === 'Escape') setShowSuggestions(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const p = parseInt(personas)
    if (!p || p < 1) { setError('Cantidad de personas inválida'); return }
    setSaving(true); setError(null)
    const { error: err } = await onAbrir?.({
      personas: p,
      mozoId: mozoId || null,
      clienteNombre: clienteNombre || null,
      clienteTelefono: clienteTelefono || null,
      clienteId: clienteId || null,
    }) || {}
    setSaving(false)
    if (err) { setError(err.message || 'Error al abrir mesa'); return }
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 rounded-t-2xl"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
            color: '#ffffff',
            borderBottom: '1px solid var(--accent-border)',
          }}
        >
          <p className="font-semibold text-base flex items-center gap-2">
            <Users size={16} />
            Abrir mesa <span style={{ color: 'var(--accent-lift)' }}>{mesa.numero}</span>
            {mesa.nombre && <span className="text-xs font-normal opacity-80">({mesa.nombre})</span>}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              Personas <span style={{ color: 'var(--accent-lift)' }}>*</span>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--text-xmuted)' }}>Capacidad: {mesa.capacidad}</span>
            </label>
            <input
              type="number" min={1} max={50} required autoFocus
              value={personas}
              onChange={e => setPersonas(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="space-y-1.5" ref={inputWrapRef}>
            <label className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              Cliente <span style={{ color: 'var(--text-xmuted)' }}>(opcional)</span>
              {clienteId && (
                <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)', border: '1px solid var(--accent-border)' }}>
                  <Check size={9} /> Registrado
                  <button type="button" onClick={limpiarCliente} className="ml-1 opacity-70 hover:opacity-100">×</button>
                </span>
              )}
            </label>

            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
              <input
                type="text"
                value={clienteNombre}
                onChange={e => onNombreChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={onKeyDown}
                placeholder="Buscar por nombre…"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="relative">
              <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xmuted)' }} />
              <input
                type="tel"
                value={clienteTelefono}
                onChange={e => onTelChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={onKeyDown}
                placeholder="o por teléfono"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {showSuggestions && clientes.length > 0 && !clienteId && (
              <div
                className="rounded-lg overflow-hidden shadow-lg max-h-56 overflow-y-auto"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-border)' }}
              >
                {clientes.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegirCliente(c)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={{
                      background: idx === activeIndex ? 'var(--accent-soft)' : 'transparent',
                      borderBottom: idx < clientes.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}
                    >
                      {(c.nombre || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.nombre}</p>
                      <p className="text-[10px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        {c.telefono && <span>{c.telefono}</span>}
                        {c.pedidos_total > 0 && <span>· {c.pedidos_total} pedidos</span>}
                      </p>
                    </div>
                    {c.tags && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-lift)' }}>
                        {c.tags.split(',')[0].trim()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {showSuggestions && !searchingClientes && clientes.length === 0 && (clienteNombre || clienteTelefono).trim().length >= 2 && !clienteId && (
              <p className="text-[10px] px-2" style={{ color: 'var(--text-xmuted)' }}>
                <User size={9} className="inline mr-1" />
                Nuevo cliente — se guarda solo en este pedido
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Camarero</label>
            <select
              value={mozoId}
              onChange={e => setMozoId(e.target.value)}
              disabled={loadingMozos}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none cursor-pointer"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="">Sin asignar</option>
              {mozos.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            {!loadingMozos && mozos.length === 0 && (
              <p className="text-[10px]" style={{ color: 'var(--text-xmuted)' }}>
                No hay camareros cargados. Podés agregarlos desde Configuración.
              </p>
            )}
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))',
              boxShadow: '0 4px 16px rgba(var(--accent-rgb),0.35)',
            }}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Abriendo…</>
              : <>Abrir mesa</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
