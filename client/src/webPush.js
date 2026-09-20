/**
 * Foreground FCM messages (tab open) never hit the service worker.
 * Dispatch a DOM event so HanaChat can show an in-app preview banner.
 */
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { app, savePushToken } from './firebase'

const VAPID_KEY = String(import.meta.env.VITE_FCM_VAPID_KEY || '').trim()

let registrationPromise = null
let foregroundBound = false

function isAndroidWeb() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
}

function debugLogAndroid(message, payload = {}) {
  if (!isAndroidWeb()) return
  console.info(`[push][android] ${message}`, payload)
}

/** Register the app service worker (needed for badges and background push). */
export function registerAppServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    debugLogAndroid('serviceWorker unavailable in browser')
    return Promise.resolve(null)
  }
  if (!registrationPromise) {
    debugLogAndroid('registering service worker', { scope: '/', url: location.href })
    registrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        debugLogAndroid('service worker registration resolved', {
          activeState: registration?.active?.state,
          waitingState: registration?.waiting?.state,
          installingState: registration?.installing?.state,
        })
        try {
          await navigator.serviceWorker.ready
          debugLogAndroid('service worker ready')
        } catch (error) {
          debugLogAndroid('service worker ready wait failed', { error: String(error?.message || error) })
          // The registration is still valid; keep the browser's latest worker.
        }
        return registration
      })
      .catch((error) => {
        console.warn('[push] service worker register failed', error)
        debugLogAndroid('service worker register failed', { error: String(error?.message || error) })
        return null
      })
  }

  return registrationPromise.then(async (registration) => {
    if (!registration) return null
    try {
      await navigator.serviceWorker.ready
      debugLogAndroid('sw ready after registration promise')
    } catch (error) {
      debugLogAndroid('sw ready after registration promise wait failed', { error: String(error?.message || error) })
      // Some Android browsers resolve the SW a moment later than the initial call.
    }
    return registration
  })
}

async function awaitReadyServiceWorkerRegistration() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const registration = await registerAppServiceWorker()
      debugLogAndroid('awaitReadyServiceWorkerRegistration attempt', {
        attempt: attempt + 1,
        hasRegistration: Boolean(registration),
      })
      if (registration) return registration
    } catch (error) {
      debugLogAndroid('awaitReadyServiceWorkerRegistration catch', {
        attempt: attempt + 1,
        error: String(error?.message || error),
      })
      // Retry a few times because Android can return before the SW becomes active.
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
  return null
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

  debugLogAndroid('permission state before token store', {
    userKey: key,
    permission,
    hasVapidKey: Boolean(VAPID_KEY),
    userAgent: navigator?.userAgent || '',
  })

  if (permission !== 'granted') return null

  if (!VAPID_KEY) {
    console.info('[push] VITE_FCM_VAPID_KEY missing — web push disabled')
    debugLogAndroid('VAPID key missing, web push disabled')
    return null
  }
  if (!(await isSupported().catch(() => false))) {
    debugLogAndroid('FCM not supported in this browser')
    return null
  }

  const registration = await awaitReadyServiceWorkerRegistration()
  if (!registration) {
    debugLogAndroid('no service worker registration ready for token fetch', { userKey: key })
    return null
  }

  let token = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      debugLogAndroid('requesting FCM token', {
        userKey: key,
        attempt: attempt + 1,
        vapidKeyLength: VAPID_KEY.length,
      })
      token = await getToken(getMessaging(app), {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      })
      debugLogAndroid('FCM token result', {
        userKey: key,
        attempt: attempt + 1,
        hasToken: Boolean(token),
        tokenPreview: token ? `${token.slice(0, 16)}…` : '',
      })
      if (token) break
    } catch (error) {
      console.warn('[push] getToken attempt failed', attempt + 1, error)
      debugLogAndroid('FCM token generation failed', {
        userKey: key,
        attempt: attempt + 1,
        error: String(error?.message || error),
      })
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  if (!token) {
    debugLogAndroid('no token produced after attempts', { userKey: key })
    return null
  }

  await savePushToken({ userKey: key, token, platform: 'web' })
  debugLogAndroid('push token saved to Firestore', { userKey: key, tokenPreview: `${token.slice(0, 16)}…` })
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
  if (window.__HANA_CAPACITOR__) {
    debugLogAndroid('skipped web push because native Capacitor bridge owns notifications')
    return Promise.resolve(null)
  }

  debugLogAndroid('ensureWebPush called', {
    userKey: String(userKey || '').trim(),
    requestPermission,
    notificationPermission: Notification.permission,
    isAndroid: isAndroidWeb(),
  })

  let permissionPromise = null
  try {
    if (requestPermission && Notification.permission === 'default') {
      debugLogAndroid('requesting Notification permission', { userKey: String(userKey || '').trim() })
      permissionPromise = Promise.resolve(Notification.requestPermission())
    }
  } catch (error) {
    console.warn('[push] permission prompt failed', error)
    debugLogAndroid('permission prompt failed', { error: String(error?.message || error) })
  }

  return storeWebToken(userKey, permissionPromise).catch((error) => {
    console.warn('[push] web token failed', error)
    debugLogAndroid('web token failed', { error: String(error?.message || error) })
    return null
  })
}
