/**
 * Human chat send + live snapshot pipeline.
 * Firestore listener is source of truth; outbox only covers in-flight/failed writes.
 */

import {
    chatLogEvent,
    chatLogStatus,
    chatTransportStatus,
    logChatLifecycle,
    logTransportListDiff,
} from './chat/chatDebug.js'
import { normalizeConversationId } from './chat/chatIdentity.js'
import { mergeChatMessageLists, mergeMessagesByClientId, mergeServerWithOutboxPending } from './chat/chatMerge.js'
import { ensureChatStorageReady } from './chat/chatStorageInit.js'
import { newClientMessageId } from './chat/clientMessageId.js'
import { isTestChatMessageText } from './chat/testMessageText.js'
import {
    deliverChatOutbox,
    reconcileChatDeliveryStorage,
    reconcileChatOutboxWithMessages,
    removeChatOutbox,
    touchOutboxSendFailed,
    touchOutboxSending,
} from './chatOutbox.js'
import { saveConversationSyncState } from './storage/conversationStore.js'
import { loadThreadMessagesSync, saveThreadMessagesSync, upsertLocalChatMessage } from './storage/messageStore.js'

function sortMergedMessages(rows = []) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a?.createdAtIso || a?.createdAt || '') || 0
    const tb = Date.parse(b?.createdAtIso || b?.createdAt || '') || 0
    if (ta !== tb) return ta - tb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

export const CHAT_SEND_TIMEOUT_MS = 28_000
export const CHAT_UPLOAD_TIMEOUT_MS = 120_000

export function nextChatPendingId() {
  return newClientMessageId()
}

export function nextStickerPendingId() {
  return nextChatPendingId()
}

export function withChatTimeout(promise, ms, message = '送信がタイムアウトしました。') {
  let timer = 0
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const err = new Error(message)
      err.code = 'chat/timeout'
      reject(err)
    }, Math.max(1000, Number(ms) || CHAT_SEND_TIMEOUT_MS))
  })
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

/** Offline reopen — last Firestore snapshot only (no pending flags). */
export function loadThreadMessageCache(threadId) {
  return loadThreadMessagesSync(threadId)
}

export function saveThreadMessageCache(threadId, messages) {
  if (typeof window === 'undefined') return
  saveThreadMessagesSync(threadId, messages)
}

/** Keep in-flight/failed bubbles until Firestore confirms the same clientId/doc id. */
export function mergeServerMessagesWithPending(server, previous) {
  const merged = mergeServerWithOutboxPending(server, previous)
  for (const item of previous || []) {
    const itemClientId = String(item.clientId || item.id || '')
    if (!itemClientId) continue
    const match = (server || []).find((row) => (
      row.id === itemClientId
      || row.clientId === itemClientId
      || (item.serverId && row.id === item.serverId)
    ))
    if (match) removeChatOutbox(itemClientId)
  }
  return merged
}

/**
 * First paint when opening a thread: memory alias → local cache → outbox recovery.
 */
export function bootstrapThreadRows({
  threadId,
  relatedIds = [],
  memoryCache,
  recoveryRows = [],
}) {
  if (!threadId) return []
  const ids = [threadId, ...relatedIds].filter(Boolean)
  for (const id of ids) {
    const mem = memoryCache?.get?.(id)
    if (Array.isArray(mem) && mem.length) return mem
    const local = loadThreadMessageCache(id)
    if (local.length) return local
  }
  const directMem = memoryCache?.get?.(threadId)
  if (Array.isArray(directMem) && directMem.length) return directMem
  const directLocal = loadThreadMessageCache(threadId)
  if (directLocal.length) return directLocal
  return recoveryRows
}

/** Firestore snapshot → bubble list (804e4e1-style: no localStorage message cache). */
export function applyChatMessageSnapshot({
  serverRows,
  previous,
  deletingIds = new Set(),
  threadId = '',
  guestKey = '',
}) {
  const filtered = (serverRows || []).filter((m) => !deletingIds.has(m.id))
  const cachedRows = threadId && !filtered.length && !(previous || []).length
    ? loadThreadMessageCache(threadId)
    : []
  const cacheId = normalizeConversationId(threadId) || threadId
  let merged
  if (filtered.length) {
    const serverMerged = mergeServerMessagesWithPending(filtered, previous)
    merged = mergeMessagesByClientId(previous, serverMerged, 'REALTIME SNAPSHOT', cacheId)
  } else if (cachedRows.length) {
    merged = mergeMessagesByClientId(previous, cachedRows, 'IDB CACHE', cacheId)
  } else {
    merged = mergeMessagesByClientId(previous, [], 'REALTIME SNAPSHOT', cacheId)
  }
  reconcileChatOutboxWithMessages(merged)
  if (threadId) {
    reconcileChatDeliveryStorage(merged, threadId, guestKey, isTestChatMessageText)
  }
  if (cacheId && merged.length) {
    const rowsToPersist = merged
    const persist = () => {
      saveThreadMessageCache(cacheId, rowsToPersist)
      const newest = rowsToPersist[rowsToPersist.length - 1]
      void saveConversationSyncState(cacheId, {
        lastMessageId: String(newest?.id || newest?.clientId || ''),
        lastSyncedAt: Date.now(),
      })
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(persist, { timeout: 2000 })
    } else {
      Promise.resolve().then(persist)
    }
  }
  logTransportListDiff('REALTIME SNAPSHOT', cacheId, previous, merged)
  return merged
}

/** @deprecated Use applyChatMessageSnapshot — kept for call sites during migration. */
export function ingestLiveChatSnapshot(args) {
  return applyChatMessageSnapshot(args)
}

export function resolveWriteServerId(raw) {
  if (typeof raw === 'string') return raw
  return raw?.serverId || null
}

export function patchMessagesByPendingId(messages, pendingId, patch) {
  const key = String(pendingId || '').trim()
  if (!key) return messages
  return (messages || []).map((m) => (
    m.id === key || m.clientId === key ? { ...m, ...patch } : m
  ))
}

export function applyServerIdToMessage(message, { pendingId, serverId, clientId, extra = {} }) {
  const key = String(pendingId || clientId || '').trim()
  if (!key) return message
  if (message.id !== key && message.clientId !== key) return message
  const cid = String(clientId || pendingId || '').trim()
  const before = chatTransportStatus(message)
  const next = {
    ...message,
    ...extra,
    id: serverId,
    serverId,
    pending: false,
    sendFailed: false,
    uploading: false,
    status: extra.status || 'sent',
    clientId: cid,
  }
  chatLogStatus('SERVER ACK', {
    clientMessageId: cid,
    from: before,
    to: chatTransportStatus(next),
  })
  return next
}

export function mapMessagesWithServerId(messages, { pendingId, serverId, clientId, extra = {} }) {
  return (messages || []).map((m) => applyServerIdToMessage(m, {
    pendingId,
    serverId,
    clientId,
    extra,
  }))
}

/**
 * Track in-flight write, timeout, and outbox cleanup on success.
 * @returns {{ status: 'ok', serverId: string, raw: * } | { status: 'timeout', writePromise: Promise<*> }}
 */
export async function runChatWrite({
  clientId,
  writePromise,
  timeoutMs = CHAT_SEND_TIMEOUT_MS,
  inFlightMap,
}) {
  const id = String(clientId || '').trim()
  if (!id) throw new Error('Missing clientId')
  inFlightMap.set(id, writePromise)
  try {
    const raw = await withChatTimeout(writePromise, timeoutMs)
    const serverId = resolveWriteServerId(raw)
    inFlightMap.delete(id)
    if (serverId) deliverChatOutbox(id, serverId)
    return { status: 'ok', serverId, raw }
  } catch (err) {
    if (err?.code === 'chat/timeout') {
      return { status: 'timeout', writePromise }
    }
    inFlightMap.delete(id)
    throw err
  }
}

/** After UI timeout, still accept a late Firestore commit. */
export function watchLateChatWrite({
  writePromise,
  clientId,
  pendingId,
  inFlightMap,
  onServerId,
  onFailed,
  retryFn,
  retryDelayMs = 1200,
}) {
  const cid = String(clientId || pendingId || '').trim()
  writePromise
    .then((raw) => {
      const serverId = resolveWriteServerId(raw)
      if (!serverId) return
      deliverChatOutbox(cid, serverId)
      inFlightMap.delete(cid)
      onServerId?.(serverId, raw)
    })
    .catch(() => {
      inFlightMap.delete(cid)
      onFailed?.()
    })
  if (typeof retryFn === 'function') {
    window.setTimeout(() => { void retryFn(cid) }, retryDelayMs)
  }
}

export function buildOptimisticMessage({
  pendingId,
  sender,
  text,
  createdAtIso,
  extra = {},
}) {
  const role = sender === 'hana' ? 'hana' : 'guest'
  const row = {
    id: pendingId,
    clientId: pendingId,
    clientMessageId: pendingId,
    pending: true,
    sendFailed: false,
    status: 'pending',
    uploading: false,
    role,
    sender: role,
    text,
    rawText: text,
    createdAt: createdAtIso,
    createdAtIso,
    ...extra,
  }
  chatLogStatus('CREATE', {
    clientMessageId: pendingId,
    from: '(none)',
    to: chatTransportStatus(row),
  })
  logChatLifecycle({
    clientMessageId: pendingId,
    event: 'CREATE',
    statusBefore: 'none',
    statusAfter: chatTransportStatus(row),
    source: 'buildOptimisticMessage',
  })
  return row
}

/** Local-first send: paint bubble first; IndexedDB is background persistence. */
export function stageOptimisticOutgoingMessage(conversationId, message) {
  const cacheId = normalizeConversationId(conversationId) || String(conversationId || '').trim()
  if (!cacheId || !message) return message
  const persist = () => {
    const prev = loadThreadMessagesSync(cacheId)
    const merged = mergeMessagesByClientId(prev, [message])
    saveThreadMessageCache(cacheId, merged)
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(persist, { timeout: 2000 })
  } else {
    Promise.resolve().then(persist)
  }
  return message
}

/**
 * Direct Firestore send with silent outbox: persist first, clear outbox on success,
 * leave outbox for background retry if the write fails or the app closes mid-flight.
 */
export function runDirectSendWithOutbox({
  upsertChatOutbox,
  deliverChatOutbox: deliverOutbox,
  outboxEntry,
  runSend,
  inFlightMap,
}) {
  upsertChatOutbox(outboxEntry)
  const clientId = String(outboxEntry?.clientId || '').trim()
  const conversationId = normalizeConversationId(outboxEntry?.threadId) || String(outboxEntry?.threadId || '').trim()
  if (conversationId && clientId) {
    const localRow = {
      id: clientId,
      clientId,
      clientMessageId: clientId,
      text: outboxEntry.text,
      sender: outboxEntry.sender,
      role: outboxEntry.sender,
      status: 'pending',
      pending: true,
      createdAtIso: outboxEntry.createdAtIso || new Date().toISOString(),
    }
    void ensureChatStorageReady().then(() => upsertLocalChatMessage(conversationId, localRow))
  }
  if (clientId) {
    touchOutboxSending(clientId)
    chatLogStatus('STATUS UPDATE', {
      clientMessageId: clientId,
      conversationId,
      from: 'pending',
      to: 'sending',
    })
    chatLogEvent('FIREBASE SEND', { clientMessageId: clientId, conversationId, status: 'sending' })
    logChatLifecycle({
      clientMessageId: clientId,
      conversationId,
      event: 'FIREBASE_SEND_START',
      statusBefore: 'sending',
      statusAfter: 'sending',
      source: 'runDirectSendWithOutbox',
    })
  }
  const writePromise = Promise.resolve().then(runSend)
  if (inFlightMap && clientId) inFlightMap.set(clientId, writePromise)
  return writePromise
    .then((serverId) => {
      const sid = typeof serverId === 'string' ? serverId : String(serverId?.serverId || '').trim()
      if (sid && clientId) {
        deliverOutbox(clientId, sid)
        chatLogStatus('SERVER ACK', {
          clientMessageId: clientId,
          conversationId,
          from: 'sending',
          to: 'sent',
        })
        logChatLifecycle({
          clientMessageId: clientId,
          conversationId,
          event: 'SERVER_ACK',
          statusBefore: 'sending',
          statusAfter: 'sent',
          source: 'runDirectSendWithOutbox',
        })
      }
      return sid
    })
    .catch((err) => {
      if (clientId) touchOutboxSendFailed(clientId)
      throw err
    })
    .finally(() => {
      if (inFlightMap && clientId) inFlightMap.delete(clientId)
    })
}
