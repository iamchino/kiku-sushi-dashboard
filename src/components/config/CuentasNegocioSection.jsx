import { useEffect, useState } from 'react'
import { Landmark, Plus, Loader2, ArrowUp, ArrowDown, Pencil, Check, X, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Cuentas desde las que el negocio hace transferencias (banco, Mercado Pago…).
// Tabla cuentas_negocio. Se eligen al registrar un pago por transferencia y
// quedan guardadas en el pago (egresos.cuenta_id), así Finanzas y el Excel de
// los contadores saben de qué cuenta salió cada cosa.
//
// Desactivar ≠ borrar: una cuenta desactivada no se ofrece para pagos nuevos
// pero los pagos viejos la siguen mostrando. Borrar solo se permite si ningún
// pago la usa (si no, la base la rechaza por la FK).

const TIPOS = [
  { id: 'banco',     label: 'Banco' },
  { id: 'billetera', label: 'Billetera virtual' },
  { id: 'otro',      label: 'Otro' },
]
const tipoLabel = (id) => TIPOS.find(t => t.id === id)?.label || id

const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
const btnStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }

export default function CuentasNegocioSection() {
  const [cuentas, setCuentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [faltaMigracion, setFaltaMigracion] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [nuevaNombre, setNuevaNombre] = useState('')
  const [nuevaTipo, setNuevaTipo] = useState('banco')
  const [editando, setEditando] = useState(null)   // { id, nombre, tipo }

  const cargar = async () => {
    const { data, error: err } = await supabase
      .from('cuentas_negocio')
      .select('id, nombre, tipo, activa, orden')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
    if (err) {
      const msg = String(err.message || '')
      // Tabla inexistente = la migración 20261020 no corrió todavía.
      setFaltaMigracion(/cuentas_negocio|schema cache|does not exist/i.test(msg))
      setError(msg)
    } else {
      setCuentas(data || [])
      setFaltaMigracion(false)
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const correr = async (fn) => {
    setBusy(true); setError(null)
    try {
      const { error: err } = await fn()
      if (err) throw err
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const agregar = () => {
    const nombre = nuevaNombre.trim()
    if (!nombre) return
    const orden = cuentas.length ? Math.max(...cuentas.map(c => c.orden || 0)) + 1 : 0
    correr(() => supabase.from('cuentas_negocio').insert({ nombre, tipo: nuevaTipo, activa: true, orden }))
      .then(() => { setNuevaNombre(''); setNuevaTipo('banco') })
  }

  const guardarEdicion = () => {
    if (!editando) return
    const nombre = editando.nombre.trim()
    if (!nombre) return
    correr(() => supabase.from('cuentas_negocio')
      .update({ nombre, tipo: editando.tipo })
      .eq('id', editando.id))
      .then(() => setEditando(null))
  }

  const toggleActiva = (c) =>
    correr(() => supabase.from('cuentas_negocio').update({ activa: !c.activa }).eq('id', c.id))

  const mover = (c, dir) => {
    const idx = cuentas.findIndex(x => x.id === c.id)
    const j = idx + dir
    if (j < 0 || j >= cuentas.length) return
    const otra = cuentas[j]
    // Intercambia el orden con la vecina (si tenían el mismo, se separan).
    const oA = c.orden ?? idx, oB = otra.orden ?? j
    const [nA, nB] = oA === oB ? (dir < 0 ? [oB - 1, oB] : [oB + 1, oB]) : [oB, oA]
    correr(async () => {
      const r1 = await supabase.from('cuentas_negocio').update({ orden: nA }).eq('id', c.id)
      if (r1.error) return r1
      return supabase.from('cuentas_negocio').update({ orden: nB }).eq('id', otra.id)
    })
  }

  const borrar = (c) => {
    if (!window.confirm(`¿Borrar la cuenta "${c.nombre}"? Si algún pago salió de ahí, no se va a poder: desactivala en vez de borrarla.`)) return
    correr(async () => {
      const r = await supabase.from('cuentas_negocio').delete().eq('id', c.id)
      if (r.error && /foreign key|egresos_cuenta_id_fkey/i.test(r.error.message)) {
        return { error: new Error('Hay pagos registrados desde esa cuenta: no se puede borrar. Desactivala para que no se ofrezca más.') }
      }
      return r
    })
  }

  const activas = cuentas.filter(c => c.activa)

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-3">
        <Landmark size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-lift)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cuentas del negocio</p>
          <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--text-xmuted)' }}>
            De estas cuentas salen las transferencias. Se eligen al registrar un pago por transferencia
            (Caja → Pagos) y quedan guardadas en cada pago. La primera de la lista es la que se propone por defecto.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center text-xs py-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin mr-2" /> Cargando…
        </div>
      ) : faltaMigracion ? (
        <div className="flex items-start gap-2 rounded-lg p-3 text-xs" style={{ background: 'var(--warn-soft)', color: 'var(--text-primary)' }}>
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--warn)' }} />
          <span>Falta correr en Supabase la migración de cuentas (<code>20261020000000_cuentas_negocio.sql</code>, SQL-CIERRES 46).
            Mientras tanto el formulario de pagos usa la cuenta única de antes.</span>
        </div>
      ) : (
        <>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {cuentas.length === 0 && (
              <li className="py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Todavía no hay cuentas cargadas.</li>
            )}
            {cuentas.map((c, i) => (
              <li key={c.id} className="py-2 flex items-center gap-2">
                {editando?.id === c.id ? (
                  <>
                    <input value={editando.nombre} onChange={e => setEditando(ed => ({ ...ed, nombre: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
                      autoFocus maxLength={80}
                      className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-sm outline-none" style={inputStyle} />
                    <select value={editando.tipo} onChange={e => setEditando(ed => ({ ...ed, tipo: e.target.value }))}
                      className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                      {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <button type="button" onClick={guardarEdicion} disabled={busy || !editando.nombre.trim()} title="Guardar"
                      className="p-1.5 rounded-lg" style={{ ...btnStyle, color: 'var(--ok)' }}><Check size={14} /></button>
                    <button type="button" onClick={() => setEditando(null)} title="Cancelar"
                      className="p-1.5 rounded-lg" style={btnStyle}><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: c.activa ? 'var(--text-primary)' : 'var(--text-xmuted)', textDecoration: c.activa ? 'none' : 'line-through' }}>
                        {c.nombre}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-xmuted)' }}>
                        {tipoLabel(c.tipo)}{!c.activa && ' · desactivada: no se ofrece para pagos nuevos'}
                        {c.activa && activas[0]?.id === c.id && ' · por defecto'}
                      </p>
                    </div>
                    <button type="button" onClick={() => mover(c, -1)} disabled={busy || i === 0} title="Subir"
                      className="p-1.5 rounded-lg disabled:opacity-30" style={btnStyle}><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => mover(c, +1)} disabled={busy || i === cuentas.length - 1} title="Bajar"
                      className="p-1.5 rounded-lg disabled:opacity-30" style={btnStyle}><ArrowDown size={13} /></button>
                    <button type="button" onClick={() => setEditando({ id: c.id, nombre: c.nombre, tipo: c.tipo })} disabled={busy} title="Renombrar"
                      className="p-1.5 rounded-lg" style={btnStyle}><Pencil size={13} /></button>
                    <button type="button" onClick={() => toggleActiva(c)} disabled={busy}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium" style={btnStyle}>
                      {c.activa ? 'Desactivar' : 'Activar'}
                    </button>
                    <button type="button" onClick={() => borrar(c)} disabled={busy} title="Borrar (solo si ningún pago la usa)"
                      className="p-1.5 rounded-lg" style={{ ...btnStyle, color: 'var(--bad)' }}><Trash2 size={13} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 pt-1">
            <input value={nuevaNombre} onChange={e => setNuevaNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') agregar() }}
              placeholder="Nueva cuenta, ej: Mercado Pago KIKU SUSHI" maxLength={80}
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
            <select value={nuevaTipo} onChange={e => setNuevaTipo(e.target.value)}
              className="rounded-lg px-2 py-2 text-xs outline-none" style={inputStyle}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={agregar} disabled={busy || !nuevaNombre.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Agregar
            </button>
          </div>
        </>
      )}

      {error && !faltaMigracion && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--bad)' }}>
          <AlertTriangle size={12} /> {error}
        </p>
      )}
    </div>
  )
}
