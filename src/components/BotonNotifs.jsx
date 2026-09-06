import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, Bell, Loader2 } from 'lucide-react'
import {
  activarNotificaciones,
  diagnosticoPush,
  estadoNotificaciones,
  MOTIVO_TEXTO,
} from '../lib/webNotifs'
import { isNativeApp } from '../lib/native'

/**
 * Campanita fija para activar / verificar las notificaciones del dispositivo.
 *
 * Existe porque la barra de aviso solo aparece cuando el permiso está sin
 * pedir: si alguien ya lo tocó, o si el navegador lo recuerda, no quedaba
 * NINGÚN lugar donde activar o comprobar el estado. Y cocina no entra a
 * Configuración, así que se quedaba sin ninguna opción.
 *
 * Va en la barra superior del KDS y de Platos — las pantallas donde cocina y
 * los mozos pasan el servicio.
 *
 * Colores: gris = sin activar · naranja = suena solo con la app abierta ·
 * verde = anda con el celular bloqueado.
 */
export default function BotonNotifs() {
  const [permiso, setPermiso] = useState('default')
  const [push, setPush] = useState('sin-permiso')
  const [motivo, setMotivo] = useState(null)
  const [trabajando, setTrabajando] = useState(false)

  const revisar = useCallback(async () => {
    setPermiso(estadoNotificaciones())
    setPush(await diagnosticoPush())
  }, [])

  useEffect(() => { revisar() }, [revisar])

  const activar = useCallback(async () => {
    setTrabajando(true)
    const res = await activarNotificaciones()
    setPermiso(res.permiso)
    setPush(await diagnosticoPush())
    // El motivo concreto del fallo: sin esto el usuario ve "a medias" y nadie
    // sabe si el problema es el deploy, el navegador o el servidor.
    setMotivo(res.push ? null : (MOTIVO_TEXTO[res.motivo] || res.motivo))
    setTrabajando(false)
  }, [])

  if (isNativeApp()) return null

  const ok = permiso === 'granted' && push === 'ok'
  const parcial = permiso === 'granted' && push !== 'ok'
  const bloqueado = permiso === 'denied'

  const { color, fondo, Icono, texto, titulo } = bloqueado
    ? {
        color: '#f87171', fondo: 'rgba(239,68,68,0.12)', Icono: BellOff, texto: 'Bloqueadas',
        titulo: 'Chrome tiene bloqueadas las notificaciones en este teléfono. Tocá el candado 🔒 al lado de la dirección → Permisos → Notificaciones → Permitir, y recargá.',
      }
    : ok
      ? {
          color: '#34d399', fondo: 'rgba(52,211,153,0.12)', Icono: BellRing, texto: 'Avisos ON',
          titulo: 'Este dispositivo recibe avisos aunque esté bloqueado. Tocá para mandarte una notificación de prueba.',
        }
      : parcial
        ? {
            color: '#fbbf24', fondo: 'rgba(251,191,36,0.12)', Icono: Bell, texto: 'A medias',
            titulo: motivo
              ? `Solo suena con la app abierta: ${motivo}. Tocá para reintentar.`
              : (MOTIVO_TEXTO[push]
                  ? `Solo suena con la app abierta: ${MOTIVO_TEXTO[push]}. Tocá para reintentar.`
                  : 'Solo suena con la app abierta. Tocá para reintentar el registro.'),
          }
        : {
            color: 'var(--text-muted)', fondo: 'transparent', Icono: Bell, texto: 'Activar avisos',
            titulo: 'Tocá para recibir los avisos de pedidos en este dispositivo.',
          }

  return (
    <button
      type="button"
      onClick={activar}
      disabled={trabajando}
      title={titulo}
      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50"
      style={{ background: fondo, color, border: `1px solid ${ok || parcial || bloqueado ? 'transparent' : 'var(--border)'}` }}
    >
      {trabajando ? <Loader2 size={14} className="animate-spin" /> : <Icono size={14} />}
      <span className="hidden sm:inline">{texto}</span>
      {parcial && (motivo || MOTIVO_TEXTO[push]) && (
        <span className="hidden lg:inline font-normal opacity-80 max-w-[22rem] truncate">
          · {motivo || MOTIVO_TEXTO[push]}
        </span>
      )}
    </button>
  )
}
