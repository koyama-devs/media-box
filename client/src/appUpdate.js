/* global __APP_BUILD_ID__ */

const VERSION_URL = '/version.json'
const RELOAD_FLAG = 'hana-app-reload-for-update'
const KNOWN_VERSION_KEY = 'hana-app-build-id'

function currentBuildId() {
  try {
    return String(__APP_BUILD_ID__ || '').trim()
  } catch {
    return ''
  }
}

async function fetchRemoteVersion() {
  const url = `${VERSION_URL}?t=${Date.now()}`
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`version fetch ${response.status}`)
  const data = await response.json()
  return String(data?.version || '').trim()
}

function hardReloadForUpdate(remoteVersion) {
  try {
    sessionStorage.setItem(RELOAD_FLAG, remoteVersion || '1')
    if (remoteVersion) localStorage.setItem(KNOWN_VERSION_KEY, remoteVersion)
  } catch {
    /* private mode */
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_app', remoteVersion || String(Date.now()))
  // Replace so the update token does not stack in history.
  window.location.replace(url.toString())
}

function clearReloadArtifacts() {
  try {
    const flag = sessionStorage.getItem(RELOAD_FLAG)
    if (flag) sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* ignore */
  }

  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('_app')) {
      url.searchParams.delete('_app')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ask the service worker to activate immediately, then reload clients.
 */
function wireServiceWorkerUpdates(registration) {
  if (!registration) return

  const requestSkipWaiting = (worker) => {
    try {
      worker?.postMessage?.({ type: 'SKIP_WAITING' })
    } catch {
      /* ignore */
    }
  }

  if (registration.waiting) {
    requestSkipWaiting(registration.waiting)
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        requestSkipWaiting(worker)
      }
    })
  })

  // A newly activated worker means this tab is still on old JS — reload once.
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    if (!navigator.serviceWorker.controller) return
    refreshing = true
    try {
      sessionStorage.setItem(RELOAD_FLAG, 'sw')
    } catch {
      /* ignore */
    }
    window.location.reload()
  })

  const check = () => {
    registration.update().catch(() => {})
  }

  // Home-screen apps often stay alive — recheck when returning to the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('focus', check)
  // Also poll occasionally while open.
  window.setInterval(check, 5 * 60 * 1000)
  check()
}

/**
 * Before painting the app: detect a newer deploy and reload onto it.
 * Especially important for iOS/Android home-screen shortcuts that cannot F5.
 */
export async function prepareAppLaunch() {
  if (typeof window === 'undefined') return { updated: false }

  let alreadyReloading = false
  try {
    alreadyReloading = Boolean(sessionStorage.getItem(RELOAD_FLAG))
  } catch {
    alreadyReloading = false
  }
  if (alreadyReloading) {
    clearReloadArtifacts()
  }

  const localVersion = currentBuildId()
  if (localVersion) {
    try {
      localStorage.setItem(KNOWN_VERSION_KEY, localVersion)
    } catch {
      /* ignore */
    }
  }

  // Version check: always for standalone; also useful in browser tabs.
  if (!alreadyReloading) {
    try {
      const remoteVersion = await Promise.race([
        fetchRemoteVersion(),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error('version timeout')), 4000)
        }),
      ])
      if (remoteVersion && localVersion && remoteVersion !== localVersion) {
        hardReloadForUpdate(remoteVersion)
        // Keep the promise pending — the page is navigating away.
        return new Promise(() => {})
      }
    } catch (error) {
      // Offline / first deploy without version.json — continue with current bundle.
      console.info('[update] version check skipped', error?.message || error)
    }
  }

  // Always keep the service worker fresh so push + home-screen launches stay current.
  try {
    if ('serviceWorker' in navigator) {
      const { registerAppServiceWorker } = await import('./webPush')
      const registration = await registerAppServiceWorker()
      wireServiceWorkerUpdates(registration)
    }
  } catch (error) {
    console.warn('[update] service worker wire failed', error)
  }

  return { updated: false, version: localVersion }
}
