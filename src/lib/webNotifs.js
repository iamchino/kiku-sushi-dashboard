// ────────────────────────────────────────────────────────────────────────────
// Notificaciones para el dashboard EN EL NAVEGADOR (el teléfono de cocina
// abre la web, no la app nativa). Espejo web de src/lib/native.js:
//
//   cocina / admin: INSERT en pedidos          → "🔥 Nuevo pedido" + sonido
//   mozo   / admin: pedido pasa a 'listo'      → "🍣 Pedido listo" + sonido
//
// Funciona mientras el navegador esté abierto (la pestaña puede estar en
// segundo plano). Con el navegador cerrado hace falta el push real (FCM),
// que ya existe en la edge function push-pedidos + la app Android.
//
// Los navegadores exigen un gesto del usuario para permitir notificaciones
// y para desbloquear el audio: se piden en el primer toque en la pantalla.
// En Android Chrome `new Notification()` no existe: hay que pasar por un
// service worker (public/sw.js) y reg.showNotification().
// ────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import { getRoleFromUser } from '../context/role'
import { isNativeApp } from './native'

let initialized = false
let swReg = null
let audioCtx = null

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

async function notificar(title, body) {
  sonar()
  try { navigator.vibrate?.([220, 100, 220]) } catch { /* sin vibración */ }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: `pedidos-${Date.now()}`,
    vibrate: [220, 100, 220],
  }
  try {
    if (swReg) await swReg.showNotification(title, opts)
    else new Notification(title, opts)
  } catch {
    try { new Notification(title, opts) } catch { /* sin soporte */ }
  }
}

/**
 * Punto de entrada. Llamar una vez cuando hay sesión.
 * En la app nativa no hace nada (de eso se encarga native.js).
 */
export async function initWebNotifs(session) {
  if (initialized || !session || typeof window === 'undefined' || isNativeApp()) return
  initialized = true

  const role = getRoleFromUser(session.user)
  const notificaNuevos = role === 'cocina' || role === 'admin'
  const notificaListos = role === 'mozo' || role === 'admin'
  if (!notificaNuevos && !notificaListos) return

  if ('serviceWorker' in navigator) {
    try { swReg = await navigator.serviceWorker.register('/sw.js') } catch { /* sin SW */ }
  }

  // Permiso de notificaciones + desbloqueo de audio: en el primer toque.
  const primerGesto = () => {
    ensureAudio()
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    window.removeEventListener('pointerdown', primerGesto)
  }
  window.addEventListener('pointerdown', primerGesto)

  const channel = supabase.channel('web-notifs')

  if (notificaNuevos) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        const mesa = payload.new?.mesa
        notificar(
          '🔥 Nuevo pedido',
          mesa ? `Mesa ${mesa} hizo un pedido` : `Pedido nuevo (${payload.new?.canal || 'mostrador'})`,
        )
      },
    )
  }

  if (notificaListos) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      (payload) => {
        if (payload.new?.estado === 'listo' && payload.old?.estado !== 'listo') {
          const mesa = payload.new?.mesa
          notificar(
            '🍣 Pedido listo',
            mesa ? `Mesa ${mesa}: platos listos para servir` : 'Pedido listo para entregar',
          )
        }
      },
    )
  }

  channel.subscribe()
}
