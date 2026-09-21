import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Loader2, X, Printer, CheckCircle2 } from 'lucide-react'
import { printerClient } from '../lib/printerClient'
import { usePrinterStore } from '../lib/printerStore'

/**
 * Aviso del estado de Comandera Print.
 *
 * No sondea: se prende solo cuando una impresión o una prueba de conexión
 * falla (así no molesta en los celulares que nunca imprimen). En rojo dice
 * por qué falló y qué hacer; en amarillo avisa que esta PC imprime por
 * 127.0.0.1 pero la dirección configurada ya no responde (los celulares no
 * van a poder imprimir hasta corregirla). "Cambiar dirección" edita la IP sin
 * salir de la pantalla actual.
 */
export default function PrinterStatusBanner() {
  const config = usePrinterStore(s => s.config)
  const save = usePrinterStore(s => s.save)

  const [estado, setEstado] = useState(() => printerClient.state())
  const [status, setStatus] = useState('idle') // idle | checking (solo al reintentar)
  const [oculto, setOculto] = useState(null) // mensaje de error que el usuario cerró
  const [showModal, setShowModal] = useState(false)
  const [draftHost, setDraftHost] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedScope, setSavedScope] = useState(null) // 'remote' | 'local' | null

  const serverHost = config?.server_host || ''

  useEffect(() => printerClient.subscribe(setEstado), [])

  const check = useCallback(async () => {
    if (!serverHost) return
    setStatus('checking')
    setOculto(null)
    try {
      await printerClient.listPrinters(serverHost)
    } catch { /* el estado llega por subscribe */ }
    setStatus('idle')
  }, [serverHost])

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
    setTimeout(async () => {
      setShowModal(false)
      setStatus('checking')
      setOculto(null)
      try { await printerClient.listPrinters(host) } catch { /* el estado llega por subscribe */ }
      setStatus('idle')
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
          En la PC del local, la ventana negra de <strong>Comandera Print</strong> dice
          <strong> "Escuchando en https://X.X.X.X:8443"</strong>. Poné acá esos números
          (con el :8443). Si la ventana no está abierta, abrí ComanderaPrint.exe.
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

  // Sin impresora configurada, o sin ninguna falla registrada: no molestar.
  if (!serverHost) return modal

  if (status === 'checking') {
    return (
      <>
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <Loader2 size={14} className="animate-spin" />
          Verificando conexión con Comandera Print…
        </div>
        {modal}
      </>
    )
  }

  // Anda, pero porque el dashboard corre en la misma PC que Comandera Print:
  // la dirección configurada no responde y los celulares no van a poder
  // imprimir hasta que alguien la corrija.
  if (estado.connected && estado.viaLocal) {
    return (
      <>
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs flex-wrap"
          style={{ background: '#78350f', color: '#ffffff' }}
          role="alert"
        >
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span className="flex-1 min-w-[200px]">
            <strong>Esta PC imprime, pero la dirección {serverHost} ya no responde</strong> (la PC cambió
            de IP en el wifi). Los celulares no van a poder imprimir hasta corregirla: fijate en la ventana
            negra de Comandera Print qué dice en "Escuchando en…".
          </span>
          <button
            type="button"
            onClick={openModal}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
            style={{ background: '#ffffff', color: '#78350f' }}
          >
            Cambiar dirección
          </button>
        </div>
        {modal}
      </>
    )
  }

  const detalle = estado.connected ? null : estado.error
  if (!detalle || oculto === detalle) return modal

  return (
    <>
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs flex-wrap"
        style={{ background: '#7f1d1d', color: '#ffffff' }}
        role="alert"
      >
        <AlertTriangle size={15} className="flex-shrink-0" />
        <span className="flex-1 min-w-[200px]">
          <strong>Impresora no conectada.</strong> {detalle}
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
        <button
          type="button"
          onClick={() => setOculto(detalle)}
          aria-label="Cerrar aviso"
          style={{ color: 'rgba(255,255,255,0.8)' }}
        >
          <X size={15} />
        </button>
      </div>
      {modal}
    </>
  )
}
