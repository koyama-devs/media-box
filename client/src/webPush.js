/**
 * Foreground FCM messages (tab open) never hit the service worker.
 * Dispatch a DOM event so HanaChat can show an in-app preview banner.
 */
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { app, savePushToken } from './firebase'

const VAPID_KEY = String(import.meta.env.VITE_FCM_VAPID_KEY || '').trim()

let registrationPromise = null
let foregroundBound = false

/** Register the app service worker (needed for badges and background push). */
export function registerAppServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((error) => {
        console.warn('[push] service worker register failed', error)
        return null
      })
  }
  return registrationPromise
}

function emitForegroundPush(payload = {}) {
  if (typeof window === 'undefined') return
  const notification = payload.notification || {}
  const data = payload.data || {}
  const detail = {
    title: String(notification.title || data.title || 'Hana Mediabox'),
    body: String(notification.body || data.body || '新しいメッセージ'),
    threadId: String(data.threadId || ''),
    type: String(data.type || 'chat'),
    sender: String(data.sender || ''),
  }
  window.dispatchEvent(new CustomEvent('hana-chat-push', { detail }))
}

/** Listen for FCM while the page is open (OS banner is skipped in foreground). */
export function bindForegroundPush() {
  if (typeof window === 'undefined' || window.__HANA_CAPACITOR__) return
  if (foregroundBound) return
  foregroundBound = true

  void (async () => {
    try {
      if (!(await isSupported().catch(() => false))) return
      if (!VAPID_KEY) return
      const messaging = getMessaging(app)
      onMessage(messaging, (payload) => {
        emitForegroundPush(payload || {})
        // Also surface a system notification when permission allows — helpful if
        // the tab is open but the window is not focused.
        if (
          typeof Notification !== 'undefined'
          && Notification.permission === 'granted'
          && typeof document !== 'undefined'
          && document.visibilityState === 'hidden'
        ) {
          const n = payload?.notification || {}
          const d = payload?.data || {}
          try {
            const note = new Notification(String(n.title || d.title || 'Hana Mediabox'), {
              body: String(n.body || d.body || '新しいメッセージ'),
              icon: '/favicon.svg',
              tag: d.threadId ? `chat-${d.threadId}` : 'chat',
            })
            note.onclick = () => {
              window.focus()
              note.close()
            }
          } catch {
            /* ignore */
          }
        }
      })
    } catch (error) {
      console.warn('[push] foreground bind failed', error)
    }
  })()
}

async function storeWebToken(userKey, permissionPromise) {
  const key = String(userKey || '').trim()
  if (!key) return null

  const permission = permissionPromise
    ? await permissionPromise.catch(() => 'denied')
    : Notification.permission
  if (permission !== 'granted') return null

  if (!VAPID_KEY) {
    console.info('[push] VITE_FCM_VAPID_KEY missing — web push disabled')
    return null
  }
  if (!(await isSupported().catch(() => false))) return null

  const registration = await registerAppServiceWorker()
  if (!registration) return null

  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) return null

  await savePushToken({ userKey: key, token, platform: 'web' })
  bindForegroundPush()
  return token
}

/**
 * Store the FCM web token so Cloud Functions can push while the app is closed.
 * Safari only honours Notification.requestPermission() when it is called
 * directly inside the click handler, so the prompt starts before any await.
 */
export function ensureWebPush(userKey, { requestPermission = false } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve(null)
  // The native shell registers its own token through Capacitor.
  if (window.__HANA_CAPACITOR__) return Promise.resolve(null)

  let permissionPromise = null
  try {
    if (requestPermission && Notification.permission === 'default') {
      permissionPromise = Promise.resolve(Notification.requestPermission())
    }
  } catch (error) {
    console.warn('[push] permission prompt failed', error)
  }

  return storeWebToken(userKey, permissionPromise).catch((error) => {
    console.warn('[push] web token failed', error)
    return null
  })
}
