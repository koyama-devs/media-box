/**
 * Open conversation: local-first bootstrap, then realtime listener (via UI hooks).
 */

import { bootstrapThreadRows, loadThreadMessageCache } from '../chatSendPipeline.js'
import { loadThreadMessages } from '../storage/messageStore.js'
import { mergeMessagesByClientId } from './chatMerge.js'

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

export { loadThreadMessageCache }

