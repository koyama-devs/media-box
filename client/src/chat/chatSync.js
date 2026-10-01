/**
 * Open conversation: local-first bootstrap, server merge, then realtime listener (UI hooks).
 *
 * OPEN CHAT flow (all guests, same path):
 * conversationId → IndexedDB/memory → render → fetch Firestore → merge by clientMessageId
 * → save IndexedDB → onSnapshot listener continues merge (never blind replace).
 */

import {
    applyChatMessageSnapshot,
    bootstrapThreadRows,
    loadThreadMessageCache,
} from '../chatSendPipeline.js'
import { loadThreadMessages, saveThreadMessages } from '../storage/messageStore.js'
import { normalizeConversationId } from './chatIdentity.js'
import { mergeMessagesByClientId } from './chatMerge.js'
import { fetchChatMessages } from './chatRepository.js'

export async function loadConversationMessagesLocalFirst({
  conversationId,
  relatedIds = [],
  memoryCache,
  recoveryRows = [],
}) {
  const id = String(conversationId || '').trim()
  if (!id) return []
  const fromIdb = await loadThreadMessages(id)
  if (fromIdb?.length) {
    return mergeMessagesByClientId(recoveryRows, fromIdb)
  }
  return bootstrapThreadRows({
    threadId: id,
    relatedIds,
    memoryCache,
    recoveryRows,
  })
}

export function mergeLiveSnapshot({ localRows, serverRows, previousUiRows }) {
  const base = mergeMessagesByClientId(localRows, serverRows)
  const prev = previousUiRows || []
  const pending = prev.filter((m) => m?.pending || m?.sendFailed || m?.status === 'pending' || m?.status === 'failed')
  if (!pending.length) return base
  return mergeMessagesByClientId(pending, base)
}

/**
 * One-shot server sync after local paint. Keeps pending/outbox rows; persists merge to Dexie.
 */
export async function syncConversationMessagesFromServer({
  conversationId,
  guestUserId = '',
  previousUiRows = [],
  deletingIds = new Set(),
}) {
  const logicalId = normalizeConversationId(conversationId) || String(conversationId || '').trim()
  if (!logicalId) return previousUiRows || []
  let serverRows = []
  try {
    serverRows = await fetchChatMessages(logicalId, guestUserId)
  } catch {
    return previousUiRows || []
  }
  const merged = applyChatMessageSnapshot({
    serverRows,
    previous: previousUiRows,
    deletingIds,
    threadId: logicalId,
    guestKey: guestUserId,
  })
  try {
    await saveThreadMessages(logicalId, merged)
  } catch {
    /* memory + outbox still hold pending */
  }
  return merged
}

export { loadThreadMessageCache }

