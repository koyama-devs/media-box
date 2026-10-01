/**
 * App bootstrap for Dexie chat storage (IndexedDB).
 * Chat data no longer uses localStorage as primary — see src/storage/.
 */

import { hydrateMessageStore, loadThreadMessages, loadThreadMessagesSync, saveThreadMessages } from '../storage/messageStore.js'
import { hydrateOutboxStore, LEGACY_OUTBOX_LS_KEY } from '../storage/outboxStore.js'

export async function initChatLocalDb(options = {}) {
  if (typeof window === 'undefined') return
  const migrateOutboxKey = options.migrateOutboxKey || LEGACY_OUTBOX_LS_KEY
  if (migrateOutboxKey && migrateOutboxKey !== LEGACY_OUTBOX_LS_KEY) {
    try {
      const legacy = window.localStorage.getItem(migrateOutboxKey)
      if (legacy && !window.localStorage.getItem(LEGACY_OUTBOX_LS_KEY)) {
        window.localStorage.setItem(LEGACY_OUTBOX_LS_KEY, legacy)
      }
    } catch {
      /* ignore */
    }
  }
  await hydrateOutboxStore()
  await hydrateMessageStore()
}

export async function loadThreadMessagesFromIdb(threadId) {
  return loadThreadMessages(threadId)
}

export function loadThreadMessagesFromIdbSync(threadId) {
  return loadThreadMessagesSync(threadId)
}

export async function saveThreadMessagesToIdb(threadId, messages) {
  await saveThreadMessages(threadId, messages)
}

export { loadConversationSyncState, saveConversationSyncState } from '../storage/conversationStore.js'

