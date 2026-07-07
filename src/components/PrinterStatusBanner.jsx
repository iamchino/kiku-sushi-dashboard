import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Loader2, X, Printer, CheckCircle2 } from 'lucide-react'
import { printerClient } from '../lib/printerClient'
import { usePrinterStore } from '../lib/printerStore'

const CHECK_INTERVAL_MS = 45000

/**
 * Aviso proactivo del estado de la impresora (GG EZ Print).
 *
 * Chequea la conexión al arrancar, cada 45s, y al volver la pestaña al foco.
 * Si no responde, muestra un banner rojo ANTES de imprimir. El botón "Cambiar
 * dirección" abre un cuadro simple para editar la IP del servidor de impresión
 * SIN salir de la pantalla actual — así cualquier usuario (incluido el mozo,
 * que no entra a la config del salón) puede corregirla desde su celular.
 */
export default function PrinterStatusBanner() {
  const config = usePrinterStore(s => s.config)
  const loaded = usePrinterStore(s => s.loaded)
  const save = usePrinterStore(s => s.save)

  const [status, setStatus] = useState('idle') // idle | checking | ok | error
  const [showModal, setShowModal] = useState(false)
  const [draftHost, setDraftHost] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedScope, setSavedScope] = useState(null) // 'remote' | 'local' | null
  const timerRef = useRef(null)

  const serverHost = config?.server_host || ''

  const check = useCallback(async () => {
    if (!serverHost) {
      setStatus('idle')
      return
    }
    setStatus(prev => (prev === 'ok' ? 'ok' : 'checking'))
    try {
      await printerClient.listPrinters(serverHost)
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [serverHost])

  useEffect(() => {
    if (!loaded) return undefined
    check()
    timerRef.current = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(timerRef.current)
  }, [loaded, check])

  useEffect(() => {
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [check])

  const openModal = () => {
    setDraftHost(serverHost)
    setSavedScope(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    const host = draftHost.trim()
    if (!host) return
    setSaving(true)
    let scope = 'local'
    try {
      // Primero intentamos el default del negocio (Supabase): así el cambio
      // sirve para todos los equipos. Si el usuario no tiene permiso (RLS),
      // caemos a guardar solo en ESTE dispositivo.
      await save({ server_host: host }, { target: 'remote' })
      scope = 'remote'
    } catch {
      try {
        await save({ server_host: host }, { target: 'local' })
        scope = 'local'
      } catch { /* ignore */ }
    }
    setSaving(false)
    setSavedScope(scope)
    // Re-chequear conexión con la dirección nueva.
    setTimeout(() => {
      check()
      setShowModal(false)
    }, 700)
  }

  const modal = showModal ? (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={() => !saving && setShowModal(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Printer size={17} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Dirección de la impresora
            </span>
          </div>
          {!saving && (
            <button type="button" onClick={() => setShowModal(false)} style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          )}
        </div>

        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Poné la dirección que figura en la PC de caja, en el ícono de la impresora
          (abajo a la derecha, cerca del reloj), donde dice <strong>Dirección</strong>.
        </p>

        <input
          type="text"
          inputMode="decimal"
          value={draftHost}
          onChange={e => setDraftHost(e.target.value)}
          placeholder="Ej: 192.168.0.55:8443"
          autoFocus
          className="w-full px-3 py-3 rounded-lg text-base outline-none mb-3"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />

        {savedScope && (
          <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={14} />
            {savedScope === 'remote' ? 'Guardado para todos los equipos.' : 'Guardado en este dispositivo.'}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowModal(false)}
            disabled={saving}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !draftHost.trim()}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  ) : null

  // No molestar si no hay impresora configurada o si está todo bien.
  if (!serverHost || status === 'ok' || status === 'idle') return modal

  if (status === 'checking') {
    return (
      <>
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <Loader2 size={14} className="animate-spin" />
          Verificando conexión con la impresora…
        </div>
        {modal}
      </>
    )
  }

  // status === 'error'
  return (
    <>
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs flex-wrap"
        style={{ background: '#7f1d1d', color: '#ffffff' }}
        role="alert"
      >
        <AlertTriangle size={15} className="flex-shrink-0" />
        <span className="flex-1 min-w-[200px]">
          <strong>Impresora no conectada.</strong> No se va a poder imprimir. Fijate que la PC de caja esté
          encendida, y si cambió la dirección, corregila acá.
        </span>
        <button
          type="button"
          onClick={check}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
        >
          <RefreshCw size={12} /> Reintentar
        </button>
        <button
          type="button"
          onClick={openModal}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
          style={{ background: '#ffffff', color: '#7f1d1d' }}
        >
          Cambiar dirección
        </button>
      </div>
      {modal}
    </>
  )
}
