/**
 * Home-screen / taskbar unread badge.
 * Works for installed PWAs (iOS 16.4+ Home Screen web apps, desktop Chrome/Edge)
 * and needs a registered service worker.
 */
export function setAppUnreadBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))

  try {
    if (n > 0) {
      if (typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
        void navigator.setAppBadge(n).catch(() => {})
      }
    } else if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
      void navigator.clearAppBadge().catch(() => {})
    }
  } catch {
    /* unsupported */
  }

  // Some platforms only honour badge calls made from the service worker.
  try {
    navigator.serviceWorker?.ready
      ?.then((registration) => registration.active?.postMessage({ type: 'badge', count: n }))
      ?.catch(() => {})
  } catch {
    /* ignore */
  }

  // Capacitor native shell (if a Badge plugin is added later).
  try {
    const Badge = window.Capacitor?.Plugins?.Badge
    if (Badge) {
      if (n > 0) void Badge.set?.({ count: n })
      else void Badge.clear?.()
    }
  } catch {
    /* ignore */
  }
}

export function clearAppUnreadBadge() {
  setAppUnreadBadge(0)
}
