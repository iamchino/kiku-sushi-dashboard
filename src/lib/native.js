// ────────────────────────────────────────────────────────────────────────────
// Integraciones nativas (Capacitor). En el navegador todo esto es un no-op,
// así que el dashboard web sigue funcionando exactamente igual.
//
// En la app Android:
//   • Configura status bar y oculta el splash.
//   • Registra el dispositivo para push (FCM) y guarda el token en
//     public.device_tokens (lo usa la edge function push-pedidos).
//   • Dispara notificaciones locales (sonido + vibración) vía realtime:
//       - mozo:   pedido pasa a "listo"  → "🍣 Pedido listo para servir"
//       - cocina: pedido nuevo → "🔥 Nuevo pedido"
// ────────────────────────────────────────────────────────────────────────────
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'
import { getRoleFromUser } from '../context/role'

let initialized = false
let notifId = 1

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

async function setupStatusBar() {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0b0b0d' })
  } catch { /* plugin no disponible */ }
}

async function hideSplash() {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch { /* plugin no disponible */ }
}

async function setupLocalNotifications() {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const perm = await LocalNotifications.requestPermissions()
  return perm.display === 'granted' ? LocalNotifications : null
}

async function notify(LocalNotifications, { title, body }) {
  if (!LocalNotifications) return
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId++,
        title,
        body,
        schedule: { at: new Date(Date.now() + 100) },
        sound: 'default',
      }],
    })
  } catch (e) {
    console.warn('[native] error al notificar:', e)
  }
}

async function setupPush(session) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    // Canal Android para los push de pedidos (lo usa la edge function).
    try {
      await PushNotifications.createChannel({
        id: 'pedidos',
        name: 'Pedidos',
        description: 'Pedidos nuevos y platos listos',
        importance: 5,
        sound: 'default',
        vibration: true,
      })
    } catch { /* canal ya existe */ }

    PushNotifications.addListener('registration', async ({ value: token }) => {
      const user = session?.user
      if (!user || !token) return
      await supabase.from('device_tokens').upsert({
        user_id: user.id,
        token,
        platform: 'android',
        role: getRoleFromUser(user),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[native] error registrando push:', err)
    })

    await PushNotifications.register()
  } catch (e) {
    console.warn('[native] push no disponible:', e)
  }
}

function subscribeRealtime(role, LocalNotifications) {
  const channel = supabase.channel('native-notifs')

  if (role === 'mozo' || role === 'admin') {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      (payload) => {
        const antes = payload.old?.estado
        const ahora = payload.new?.estado
        if (ahora === 'listo' && antes !== 'listo') {
          const mesa = payload.new?.mesa
          notify(LocalNotifications, {
            title: '🍣 Pedido listo',
            body: mesa ? `Mesa ${mesa}: platos listos para servir` : 'Pedido listo para entregar',
          })
        }
      }
    )
  }

  if (role === 'cocina' || role === 'admin') {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        const mesa = payload.new?.mesa
        notify(LocalNotifications, {
          title: '🔥 Nuevo pedido',
          body: mesa ? `Mesa ${mesa} hizo un pedido` : `Pedido nuevo (${payload.new?.canal || 'mostrador'})`,
        })
      }
    )
  }

  channel.subscribe()
}

/**
 * Punto de entrada. Llamar una vez cuando hay sesión.
 * En web no hace nada.
 */
export async function initNative(session) {
  if (!isNativeApp() || initialized || !session) return
  initialized = true

  await setupStatusBar()
  await hideSplash()

  const LocalNotifications = await setupLocalNotifications()
  const role = getRoleFromUser(session.user)
  subscribeRealtime(role, LocalNotifications)

  await setupPush(session)
}
