import { initChatLocalDb } from './chatLocalDb.js'

let storageReadyPromise = null

/** One-time Dexie hydrate + legacy localStorage migration (app-wide). */
export function ensureChatStorageReady() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (!storageReadyPromise) {
    storageReadyPromise = initChatLocalDb({
      migrateOutboxKey: 'hana-chat-outbox-v1',
      migrateMessagePrefix: 'hana-chat-message-cache-v1:',
    }).catch(() => {})
  }
  return storageReadyPromise
}

export function resetChatStorageInitForTests() {
  storageReadyPromise = null
}
