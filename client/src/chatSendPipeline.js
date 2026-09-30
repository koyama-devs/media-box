/**
 * Human chat send + live snapshot pipeline.
 * Firestore listener is source of truth; outbox only covers in-flight/failed writes.
 */

import {
  deliverChatOutbox,
  reconcileChatDeliveryStorage,
  reconcileChatOutboxWithMessages,
  removeChatOutbox,
} from './chatOutbox.js'
import { isTestChatMessageText, mergeChatMessageLists } from './firebase.js'

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

const CHAT_LOCAL_CACHE_PREFIX = 'hana-chat-message-cache-v1:'

let chatSendSeq = 0

export function nextChatPendingId(kind = 'msg') {
  chatSendSeq += 1
  return `pending-${kind}-${Date.now()}-${chatSendSeq}`
}

export function nextStickerPendingId() {
  return nextChatPendingId('sticker')
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

function chatLocalCacheKey(threadId) {
  return `${CHAT_LOCAL_CACHE_PREFIX}${String(threadId || '').trim()}`
}

/** Offline reopen — last Firestore snapshot only (no pending flags). */
export function loadThreadMessageCache(threadId) {
  const id = String(threadId || '').trim()
  if (!id || typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(chatLocalCacheKey(id)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveThreadMessageCache(threadId, messages) {
  const id = String(threadId || '').trim()
  if (!id || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      chatLocalCacheKey(id),
      JSON.stringify((messages || []).slice(-300)),
    )
  } catch {
    /* Firestore remains source of truth */
  }
}

/** Keep in-flight/failed bubbles until Firestore confirms the same clientId/doc id. */
export function mergeServerMessagesWithPending(server, previous) {
  const pending = (previous || []).filter((message) => (
    message?.pending || message?.sendFailed
  ))
  if (!pending.length) return server
  const usedServerIds = new Set()
  const kept = []
  for (const item of pending) {
    const itemClientId = String(item.clientId || item.id || '')
    const itemServerId = String(item.serverId || '')
    const pendingTs = Date.parse(item.createdAtIso || item.createdAt || '') || 0
    const match = server.find((row) => {
      if (usedServerIds.has(row.id)) return false
      if (itemServerId && row.id === itemServerId) return true
      if (itemClientId && row.clientId && row.clientId === itemClientId) return true
      if (itemServerId || itemClientId) return false
      if ((row.sender || row.role) !== (item.sender || item.role)) return false
      if (String(row.text || '') !== String(item.text || '')) return false
      if (String(row.sticker || '') !== String(item.sticker || '')) return false
      if (String(row.effect || '') !== String(item.effect || '')) return false
      if (Boolean(row.imageUrl) !== Boolean(item.imageUrl)) return false
      if (Boolean(row.fileUrl) !== Boolean(item.fileUrl)) return false
      if (String(row.fileKind || '') !== String(item.fileKind || '')) return false
      if (pendingTs) {
        const rowTs = Date.parse(row.createdAtIso || row.createdAt || '') || 0
        if (rowTs && Math.abs(rowTs - pendingTs) > 90_000) return false
      }
      return true
    })
    if (match) {
      usedServerIds.add(match.id)
      removeChatOutbox(itemClientId || item.id)
    } else {
      kept.push(item)
    }
  }
  return sortMergedMessages(kept.length ? [...server, ...kept] : server)
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
  const cachedRows = threadId && !(previous || []).length
    ? loadThreadMessageCache(threadId)
    : []
  const withReactions = mergeChatMessageLists(filtered, previous, cachedRows)
  reconcileChatOutboxWithMessages(withReactions)
  if (threadId) {
    reconcileChatDeliveryStorage(withReactions, threadId, guestKey, isTestChatMessageText)
  }
  return mergeServerMessagesWithPending(withReactions, previous)
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
  return {
    ...message,
    ...extra,
    id: serverId,
    serverId,
    pending: false,
    sendFailed: false,
    uploading: false,
    clientId: cid,
  }
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
  return {
    id: pendingId,
    clientId: pendingId,
    pending: true,
    sendFailed: false,
    role,
    sender: role,
    text,
    rawText: text,
    createdAt: createdAtIso,
    createdAtIso,
    ...extra,
  }
}
