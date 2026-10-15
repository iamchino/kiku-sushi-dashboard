import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { normalizeSearch } from '../../utils/normalize'

/**
 * Buscador: un <select> con búsqueda, para listas largas (ingredientes,
 * productos del menú, recetas). Se escribe para filtrar, se elige con
 * click o con las flechas + Enter. Respeta el tema (claro / oscuro):
 * el desplegable nativo del navegador en tema oscuro quedaba ilegible.
 *
 * Props:
 *   value       valor elegido ('' = nada)
 *   onChange    (value) => void
 *   grupos      [{ label, opciones: [{ value, label, detalle?, disabled? }] }]
 *               (o directamente `opciones` sin grupos)
 *   placeholder texto cuando no hay nada elegido
 *   compact     variante chica (dentro de una fila de ingredientes)
 */
export default function Buscador({
  value, onChange, grupos, opciones, placeholder = 'Seleccionar…', compact = false,
  disabled = false, allowEmpty = true, emptyLabel = '— Sin vincular —',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activo, setActivo] = useState(0)
  const [pos, setPos] = useState(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const input = useRef(null)

  const gruposNorm = useMemo(() => {
    const base = grupos || [{ label: null, opciones: opciones || [] }]
    return base.filter(g => g && g.opciones && g.opciones.length > 0)
  }, [grupos, opciones])

  const seleccionada = useMemo(() => {
    for (const g of gruposNorm) {
      const o = g.opciones.find(o => String(o.value) === String(value))
      if (o) return o
    }
    return null
  }, [gruposNorm, value])

  // Filtrado sin acentos ni mayúsculas, por palabras ("sal mar" → Salsa Maracuyá).
  const filtrados = useMemo(() => {
    const palabras = normalizeSearch(q).split(/\s+/).filter(Boolean)
    const coincide = (o) => {
      if (palabras.length === 0) return true
      const texto = normalizeSearch(`${o.label} ${o.detalle || ''}`)
      return palabras.every(p => texto.includes(p))
    }
    return gruposNorm
      .map(g => ({ ...g, opciones: g.opciones.filter(coincide) }))
      .filter(g => g.opciones.length > 0)
  }, [gruposNorm, q])

  // Lista plana para moverse con el teclado.
  const planos = useMemo(() => {
    const out = []
    if (allowEmpty && !q) out.push({ value: '', label: emptyLabel, _vacio: true })
    for (const g of filtrados) for (const o of g.opciones) if (!o.disabled) out.push(o)
    return out
  }, [filtrados, allowEmpty, q, emptyLabel])

  const abrir = () => {
    if (disabled) return
    setQ(''); setActivo(0); setOpen(true)
  }
  const cerrar = () => { setOpen(false); setQ('') }
  const elegir = (o) => { onChange(o.value); cerrar(); trigger.current?.focus() }

  // Posición: el panel va fijo (position: fixed) para que no lo recorte el
  // scroll del modal. Si no entra abajo, se abre hacia arriba.
  const ubicar = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const alto = Math.min(360, Math.max(180, window.innerHeight - 24))
    const abajo = window.innerHeight - r.bottom
    // Abajo si entra razonablemente (240px); si no, hacia donde haya más lugar.
    const arriba = abajo < Math.min(alto + 8, 240) && r.top > abajo
    const h = Math.min(alto, (arriba ? r.top : abajo) - 12)
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 280) - 8)),
      width: Math.max(r.width, 280),
      top: arriba ? undefined : r.bottom + 4,
      bottom: arriba ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: h,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    ubicar()
    const onScroll = (e) => { if (panel.current && panel.current.contains(e.target)) return; ubicar() }
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('resize', ubicar); window.removeEventListener('scroll', onScroll, true) }
  }, [open])

  // Click afuera cierra.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panel.current?.contains(e.target) || trigger.current?.contains(e.target)) return
      cerrar()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open])

  // La opción activa se mantiene a la vista.
  useEffect(() => {
    if (!open) return
    const el = panel.current?.querySelector(`[data-idx="${activo}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activo, open])

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(planos.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (planos[activo]) elegir(planos[activo]) }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(); trigger.current?.focus() }
    else if (e.key === 'Tab') cerrar()
  }

  let idx = -1
  const textoBtn = seleccionada
    ? `${seleccionada.label}${seleccionada.detalle ? ` (${seleccionada.detalle})` : ''}`
    : placeholder

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => (open ? cerrar() : abrir())}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir() } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 text-left outline-none min-w-0 ${
          compact ? 'px-2 py-1.5 rounded text-xs' : 'px-3 py-2.5 rounded-lg text-sm'
        } disabled:opacity-50`}
        style={compact
          ? { background: 'transparent', color: seleccionada ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none' }
          : { background: 'var(--bg-input)', color: seleccionada ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
      >
        <span className="truncate">{textoBtn}</span>
        <ChevronDown size={compact ? 12 : 14} className="flex-shrink-0" style={{ color: 'var(--text-xmuted)' }} />
      </button>

      {open && pos && (
        <div
          ref={panel}
          role="listbox"
          className="fixed z-[200] rounded-xl overflow-hidden flex flex-col"
          style={{
            left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-xmuted)' }} />
            <input
              ref={input}
              autoFocus
              value={q}
              onChange={e => { setQ(e.target.value); setActivo(0) }}
              onKeyDown={onKey}
              placeholder="Escribí para buscar…"
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
            {q && (
              <button type="button" onClick={() => { setQ(''); setActivo(0); input.current?.focus() }}
                className="w-5 h-5 rounded flex items-center justify-center" style={{ color: 'var(--text-xmuted)' }}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="overflow-y-auto py-1 flex-1 min-h-0">
            {planos.length === 0 && (
              <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-xmuted)' }}>
                Nada que coincida con "{q}"
              </p>
            )}
            {allowEmpty && !q && (() => { idx++; const i = idx; return (
              <Opcion key="__vacio" idx={i} activa={activo === i} elegida={!value}
                onHover={() => setActivo(i)} onPick={() => elegir({ value: '' })}
                label={emptyLabel} muted />
            ) })()}
            {filtrados.map(g => (
              <div key={g.label || '_'}>
                {g.label && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-xmuted)' }}>
                    {g.label}
                  </p>
                )}
                {g.opciones.map(o => {
                  if (o.disabled) {
                    return (
                      <div key={o.value} className="px-3 py-1.5 text-sm opacity-40 cursor-not-allowed truncate" style={{ color: 'var(--text-muted)' }}>
                        {o.label}{o.detalle ? <span className="ml-1 text-xs">({o.detalle})</span> : null}
                      </div>
                    )
                  }
                  idx++; const i = idx
                  return (
                    <Opcion key={o.value} idx={i} activa={activo === i} elegida={String(o.value) === String(value)}
                      onHover={() => setActivo(i)} onPick={() => elegir(o)}
                      label={o.label} detalle={o.detalle} />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Opcion({ idx, activa, elegida, onHover, onPick, label, detalle, muted }) {
  return (
    <div
      data-idx={idx}
      role="option"
      aria-selected={elegida}
      onMouseEnter={onHover}
      onMouseDown={e => e.preventDefault()}
      onClick={onPick}
      className="px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-2"
      style={{
        background: activa ? 'var(--bg-active)' : 'transparent',
        color: muted ? 'var(--text-muted)' : elegida ? 'var(--accent-lift)' : 'var(--text-primary)',
        fontWeight: elegida ? 600 : 400,
      }}
    >
      <span className="truncate">{label}</span>
      {detalle && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-xmuted)' }}>{detalle}</span>}
    </div>
  )
}
