/** Stable client-side id for idempotent Firestore writes (doc id = clientId). */

export function newClientMessageId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
