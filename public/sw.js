// ────────────────────────────────────────────────────────────────────────────
// Service worker del dashboard.
//
// Dos trabajos:
//   1. Mostrar notificaciones pedidas por la página (Android Chrome no soporta
//      `new Notification()` desde la página; hay que pasar por el SW).
//   2. Recibir Web Push de la edge function `push-web` — esto es lo que hace
//      que suene el celular con Chrome cerrado y la pantalla bloqueada.
//
// No cachea nada ni intercepta requests: el dashboard necesita datos frescos.
// ────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Kiku', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || '🔔 Kiku'
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    // `tag` por pedido: si llega el mismo aviso dos veces (push + realtime),
    // Android reemplaza la notificación en vez de apilar dos.
    tag: data.tag || `kiku-${Date.now()}`,
    renotify: true,
    requireInteraction: true,   // no se autodescarta: el mozo la tiene que ver
    vibrate: [300, 120, 300, 120, 300],
    silent: false,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Click en la notificación → abrir/enfocar la pantalla correspondiente ────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(destino).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})

// La suscripción push puede rotar sola: avisamos a la página para que la
// vuelva a guardar en Supabase la próxima vez que se abra.
self.addEventListener('pushsubscriptionchange', () => {
  self.registration.showNotification('Kiku', {
    body: 'Reabrí la app para reactivar las notificaciones.',
    icon: '/favicon.svg',
    tag: 'kiku-resuscribir',
  })
})
