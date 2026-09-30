/** Persist unsent chat text/stickers so reload can recover (no File blobs). */

const OUTBOX_KEY = 'hana-chat-outbox-v1'
const ARCHIVE_KEY = 'hana-chat-archive-v1'
const OUTBOX_MAX = 40
const ARCHIVE_MAX = 1000

function normalizeGuestKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (key === 'gabu' || key === 'gabriel') return 'gabusan'
  return key
}

function canonicalizeOutboxThreadId(threadId = '', guestKey = '') {
  const raw = String(threadId || '').trim()
  const key = normalizeGuestKey(guestKey)
  if (key) return `guest-${key}`
  const match = raw.match(/^guest-([a-z0-9_-]+)$/i)
  if (match) return `guest-${normalizeGuestKey(match[1])}`
  return raw
}

function safeParse(raw) {
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function listChatOutbox() {
  if (typeof window === 'undefined') return []
  try {
    return safeParse(window.localStorage.getItem(OUTBOX_KEY))
  } catch {
    return []
  }
}

function listChatArchive() {
  if (typeof window === 'undefined') return []
  try {
    return safeParse(window.localStorage.getItem(ARCHIVE_KEY))
  } catch {
    return []
  }
}

export function listChatOutboxForThread(threadId, guestKey = '') {
  const tid = String(threadId || '').trim()
  const target = canonicalizeOutboxThreadId(tid, guestKey)
  if (!tid && !target) return []
  return listChatOutbox().filter((entry) => {
    const storedThread = String(entry?.threadId || '').trim()
    const storedGuestKey = String(entry?.guestKey || '').trim()
    const storedCanonical = canonicalizeOutboxThreadId(storedThread, storedGuestKey)
    if (!storedCanonical && !storedThread) return false
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
    next.push({
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
    })
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next.slice(-OUTBOX_MAX)))
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
      window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(-ARCHIVE_MAX)))
    }
    const next = rows.filter((row) => String(row?.clientId || '') !== id)
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
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
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
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
      removeChatOutbox(clientId)
    }
  }
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
