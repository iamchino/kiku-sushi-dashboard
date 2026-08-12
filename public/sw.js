// Service worker mínimo: existe solo para poder mostrar notificaciones en
// Android Chrome (que no soporta `new Notification()` desde la página).
// No cachea nada ni intercepta requests.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const abierta = list.find((c) => 'focus' in c)
      if (abierta) return abierta.focus()
      return self.clients.openWindow('/')
    }),
  )
})
