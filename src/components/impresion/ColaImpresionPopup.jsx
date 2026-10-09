import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Printer, RefreshCw, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { printerClient, HOST_PC } from '../../lib/printerClient'
import { cargarPendientes, tomarTicket, resolverTicket, reabrirTicket, tituloTipo } from '../../lib/colaImpresion'

// Aviso grande en la PC del local: tickets que dejaron los celulares porque
// no llegan a la impresora. Solo aparece en un dispositivo que SÍ está
// conectado a Comandera Print (si no, no podría imprimirlos).
//
// Por defecto imprime SOLO lo que llega (sin tocar nada) y muestra un
// cartelito "Impreso desde un celular". El pop-up grande aparece únicamente
// si algo falló (Reintentar / Descartar) o si en esta PC se destildó
// "Imprimir automáticamente" (entonces pide confirmar cada ticket).

const CLAVE_AUTO = 'kiku.cola.auto'
const POLL_MS = 20_000

function leerAuto() { try { return localStorage.getItem(CLAVE_AUTO) !== '0' } catch { return true } }
function guardarAuto(v) { try { localStorage.setItem(CLAVE_AUTO, v ? '1' : '0') } catch { /* sin storage */ } }

// Tres tonos cortos, sin archivo de audio. Si el navegador bloquea el audio
// (no hubo clic todavía), no pasa nada.
function sonar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = i === 2 ? 1046 : 784
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.16)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1000)
  } catch { /* sin audio */ }
}

function hora(ts) {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function ColaImpresionPopup() {
  const [conectado, setConectado] = useState(() => printerClient.state().connected)
  const [pendientes, setPendientes] = useState([])
  const [trabajo, setTrabajo] = useState({})   // id → 'imprimiendo' | 'impreso' | 'error:...'
  const [auto, setAuto] = useState(leerAuto)
  const [ultimoOk, setUltimoOk] = useState(null) // { titulo, t } para el cartel "impreso" en modo auto
  const vistos = useRef(new Set())
  const procesando = useRef(false)

  useEffect(() => printerClient.subscribe(s => setConectado(s.connected)), [])
  // Cada dispositivo prueba Comandera Print en su propia máquina. En la PC
  // del local conecta (y queda mantenida); en un celular falla al instante y
  // en silencio: ese dispositivo imprime por la cola.
  useEffect(() => printerClient.mantener(HOST_PC), [])

  const recargar = useCallback(async () => {
    if (!printerClient.state().connected) return
    try {
      const filas = await cargarPendientes()
      setPendientes(filas)
      const nuevos = filas.filter(f => !vistos.current.has(f.id))
      if (nuevos.length) {
        nuevos.forEach(f => vistos.current.add(f.id))
        // En modo automático solo suena si algo falló; si imprime solo, no molesta.
        if (!leerAuto() || nuevos.some(f => f.estado === 'error')) sonar()
      }
    } catch (err) {
      // Sin la migración 20261009 la tabla no existe: no molestar.
      console.warn('[cola] no se pudo leer la cola:', err.message)
    }
  }, [])

  // Suscripción en tiempo real + sondeo de respaldo, solo mientras esté conectado.
  useEffect(() => {
    if (!conectado) { setPendientes([]); return }
    recargar()
    const channel = supabase
      .channel('cola-impresion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cola_impresion' }, () => recargar())
      .subscribe()
    const timer = setInterval(recargar, POLL_MS)
    return () => { supabase.removeChannel(channel); clearInterval(timer) }
  }, [conectado, recargar])

  const imprimir = useCallback(async (fila) => {
    const mio = await tomarTicket(fila.id)
    if (!mio) { recargar(); return }
    setTrabajo(t => ({ ...t, [fila.id]: 'imprimiendo' }))
    try {
      await printerClient.print({
        printerName: fila.printer_name,
        type: fila.printer_type,
        content: fila.contenido,
        fontSize: fila.font_size,
        paperWidth: fila.paper_width,
        qrCodeData: fila.qr_code_data || undefined,
      })
      await resolverTicket(fila.id, 'impreso')
      setTrabajo(t => ({ ...t, [fila.id]: 'impreso' }))
      setUltimoOk({ titulo: fila.titulo, t: Date.now() })
      setTimeout(() => setTrabajo(t => { const c = { ...t }; delete c[fila.id]; return c }), 2500)
    } catch (err) {
      const msg = err?.message || 'error al imprimir'
      await resolverTicket(fila.id, 'error', msg).catch(() => {})
      setTrabajo(t => ({ ...t, [fila.id]: `error:${msg}` }))
    }
    recargar()
  }, [recargar])

  const descartar = useCallback(async (fila) => {
    await resolverTicket(fila.id, 'descartado').catch(() => {})
    recargar()
  }, [recargar])

  const reintentar = useCallback(async (fila) => {
    await reabrirTicket(fila.id).catch(() => {})
    setTrabajo(t => { const c = { ...t }; delete c[fila.id]; return c })
    recargar()
  }, [recargar])

  // Modo automático: imprime de a uno, en orden de llegada.
  useEffect(() => {
    if (!auto || !conectado || procesando.current) return
    const siguiente = pendientes.find(f => f.estado === 'pendiente' && !trabajo[f.id])
    if (!siguiente) return
    procesando.current = true
    imprimir(siguiente).finally(() => { procesando.current = false })
  }, [auto, conectado, pendientes, trabajo, imprimir])

  // Cartel "impreso" del modo auto: se va solo a los 4 s.
  useEffect(() => {
    if (!ultimoOk) return
    const t = setTimeout(() => setUltimoOk(null), 4000)
    return () => clearTimeout(t)
  }, [ultimoOk])

  const cambiarAuto = (v) => { setAuto(v); guardarAuto(v) }

  // En automático, los pendientes se imprimen sin mostrar nada: el pop-up
  // solo lista lo que falló.
  const esFallo = f => f.estado === 'error' || String(trabajo[f.id] || '').startsWith('error:')
  const visibles = auto ? pendientes.filter(esFallo) : pendientes

  if (!conectado) return null

  // Automático sin fallas: solo el cartelito de "impreso" si acaba de salir uno.
  if (auto && visibles.length === 0) {
    if (!ultimoOk) return null
    return (
      <div className="fixed bottom-4 right-4 z-[95] flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
        <span>Impreso desde un celular: <b>{ultimoOk.titulo}</b></span>
      </div>
    )
  }

  if (visibles.length === 0) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-10 sm:pt-16" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: 'var(--cta)' }}>
          <Printer size={22} />
          <div className="flex-1">
            <p className="text-base font-semibold leading-tight">
              {auto
                ? (visibles.length === 1 ? 'No se pudo imprimir un ticket de un celular' : `${visibles.length} tickets de celulares no se pudieron imprimir`)
                : (visibles.length === 1 ? 'Un celular pide imprimir' : `${visibles.length} tickets para imprimir`)}
            </p>
            <p className="text-xs opacity-80">
              {auto ? 'Revisá la impresora y tocá Reintentar, o descartalos.' : 'Los celulares no llegan a la impresora: salen desde esta PC.'}
            </p>
          </div>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
          {visibles.map(f => {
            const est = trabajo[f.id]
            const esError = (typeof est === 'string' && est.startsWith('error:')) || (!est && f.estado === 'error')
            const textoError = typeof est === 'string' && est.startsWith('error:') ? est.slice(6) : (f.error || 'error al imprimir')
            return (
              <li key={f.id} className="flex items-center gap-3 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {f.titulo || tituloTipo(f.tipo)}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {hora(f.creado_at)}{f.creado_por_nombre ? ` · de ${f.creado_por_nombre}` : ''} · {f.printer_name}
                  </p>
                  {esError && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--bad)' }}>{textoError}</p>
                  )}
                </div>
                {est === 'imprimiendo' && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />}
                {est === 'impreso' && <CheckCircle2 size={18} style={{ color: 'var(--ok)' }} />}
                {esError && (
                  <button type="button" onClick={() => reintentar(f)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={12} /> Reintentar
                  </button>
                )}
                {!est && !esError && !auto && (
                  <button type="button" onClick={() => imprimir(f)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ background: 'var(--cta)' }}>
                    <Printer size={15} /> Imprimir
                  </button>
                )}
                {(!est || esError) && (
                  <button type="button" onClick={() => descartar(f)} title="Descartar"
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={auto} onChange={e => cambiarAuto(e.target.checked)} />
            Imprimir automáticamente en esta PC lo que llega de los celulares
          </label>
          {!auto && visibles.filter(f => !trabajo[f.id] && f.estado === 'pendiente').length > 1 && (
            <button type="button"
              onClick={() => visibles.filter(f => !trabajo[f.id] && f.estado === 'pendiente').reduce((p, f) => p.then(() => imprimir(f)), Promise.resolve())}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <Printer size={13} /> Imprimir todos
            </button>
          )}
          {!auto && (
            <button type="button" onClick={() => visibles.forEach(f => !trabajo[f.id] && descartar(f))}
              className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <X size={13} /> Descartar todos
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
