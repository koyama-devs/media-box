/** Persistent outbox queue — reliable delivery (LINE-style). */

import {
    conversationIdForGuestUser,
    guestUserIdFromConversationId,
    normalizeConversationId,
} from './chat/chatIdentity.js'
import { isOutboxEntryDue, markOutboxFailed, markOutboxPending, markOutboxSending } from './chat/chatOutboxWorker.js'
import {
    listArchiveEntriesSync,
    listOutboxEntriesSync,
    persistArchiveEntriesSync,
    persistOutboxEntriesSync,
} from './storage/outboxStore.js'

function canonicalizeOutboxThreadId(threadId = '', guestKey = '') {
  const raw = String(threadId || '').trim()
  const fromGuestKey = conversationIdForGuestUser(guestKey)
  if (fromGuestKey) return fromGuestKey
  const fromThread = guestUserIdFromConversationId(raw)
  if (fromThread) return conversationIdForGuestUser(fromThread)
  return raw
}

function persistOutboxRows(rows) {
  if (typeof window === 'undefined') return
  persistOutboxEntriesSync(rows)
}

function listChatArchive() {
  if (typeof window === 'undefined') return []
  return listArchiveEntriesSync()
}

export function listChatOutbox() {
  if (typeof window === 'undefined') return []
  return listOutboxEntriesSync()
}

export function listChatOutboxForThread(threadId, guestKey = '') {
  const tid = String(threadId || '').trim()
  const target = canonicalizeOutboxThreadId(tid, guestKey)
  const targetNorm = normalizeConversationId(target || tid)
  if (!tid && !target) return []
  return listChatOutbox().filter((entry) => {
    const storedThread = String(entry?.threadId || '').trim()
    const storedGuestKey = String(entry?.guestKey || '').trim()
    const storedCanonical = canonicalizeOutboxThreadId(storedThread, storedGuestKey)
    const storedNorm = normalizeConversationId(storedCanonical || storedThread)
    if (!storedCanonical && !storedThread) return false
    if (targetNorm && storedNorm && storedNorm === targetNorm) return true
    return storedCanonical === target || storedThread === tid || storedThread === target
  })
}

export function upsertChatOutbox(entry) {
  if (typeof window === 'undefined') return
  const clientId = String(entry?.clientId || '').trim()
  const resolvedThreadId = canonicalizeOutboxThreadId(
    entry?.threadId,
    entry?.guestKey || entry?.guestLabel || '',
  )
  const text = String(entry?.text || '').trim()
  const hasPayload = Boolean(
    text
    || entry?.sticker
    || entry?.effect
    || entry?.imageUrl
    || entry?.fileUrl
    || entry?.fileKind
    || (Array.isArray(entry?.attachments) && entry.attachments.length)
  )
  if (!clientId || !resolvedThreadId || !hasPayload) return
  try {
    const next = listChatOutbox().filter((row) => String(row?.clientId || '') !== clientId)
    next.push(markOutboxPending({
      clientId,
      threadId: resolvedThreadId,
      serverId: String(entry.serverId || '').slice(0, 128),
      text: text.slice(0, 2000),
      sender: entry.sender === 'hana' ? 'hana' : 'guest',
      guestKey: String(entry.guestKey || '').slice(0, 64),
      guestLabel: String(entry.guestLabel || '').slice(0, 80),
      sticker: String(entry.sticker || '').slice(0, 64),
      effect: String(entry.effect || '').slice(0, 64),
      effectEmoji: String(entry.effectEmoji || '').slice(0, 8),
      imageUrl: String(entry.imageUrl || '').slice(0, 2000),
      fileUrl: String(entry.fileUrl || '').slice(0, 2000),
      fileName: String(entry.fileName || '').slice(0, 180),
      fileMime: String(entry.fileMime || '').slice(0, 120),
      fileKind: String(entry.fileKind || '').slice(0, 32),
      fileSize: Math.max(0, Math.floor(Number(entry.fileSize) || 0)),
      attachments: Array.isArray(entry.attachments) ? entry.attachments.slice(0, 12) : [],
      replyTo: entry.replyTo?.id
        ? {
            id: String(entry.replyTo.id),
            text: String(entry.replyTo.text || '').slice(0, 120),
            sender: String(entry.replyTo.sender || entry.replyTo.role || ''),
          }
        : null,
      createdAtIso: String(entry.createdAtIso || new Date().toISOString()),
    }))
    persistOutboxRows(next)
  } catch {
    /* quota / private mode */
  }
}

export function removeChatOutbox(clientId) {
  if (typeof window === 'undefined') return
  const id = String(clientId || '').trim()
  if (!id) return
  try {
    const rows = listChatOutbox()
    const removed = rows.find((row) => String(row?.clientId || '') === id)
    if (removed) {
      const archive = listChatArchive().filter((row) => String(row?.clientId || '') !== id)
      archive.push({ ...removed, serverId: removed.serverId || '' })
      persistArchiveEntriesSync(archive)
    }
    const next = rows.filter((row) => String(row?.clientId || '') !== id)
    persistOutboxRows(next)
  } catch {
    /* ignore */
  }
}

export function listChatOutboxDue(nowMs = Date.now()) {
  return listChatOutbox().filter((entry) => {
    const status = String(entry?.status || 'pending')
    if (status === 'sent') return false
    return isOutboxEntryDue(entry, nowMs)
  })
}

export function touchOutboxSending(clientId) {
  if (typeof window === 'undefined') return
  const id = String(clientId || '').trim()
  if (!id) return
  try {
    const next = listChatOutbox().map((row) => (
      String(row?.clientId || '') === id ? markOutboxSending(row) : row
    ))
    persistOutboxRows(next)
  } catch {
    /* ignore */
  }
}

export function touchOutboxSendFailed(clientId) {
  if (typeof window === 'undefined') return
  const id = String(clientId || '').trim()
  if (!id) return
  try {
    const next = listChatOutbox().map((row) => (
      String(row?.clientId || '') === id ? markOutboxFailed(row) : row
    ))
    persistOutboxRows(next)
  } catch {
    /* ignore */
  }
}

export function listChatRecoveryForThread(threadId, guestKey = '') {
  const pending = listChatOutboxForThread(threadId, guestKey)
  const archived = listChatArchive().filter((entry) => (
    listChatOutboxForThread(threadId, guestKey).some((row) => false)
      || canonicalArchiveThreadMatches(entry, threadId, guestKey)
  ))
  const byId = new Map()
  archived.forEach((entry) => byId.set(String(entry?.clientId || ''), entry))
  pending.forEach((entry) => byId.set(String(entry?.clientId || ''), entry))
  return [...byId.values()].filter((entry) => entry.clientId)
}

function canonicalArchiveThreadMatches(entry, threadId, guestKey) {
  const target = canonicalizeOutboxThreadId(threadId, guestKey)
  const stored = String(entry?.threadId || '').trim()
  return canonicalizeOutboxThreadId(stored, entry?.guestKey || '') === target
}

export function markChatOutboxSent(clientId, serverId) {
  if (typeof window === 'undefined') return
  const id = String(clientId || '').trim()
  const sid = String(serverId || '').trim()
  if (!id || !sid) return
  try {
    const next = listChatOutbox().map((row) => (
      String(row?.clientId || '').trim() === id
        ? { ...row, serverId: sid, sentAtIso: new Date().toISOString() }
        : row
    ))
    persistOutboxRows(next)
  } catch {
    /* ignore */
  }
}

export function deliverChatOutbox(clientId, serverId) {
  markChatOutboxSent(clientId, serverId)
  removeChatOutbox(clientId)
}

function serverHasOutboxDelivery(message, clientId, serverId = '') {
  if (!message || message.pending || message.sendFailed) return false
  const id = String(message?.id || '').trim()
  const cid = String(message?.clientId || '').trim()
  const target = String(clientId || '').trim()
  const sid = String(serverId || '').trim()
  if (!target) return false
  if (id === target || cid === target) return true
  if (sid && (id === sid || cid === sid)) return true
  return false
}

export function reconcileChatOutboxWithMessages(messages = []) {
  if (typeof window === 'undefined' || !Array.isArray(messages) || !messages.length) return
  for (const entry of listChatOutbox()) {
    const clientId = String(entry?.clientId || '').trim()
    const serverId = String(entry?.serverId || '').trim()
    if (!clientId) continue
    if (messages.some((message) => serverHasOutboxDelivery(message, clientId, serverId))) {
      purgeChatDeliveryEntry(clientId)
    }
  }
}

/** Drop outbox + archive row (no re-archive) — e.g. admin deleted Firestore doc or purged test junk. */
export function purgeChatDeliveryEntry(clientId) {
  const id = String(clientId || '').trim()
  if (!id || typeof window === 'undefined') return
  try {
    const outbox = listChatOutbox().filter((row) => String(row?.clientId || '') !== id)
    persistOutboxRows(outbox)
    const archive = listChatArchive().filter((row) => String(row?.clientId || '') !== id)
    persistArchiveEntriesSync(archive)
  } catch {
    /* ignore */
  }
}

function outboxEntryBody(entry) {
  return String(entry?.text || entry?.sticker || '').trim()
}

function listChatArchiveForThread(threadId, guestKey = '') {
  return listChatArchive().filter((entry) => canonicalArchiveThreadMatches(entry, threadId, guestKey))
}

/**
 * Align local outbox/archive with Firestore snapshot so deleted or purged messages are not replayed.
 * @param {function(string): boolean} [isTestMessageFn] optional — drops pending test junk with no server copy
 */
export function reconcileChatDeliveryStorage(messages = [], threadId = '', guestKey = '', isTestMessageFn = null) {
  if (typeof window === 'undefined') return
  const serverIds = new Set()
  const clientIdsOnServer = new Set()
  for (const message of messages || []) {
    if (!message || message.deleted) continue
    const id = String(message.id || '').trim()
    const cid = String(message.clientId || '').trim()
    if (id) serverIds.add(id)
    if (cid) clientIdsOnServer.add(cid)
  }
  const seen = new Set()
  const rows = [
    ...listChatOutboxForThread(threadId, guestKey),
    ...listChatArchiveForThread(threadId, guestKey),
  ]
  for (const entry of rows) {
    const clientId = String(entry?.clientId || '').trim()
    if (!clientId || seen.has(clientId)) continue
    seen.add(clientId)
    const serverId = String(entry?.serverId || '').trim()
    if (serverId && !serverIds.has(serverId)) {
      purgeChatDeliveryEntry(clientId)
      continue
    }
    if (
      !serverId
      && typeof isTestMessageFn === 'function'
      && isTestMessageFn(outboxEntryBody(entry))
      && !clientIdsOnServer.has(clientId)
    ) {
      purgeChatDeliveryEntry(clientId)
    }
  }
}

export function purgeTestChatDeliveryForThread(threadId, guestKey = '', isTestMessageFn = null) {
  if (typeof window === 'undefined' || typeof isTestMessageFn !== 'function') return 0
  let n = 0
  const seen = new Set()
  for (const entry of [
    ...listChatOutboxForThread(threadId, guestKey),
    ...listChatArchiveForThread(threadId, guestKey),
  ]) {
    const clientId = String(entry?.clientId || '').trim()
    if (!clientId || seen.has(clientId)) continue
    seen.add(clientId)
    if (!isTestMessageFn(outboxEntryBody(entry))) continue
    purgeChatDeliveryEntry(clientId)
    n += 1
  }
  return n
}

export function resolveRetryableOutboxEntry({
  threadId = '',
  guestKey = '',
  clientId = '',
  messageId = '',
  messages = [],
} = {}) {
  const targetId = String(clientId || messageId || '').trim()
  const stateMatch = Array.isArray(messages)
    ? messages.find((message) => {
        const id = String(message?.id || '').trim()
        const currentClientId = String(message?.clientId || '').trim()
        return targetId && (id === targetId || currentClientId === targetId)
      })
    : null
  if (stateMatch) {
    if (serverHasOutboxDelivery(stateMatch, targetId, stateMatch.serverId || stateMatch.id)) {
      removeChatOutbox(targetId)
    }
    return stateMatch
  }

  const delivered = Array.isArray(messages)
    ? messages.find((message) => serverHasOutboxDelivery(message, targetId))
    : null
  if (delivered) {
    removeChatOutbox(targetId)
    return null
  }

  const outboxRows = listChatOutboxForThread(threadId, guestKey)
  if (!targetId) return null
  const entry = outboxRows.find((row) => String(row?.clientId || '').trim() === targetId)
  return entry ? outboxEntryToLocalMessage(entry) : null
}

export function outboxEntryToLocalMessage(entry) {
  if (!entry?.clientId) return null
  const sender = entry.sender === 'hana' ? 'hana' : 'guest'
  return {
    id: entry.clientId,
    clientId: entry.clientId,
    serverId: entry.serverId || undefined,
    pending: !entry.serverId,
    sendFailed: false,
    role: sender,
    sender,
    text: entry.text,
    rawText: entry.text,
    sticker: entry.sticker || '',
    effect: entry.effect || '',
    effectEmoji: entry.effectEmoji || '',
    imageUrl: entry.imageUrl || '',
    fileUrl: entry.fileUrl || '',
    fileName: entry.fileName || '',
    fileMime: entry.fileMime || '',
    fileKind: entry.fileKind || '',
    fileSize: entry.fileSize || 0,
    attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    createdAt: entry.createdAtIso,
    createdAtIso: entry.createdAtIso,
    replyTo: entry.replyTo || null,
  }
}
