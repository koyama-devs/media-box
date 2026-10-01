import { chatDb } from './db.js'

export async function saveConversationSyncState(conversationId, state = {}) {
  const id = String(conversationId || '').trim()
  if (!id || typeof indexedDB === 'undefined') return
  try {
    await chatDb.syncState.put({
      conversationId: id,
      ...state,
      updatedAt: Date.now(),
    })
  } catch {
    /* ignore */
  }
}

export async function loadConversationSyncState(conversationId) {
  const id = String(conversationId || '').trim()
  if (!id || typeof indexedDB === 'undefined') return null
  try {
    return await chatDb.syncState.get(id)
  } catch {
    return null
  }
}
