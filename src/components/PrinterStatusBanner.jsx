import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { printerClient } from '../lib/printerClient'
import { usePrinterStore } from '../lib/printerStore'

const CHECK_INTERVAL_MS = 45000

/**
 * Aviso proactivo del estado de la impresora (GG EZ Print).
 *
 * Chequea la conexión al arrancar, cada 45s, y cada vez que la pestaña vuelve
 * al foco. Si la impresora no responde, muestra un banner rojo ANTES de que
 * intenten imprimir — con botón de reintento y acceso directo a la config
 * (por si cambió la IP). No muestra nada cuando la impresora responde bien o
 * cuando no hay un servidor de impresión configurado.
 */
export default function PrinterStatusBanner() {
  const config = usePrinterStore(s => s.config)
  const loaded = usePrinterStore(s => s.loaded)
  const [status, setStatus] = useState('idle') // idle | checking | ok | error
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

  // Chequeo inicial + intervalo.
  useEffect(() => {
    if (!loaded) return undefined
    check()
    timerRef.current = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(timerRef.current)
  }, [loaded, check])

  // Reintentar cuando la pestaña/app vuelve al foco (típico: prenden la caja
  // y vuelven al dashboard).
  useEffect(() => {
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [check])

  // No molestar si no hay impresora configurada o si está todo bien.
  if (!serverHost || status === 'ok' || status === 'idle') return null

  if (status === 'checking') {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <Loader2 size={14} className="animate-spin" />
        Verificando conexión con la impresora…
      </div>
    )
  }

  // status === 'error'
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-xs flex-wrap"
      style={{ background: '#7f1d1d', color: '#ffffff' }}
      role="alert"
    >
      <AlertTriangle size={15} className="flex-shrink-0" />
      <span className="flex-1 min-w-[220px]">
        <strong>Impresora no conectada.</strong> No se va a poder imprimir. Fijate que la PC de caja esté
        encendida con <code>gg-ez-print</code> abierto, y que la dirección <code>{serverHost}</code> sea la correcta.
      </span>
      <button
        type="button"
        onClick={check}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold"
        style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
      >
        <RefreshCw size={12} /> Reintentar
      </button>
      <Link
        to="/configuracion/salon?tab=impresoras"
        className="px-2.5 py-1 rounded-md text-[11px] font-semibold"
        style={{ background: '#ffffff', color: '#7f1d1d' }}
      >
        Cambiar IP
      </Link>
    </div>
  )
}
