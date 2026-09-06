// ────────────────────────────────────────────────────────────────────────────
// Notificaciones del dashboard EN EL NAVEGADOR (cocina y mozos usan Chrome en
// el celular, no la app nativa). Dos caminos que se complementan:
//
//   1. WEB PUSH (service worker + VAPID) → llega con Chrome CERRADO y el celu
//      bloqueado. Lo dispara la edge function `push-web` desde un webhook de
//      la tabla `pedidos`. Es el camino que importa en el salón.
//   2. REALTIME (websocket de Supabase) → solo con la pestaña viva, pero es
//      instantáneo y suena fuerte con la app en primer plano. Queda como
//      refuerzo; `tag` por pedido evita que se dupliquen en pantalla.
//
//   cocina / admin: INSERT en pedidos       → "🔥 Nuevo pedido"
//   mozo   / admin: pedido pasa a 'listo'   → "🍣 Listo para servir"
//
// Los navegadores exigen un gesto del usuario para pedir permiso y para
// desbloquear el audio. Por eso el permiso se pide desde el botón "Activar
// notificaciones" (ver components/layout/ActivarNotifs.jsx) y no de arranque:
// un prompt automático se rechaza solo y después no vuelve a aparecer.
// ────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import { getRoleFromUser } from '../context/role'
import { isNativeApp } from './native'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

let initialized = false
let swReg = null
let audioCtx = null
let sesionActual = null

// ── Roles que reciben avisos ────────────────────────────────────────────────
export function rolRecibeNotifs(role) {
  return role === 'cocina' || role === 'mozo' || role === 'admin'
}

// ── Audio (beep propio, para primer plano) ──────────────────────────────────
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* sin audio */ }
}

function sonar() {
  try {
    ensureAudio()
    if (!audioCtx) return
    const t0 = audioCtx.currentTime
    ;[[880, 0], [1175, 0.18], [880, 0.36]].forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.4, t0 + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.3)
      osc.start(t0 + delay)
      osc.stop(t0 + delay + 0.32)
    })
  } catch { /* sin audio */ }
}

async function notificar(title, body, { tag, url } = {}) {
  sonar()
  try { navigator.vibrate?.([300, 120, 300]) } catch { /* sin vibración */ }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: tag || `kiku-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 300],
    data: { url: url || '/' },
  }
  try {
    if (swReg) await swReg.showNotification(title, opts)
    else new Notification(title, opts)
  } catch {
    try { new Notification(title, opts) } catch { /* sin soporte */ }
  }
}

// ── Web Push: suscripción ───────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function bufToB64u(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Crea (o reutiliza) la suscripción Web Push y la guarda en `web_push_subs`.
 * Requiere permiso ya concedido. Devuelve true si quedó suscripto.
 */
export async function suscribirPush(session = sesionActual) {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[notifs] falta VITE_VAPID_PUBLIC_KEY: no hay push con la app cerrada')
    return false
  }
  if (!session?.user || !swReg || typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') return false

  try {
    let sub = await swReg.pushManager.getSubscription()
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const json = sub.toJSON()
    const { error } = await supabase.from('web_push_subs').upsert({
      endpoint: sub.endpoint,
      user_id: session.user.id,
      role: getRoleFromUser(session.user),
      p256dh: json.keys?.p256dh ?? bufToB64u(sub.getKey('p256dh')),
      auth: json.keys?.auth ?? bufToB64u(sub.getKey('auth')),
      user_agent: navigator.userAgent.slice(0, 300),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

    if (error) {
      console.warn('[notifs] no se pudo guardar la suscripción:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[notifs] error suscribiendo a push:', e)
    return false
  }
}

/**
 * Pide permiso (tiene que llamarse desde un click) y deja todo suscripto.
 * Devuelve { permiso, push }:
 *   permiso: 'granted' | 'denied' | 'default' | 'no-soportado'
 *   push:    true si además quedó la suscripción Web Push (celu bloqueado).
 *
 * Los dos datos son distintos a propósito. El permiso alcanza para que suene
 * con la app abierta; SIN la suscripción push no suena con el celu bloqueado,
 * que es justamente el caso que importa en el salón. Antes esto se devolvía
 * como un solo 'granted' y un fallo de push quedaba invisible.
 */
export async function activarNotificaciones() {
  if (typeof Notification === 'undefined') return { permiso: 'no-soportado', push: false }
  ensureAudio()

  let permiso = Notification.permission
  if (permiso === 'default') {
    permiso = await Notification.requestPermission()
  }
  if (permiso !== 'granted') return { permiso, push: false }

  if (!swReg && 'serviceWorker' in navigator) {
    try { swReg = await navigator.serviceWorker.register('/sw.js') } catch { /* sin SW */ }
  }
  const push = await suscribirPush()

  await notificar(
    push ? '✅ Notificaciones activadas' : '⚠️ Notificaciones a medias',
    push
      ? 'Vas a recibir los avisos aunque el celular esté bloqueado.'
      : 'Solo van a sonar con la app abierta. Avisale a Manu.',
    { tag: 'kiku-test' },
  )
  return { permiso: 'granted', push }
}

export function estadoNotificaciones() {
  if (typeof Notification === 'undefined') return 'no-soportado'
  return Notification.permission
}

/**
 * Diagnóstico: ¿este teléfono va a sonar con la pantalla bloqueada?
 * Devuelve 'ok' | 'sin-clave' | 'sin-sw' | 'sin-suscripcion' | 'sin-permiso'.
 */
export async function diagnosticoPush() {
  if (typeof Notification === 'undefined') return 'sin-permiso'
  if (Notification.permission !== 'granted') return 'sin-permiso'
  if (!VAPID_PUBLIC_KEY) return 'sin-clave'
  if (!('serviceWorker' in navigator)) return 'sin-sw'
  try {
    const reg = swReg || await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return 'sin-sw'
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'ok' : 'sin-suscripcion'
  } catch {
    return 'sin-suscripcion'
  }
}

// ── Realtime (refuerzo con la pestaña abierta) ──────────────────────────────
function suscribirRealtime(role) {
  const notificaNuevos = role === 'cocina' || role === 'admin'
  const notificaListos = role === 'mozo' || role === 'admin'
  const channel = supabase.channel('web-notifs')

  if (notificaNuevos) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        const p = payload.new || {}
        const shortId = String(p.id || '').slice(-4).toUpperCase()
        notificar(
          '🔥 Nuevo pedido',
          p.mesa ? `Mesa ${p.mesa} hizo un pedido` : `Pedido #${shortId} (${p.canal || 'mostrador'})`,
          { tag: `pedido-${p.id}`, url: '/operaciones' },
        )
      },
    )
  }

  if (notificaListos) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      (payload) => {
        const p = payload.new || {}
        if (p.estado !== 'listo' || payload.old?.estado === 'listo') return
        const shortId = String(p.id || '').slice(-4).toUpperCase()
        notificar(
          '🍣 Listo para servir',
          p.mesa ? `Mesa ${p.mesa}: platos listos` : `Pedido #${shortId} listo para entregar`,
          { tag: `pedido-${p.id}`, url: '/platos' },
        )
      },
    )
  }

  channel.subscribe()
}

/**
 * Punto de entrada. Llamar una vez cuando hay sesión.
 * En la app nativa no hace nada (de eso se encarga native.js).
 */
export async function initWebNotifs(session) {
  if (initialized || !session || typeof window === 'undefined' || isNativeApp()) return
  initialized = true
  sesionActual = session

  const role = getRoleFromUser(session.user)
  if (!rolRecibeNotifs(role)) return

  if ('serviceWorker' in navigator) {
    try { swReg = await navigator.serviceWorker.register('/sw.js') } catch { /* sin SW */ }
  }

  // Si el permiso ya estaba dado (celular que se usa todos los días), la
  // suscripción se renueva sola en cada arranque: los endpoints caducan.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    await suscribirPush(session)
  }

  // El audio del navegador queda bloqueado hasta el primer toque.
  const primerGesto = () => {
    ensureAudio()
    window.removeEventListener('pointerdown', primerGesto)
  }
  window.addEventListener('pointerdown', primerGesto)

  suscribirRealtime(role)
}
