import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, CheckCircle2, Loader2 } from 'lucide-react'
import { useRole } from '../context/useRole'
import {
  activarNotificaciones,
  estadoNotificaciones,
  rolRecibeNotifs,
} from '../lib/webNotifs'
import { isNativeApp } from '../lib/native'

/**
 * Aviso para activar las notificaciones del celular (cocina y mozos).
 *
 * El permiso de notificaciones SOLO se puede pedir desde un gesto del usuario,
 * y una vez que Chrome lo rechaza no se vuelve a preguntar. Por eso hay un
 * botón explícito en vez de un prompt automático: si esto fallara en silencio,
 * cocina no se entera de los pedidos y nadie sabe por qué.
 *
 * Al activar se manda una notificación de prueba, así el usuario confirma en el
 * momento que el teléfono suena.
 */
export default function NotifStatusBanner() {
  const role = useRole()
  const [estado, setEstado] = useState('default')
  const [trabajando, setTrabajando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    setEstado(estadoNotificaciones())
  }, [])

  const activar = useCallback(async () => {
    setTrabajando(true)
    const res = await activarNotificaciones()
    setEstado(res)
    setTrabajando(false)
    if (res === 'granted') {
      setOk(true)
      setTimeout(() => setOk(false), 6000)
    }
  }, [])

  // La app nativa maneja sus propias notificaciones (native.js).
  if (isNativeApp()) return null
  if (!rolRecibeNotifs(role)) return null

  if (ok) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs"
        style={{ background: '#14532d', color: '#ffffff' }}
      >
        <CheckCircle2 size={15} className="flex-shrink-0" />
        <span>Notificaciones activadas en este teléfono. Deberías haber recibido una de prueba.</span>
      </div>
    )
  }

  if (estado === 'granted' || estado === 'no-soportado') return null

  if (estado === 'denied') {
    return (
      <div
        className="flex items-start gap-2 px-4 py-2 text-xs"
        style={{ background: '#7c2d12', color: '#ffffff' }}
        role="alert"
      >
        <BellOff size={15} className="flex-shrink-0 mt-0.5" />
        <span>
          <strong>Notificaciones bloqueadas en este teléfono.</strong> No vas a recibir avisos de pedidos.
          Para reactivarlas: en Chrome tocá el candado 🔒 al lado de la dirección →
          <em> Permisos </em>→ <em>Notificaciones</em> → Permitir, y recargá.
        </span>
      </div>
    )
  }

  // estado === 'default'
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-xs flex-wrap"
      style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      <BellRing size={15} className="flex-shrink-0" style={{ color: 'var(--accent-lift)' }} />
      <span className="flex-1 min-w-[200px]">
        <strong style={{ color: 'var(--text-primary)' }}>Activá las notificaciones</strong> para que este
        teléfono suene cuando entra un pedido o cuando hay platos listos.
      </span>
      <button
        type="button"
        onClick={activar}
        disabled={trabajando}
        className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
      >
        {trabajando ? <Loader2 size={12} className="animate-spin" /> : <BellRing size={12} />}
        Activar
      </button>
    </div>
  )
}
