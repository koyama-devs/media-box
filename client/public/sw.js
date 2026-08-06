/* Hana Mediabox service worker.
   Required for navigator.setAppBadge() and for push while the app is closed.
   Handles the raw Web Push event so no extra SDK has to be fetched here. */

const APP_URL = '/'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function applyBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  try {
    if (n > 0 && typeof self.navigator?.setAppBadge === 'function') {
      return self.navigator.setAppBadge(n).catch(() => {})
    }
    if (typeof self.navigator?.clearAppBadge === 'function') {
      return self.navigator.clearAppBadge().catch(() => {})
    }
  } catch {
    /* unsupported */
  }
  return Promise.resolve()
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const data = payload.data || {}
  const notification = payload.notification || {}
  // FCM sometimes nests fields; also accept flat payloads.
  const title = notification.title || data.title || payload.title || 'Hana Mediabox'
  const body = notification.body || data.body || payload.body || '新しいメッセージ'
  const threadId = String(data.threadId || payload.threadId || '')

  event.waitUntil((async () => {
    const badgeRaw = data.badge
    const badgeCount = badgeRaw === undefined || badgeRaw === ''
      ? 1
      : Number(badgeRaw)
    await applyBadge(badgeCount)

    // If a visible client is already showing an in-app banner, still notify —
    // renotify + tag keeps OS tray tidy per thread.
    await self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: threadId ? `chat-${threadId}` : 'chat',
      renotify: true,
      data: { url: APP_URL, threadId },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url.includes(self.location.origin))
    if (existing) {
      await existing.focus()
      return
    }
    await self.clients.openWindow(APP_URL)
  })())
})

// The page keeps the badge in sync while it is open.
self.addEventListener('message', (event) => {
  const message = event.data || {}
  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (message.type === 'badge') {
    event.waitUntil(applyBadge(message.count))
  }
})
