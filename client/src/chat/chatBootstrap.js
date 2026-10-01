import {
    listChatRecoveryForThread,
    outboxEntryToLocalMessage,
    purgeChatDeliveryEntry,
} from '../chatOutbox.js'
import { bootstrapThreadRows } from '../chatSendPipeline.js'
import { isTestChatMessageText } from '../firebase.js'
import { mergeMessagesByClientId } from './chatMerge.js'
import { ensureChatStorageReady } from './chatStorageInit.js'
import { loadConversationMessagesLocalFirst } from './chatSync.js'

export function recoveryRowsForConversation(conversationId, guestUserId = '') {
  const threadId = String(conversationId || '').trim()
  if (!threadId) return []
  const rows = []
  for (const entry of listChatRecoveryForThread(threadId, guestUserId)) {
    const body = String(entry?.text || entry?.sticker || '').trim()
    if (isTestChatMessageText(body) && !String(entry?.serverId || '').trim()) {
      purgeChatDeliveryEntry(entry.clientId)
      continue
    }
    const local = outboxEntryToLocalMessage(entry)
    if (local) rows.push({ ...local, pending: !entry.serverId, sendFailed: entry.status === 'failed' })
  }
  return rows
}

/** Sync paint: memory → IndexedDB mirror → outbox recovery. */
export function bootstrapConversationRowsSync({
  conversationId,
  relatedIds = [],
  memoryCache,
  guestUserId = '',
}) {
  const recoveryRows = recoveryRowsForConversation(conversationId, guestUserId)
  return bootstrapThreadRows({
    threadId: conversationId,
    relatedIds,
    memoryCache,
    recoveryRows,
  })
}

/** Local-first open: Dexie + merge with recovery (never blind replace). */
export async function bootstrapConversationRowsAsync(options) {
  await ensureChatStorageReady()
  const sync = bootstrapConversationRowsSync(options)
  const fromStore = await loadConversationMessagesLocalFirst({
    conversationId: options.conversationId,
    relatedIds: options.relatedIds,
    memoryCache: options.memoryCache,
    recoveryRows: recoveryRowsForConversation(options.conversationId, options.guestUserId),
  })
  if (!fromStore.length) return sync
  return mergeMessagesByClientId(sync, fromStore)
}
