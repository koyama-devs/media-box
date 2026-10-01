import { conversationIdAliases, normalizeConversationId } from '../chat/chatIdentity.js'
import { clientMessageKey } from '../chat/chatMerge.js'
import { chatDb } from './db.js'

export const LEGACY_MESSAGE_CACHE_PREFIX = 'hana-chat-message-cache-v1:'

/** conversationId → message[] */
const threadMemory = new Map()
let hydratePromise = null

function safeParse(raw) {
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function uiRowToStored(message, conversationId) {
  const clientMessageId = clientMessageKey(message)
  if (!clientMessageId) return null
  const createdAt = Date.parse(message.createdAtIso || message.createdAt || '') || Date.now()
  let status = 'sent'
  if (message.sendFailed || message.status === 'failed') status = 'failed'
  else if (message.pending || message.status === 'pending') status = 'pending'
  else if (message.status === 'sending') status = 'sending'
  return {
    clientMessageId,
    conversationId,
    payload: message,
    createdAt,
    status,
  }
}

export async function hydrateMessageStore() {
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    if (typeof indexedDB === 'undefined') return
    try {
      const threads = await chatDb.messageThreads.toArray()
      for (const row of threads) {
        const id = String(row.conversationId || '').trim()
        if (!id || !row.messagesJson) continue
        const parsed = safeParse(row.messagesJson)
        if (!parsed.length) continue
        const canonical = normalizeConversationId(id) || id
        threadMemory.set(canonical, parsed)
        if (canonical !== id) threadMemory.set(id, parsed)
      }
      if (threads.length) {
        clearLegacyMessageCaches()
        return
      }
      if (typeof window === 'undefined' || !window.localStorage) return
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (!key || !key.startsWith(LEGACY_MESSAGE_CACHE_PREFIX)) continue
        const conversationId = key.slice(LEGACY_MESSAGE_CACHE_PREFIX.length)
        const messages = safeParse(window.localStorage.getItem(key))
        if (!conversationId || !messages.length) continue
        threadMemory.set(conversationId, messages)
        await saveThreadMessages(conversationId, messages)
      }
      clearLegacyMessageCaches()
    } catch {
      /* ignore */
    }
  })()
  return hydratePromise
}

function clearLegacyMessageCaches() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k?.startsWith(LEGACY_MESSAGE_CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export function loadThreadMessagesSync(conversationId) {
  const aliases = conversationIdAliases(conversationId)
  if (!aliases.length) return []
  for (const id of aliases) {
    if (threadMemory.has(id)) return threadMemory.get(id)
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    for (const id of aliases) {
      const legacy = safeParse(window.localStorage.getItem(`${LEGACY_MESSAGE_CACHE_PREFIX}${id}`))
      if (legacy.length) {
        const canonical = normalizeConversationId(id) || id
        threadMemory.set(canonical, legacy)
        return legacy
      }
    }
  }
  return []
}

export async function loadThreadMessages(conversationId) {
  await hydrateMessageStore()
  const sync = loadThreadMessagesSync(conversationId)
  if (sync.length) return sync
  const aliases = conversationIdAliases(conversationId)
  if (!aliases.length || typeof indexedDB === 'undefined') return []
  try {
    for (const id of aliases) {
      const rows = await chatDb.messages
        .where('conversationId')
        .equals(id)
        .sortBy('createdAt')
      if (rows.length) {
        const messages = rows.map((row) => row.payload).filter(Boolean)
        const canonical = normalizeConversationId(id) || id
        threadMemory.set(canonical, messages)
        return messages
      }
      const threadRow = await chatDb.messageThreads.get(id)
      if (threadRow?.messagesJson) {
        const messages = safeParse(threadRow.messagesJson)
        const canonical = normalizeConversationId(id) || id
        threadMemory.set(canonical, messages)
        return messages
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export async function saveThreadMessages(conversationId, messages) {
  const id = normalizeConversationId(conversationId) || String(conversationId || '').trim()
  if (!id) return
  const slice = (messages || []).slice(-300)
  threadMemory.set(id, slice)
  if (typeof indexedDB === 'undefined') return
  try {
    const messagesJson = JSON.stringify(slice)
    await chatDb.messageThreads.put({
      conversationId: id,
      messagesJson,
      updatedAt: Date.now(),
    })
    await chatDb.transaction('rw', chatDb.messages, async () => {
      await chatDb.messages.where('conversationId').equals(id).delete()
      const stored = slice.map((m) => uiRowToStored(m, id)).filter(Boolean)
      if (stored.length) await chatDb.messages.bulkPut(stored)
    })
  } catch {
    /* ignore */
  }
}

export function saveThreadMessagesSync(conversationId, messages) {
  const id = normalizeConversationId(conversationId) || String(conversationId || '').trim()
  if (!id) return
  const slice = (messages || []).slice(-300)
  threadMemory.set(id, slice)
  void saveThreadMessages(id, slice)
}

export async function upsertLocalChatMessage(conversationId, message) {
  const id = normalizeConversationId(conversationId) || String(conversationId || '').trim()
  if (!id || !message) return
  const key = clientMessageKey(message)
  const list = [...loadThreadMessagesSync(id)]
  const idx = list.findIndex((row) => clientMessageKey(row) === key)
  if (idx >= 0) list[idx] = { ...list[idx], ...message }
  else list.push(message)
  await saveThreadMessages(id, list)
}

export function resetMessageStoreForTests() {
  threadMemory.clear()
  hydratePromise = null
}
