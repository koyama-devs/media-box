/** Persist unsent chat text/stickers so reload can recover (no File blobs). */

const OUTBOX_KEY = 'hana-chat-outbox-v1'
const OUTBOX_MAX = 40

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

export function listChatOutboxForThread(threadId) {
  const tid = String(threadId || '').trim()
  if (!tid) return []
  return listChatOutbox().filter((entry) => String(entry?.threadId || '') === tid)
}

export function upsertChatOutbox(entry) {
  if (typeof window === 'undefined') return
  const clientId = String(entry?.clientId || '').trim()
  const threadId = String(entry?.threadId || '').trim()
  const text = String(entry?.text || '').trim()
  if (!clientId || !threadId || !text) return
  try {
    const next = listChatOutbox().filter((row) => String(row?.clientId || '') !== clientId)
    next.push({
      clientId,
      threadId,
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
    const next = listChatOutbox().filter((row) => String(row?.clientId || '') !== id)
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function outboxEntryToLocalMessage(entry) {
  if (!entry?.clientId) return null
  const sender = entry.sender === 'hana' ? 'hana' : 'guest'
  return {
    id: entry.clientId,
    clientId: entry.clientId,
    pending: false,
    sendFailed: true,
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
