/**
 * Conversation-level delivery + read cursors (LINE-style, low write volume).
 */

export function lastMessageFromRows(rows = [], { fromSender = '' } = {}) {
  const sender = String(fromSender || '').trim()
  let last = null
  for (const row of rows || []) {
    if (!row || row.deleted) continue
    if (sender && (row.sender || row.role) !== sender) continue
    const ts = Date.parse(row.createdAtIso || row.createdAt || '') || 0
    const prevTs = last
      ? (Date.parse(last.createdAtIso || last.createdAt || '') || 0)
      : 0
    if (!last || ts >= prevTs) last = row
  }
  return last
}

export function readReceiptPatchForOpenThread({
  reader,
  messages = [],
  lastMessageId = '',
} = {}) {
  const id = String(lastMessageId || '').trim()
    || String(lastMessageFromRows(messages)?.id || '').trim()
  if (!id) return null
  const nowIso = new Date().toISOString()
  if (reader === 'hana') {
    return {
      hanaLastReadMessageId: id,
      hanaLastReadAtIso: nowIso,
    }
  }
  if (reader === 'guest') {
    return {
      guestLastReadMessageId: id,
      guestLastReadAtIso: nowIso,
    }
  }
  return null
}

export function deliveryReceiptPatchForSnapshot({
  viewer,
  messages = [],
} = {}) {
  const partner = viewer === 'hana' ? 'guest' : viewer === 'guest' ? 'hana' : ''
  if (!partner) return null
  const last = lastMessageFromRows(messages, { fromSender: partner })
  if (!last?.id) return null
  const iso = String(last.createdAtIso || last.createdAt || '').trim() || new Date().toISOString()
  if (viewer === 'hana') {
    return {
      guestLastDeliveredMessageId: String(last.id),
      guestLastDeliveredAtIso: iso,
    }
  }
  return {
    hanaLastDeliveredMessageId: String(last.id),
    hanaLastDeliveredAtIso: iso,
  }
}

/** Fire-and-forget delivered cursor when partner messages arrive on this device. */
export function notifyPartnerMessagesDelivered({
  threadId,
  viewer,
  guestKey = '',
  rows = [],
  deliveredSeenRef,
  markDelivered,
}) {
  if (!threadId || typeof markDelivered !== 'function') return
  const partner = viewer === 'hana' ? 'guest' : 'hana'
  const last = lastMessageFromRows(rows, { fromSender: partner })
  const id = String(last?.id || '').trim()
  const prev = deliveredSeenRef?.current?.get?.(threadId)
  if (!id || prev === id) return
  deliveredSeenRef?.current?.set?.(threadId, id)
  markDelivered(threadId, viewer, guestKey, {
    lastMessageId: id,
    lastMessageIso: last?.createdAtIso || last?.createdAt || '',
  }).catch(() => {})
}

export function newestMessageId(rows = []) {
  const last = lastMessageFromRows(rows)
  return String(last?.id || '').trim()
}
