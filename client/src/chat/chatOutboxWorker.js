/**
 * Background delivery queue — exponential backoff, survives offline / app restart.
 */

export function outboxRetryDelayMs(retryCount = 0) {
  const n = Math.max(0, Math.floor(Number(retryCount) || 0))
  return Math.min(1000 * (2 ** n), 60_000)
}

export function isOutboxEntryDue(entry, nowMs = Date.now()) {
  if (!entry?.clientId) return false
  const next = Number(entry.nextRetryAt) || 0
  return next <= nowMs
}

export function markOutboxSending(entry) {
  return {
    ...entry,
    status: 'sending',
    lastAttemptAtIso: new Date().toISOString(),
  }
}

export function markOutboxFailed(entry) {
  const retryCount = Math.max(0, Math.floor(Number(entry?.retryCount) || 0)) + 1
  return {
    ...entry,
    status: 'failed',
    retryCount,
    nextRetryAt: Date.now() + outboxRetryDelayMs(retryCount),
    lastAttemptAtIso: new Date().toISOString(),
  }
}

export function markOutboxPending(entry) {
  return {
    ...entry,
    status: entry?.status || 'pending',
    retryCount: entry?.retryCount || 0,
    nextRetryAt: entry?.nextRetryAt || 0,
  }
}

/**
 * @param {{ flush: () => void | Promise<void>, intervalMs?: number }} options
 * @returns {() => void} stop
 */
export function startChatOutboxWorker({ flush, intervalMs = 8000 } = {}) {
  if (typeof window === 'undefined' || typeof flush !== 'function') return () => {}
  let active = true
  const run = () => {
    if (!active) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void Promise.resolve(flush()).catch(() => {})
  }
  run()
  const timer = window.setInterval(run, Math.max(3000, intervalMs))
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run()
  })
  return () => {
    active = false
    window.clearInterval(timer)
    window.removeEventListener('online', run)
  }
}
