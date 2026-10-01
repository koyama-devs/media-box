/**
 * Merge local + server messages by stable clientMessageId (never by text/timestamp).
 */

export function clientMessageKey(message) {
  const cid = String(message?.clientMessageId || message?.clientId || '').trim()
  if (cid) return cid
  return String(message?.id || '').trim()
}

function sortChatRows(rows = []) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a?.createdAtIso || a?.createdAt || '') || 0
    const tb = Date.parse(b?.createdAtIso || b?.createdAt || '') || 0
    if (ta !== tb) return ta - tb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

function mergeStatus(local, remote) {
  const remoteSent = remote?.serverId || (!remote?.pending && !remote?.sendFailed && remote?.id)
  const localPending = local?.pending || local?.sendFailed || local?.status === 'pending' || local?.status === 'failed'
  if (remoteSent) {
    return {
      pending: false,
      sendFailed: false,
      status: remote?.status || 'sent',
      serverId: remote.serverId || remote.id,
      id: remote.id || local.id,
    }
  }
  if (localPending) {
    return {
      pending: local.pending ?? false,
      sendFailed: local.sendFailed ?? false,
      status: local.status || (local.sendFailed ? 'failed' : 'pending'),
    }
  }
  return {}
}

/**
 * @param {object[]} localRows
 * @param {object[]} remoteRows — Firestore snapshot (authoritative when present)
 */
export function mergeMessagesByClientId(localRows = [], remoteRows = []) {
  const map = new Map()
  for (const message of localRows) {
    const key = clientMessageKey(message)
    if (!key) continue
    map.set(key, message)
  }
  for (const message of remoteRows) {
    const key = clientMessageKey(message)
    if (!key) continue
    const prev = map.get(key)
    map.set(key, prev
      ? { ...prev, ...message, ...mergeStatus(prev, message) }
      : message)
  }
  return sortChatRows([...map.values()])
}

/** Keep outbox-only rows that are not yet on the server. */
export function mergeServerWithOutboxPending(serverRows = [], previousRows = []) {
  const pending = (previousRows || []).filter((m) => (
    m?.pending || m?.sendFailed || m?.status === 'pending' || m?.status === 'failed'
  ))
  if (!pending.length) return serverRows
  const serverKeys = new Set(
    (serverRows || []).flatMap((m) => {
      const k = clientMessageKey(m)
      return k ? [k, String(m.id || '')] : [String(m.id || '')]
    }).filter(Boolean),
  )
  const kept = pending.filter((m) => {
    const k = clientMessageKey(m)
    if (k && serverKeys.has(k)) return false
    if (m.serverId && serverKeys.has(String(m.serverId))) return false
    return true
  })
  return sortChatRows(kept.length ? mergeMessagesByClientId(kept, serverRows) : serverRows)
}

function reactionRowScore(message) {
  let score = 0
  for (const counts of Object.values(message?.reactions || {})) {
    if (Array.isArray(counts)) score += counts.length
    else score += Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
  }
  return score
}

function rowIsInFlight(message) {
  return Boolean(
    message?.pending
    || message?.sendFailed
    || message?.status === 'pending'
    || message?.status === 'failed',
  )
}

function preferMessageRow(existing, candidate) {
  if (!existing) return candidate
  if (!candidate) return existing
  const pendingA = rowIsInFlight(existing)
  const pendingB = rowIsInFlight(candidate)
  if (pendingA !== pendingB) return pendingA ? candidate : existing
  const scoreA = reactionRowScore(existing)
  const scoreB = reactionRowScore(candidate)
  if (scoreB !== scoreA) return scoreB > scoreA ? candidate : existing
  const existingTime = Date.parse(existing.createdAtIso || existing.createdAt || '') || 0
  const messageTime = Date.parse(candidate.createdAtIso || candidate.createdAt || '') || 0
  return messageTime >= existingTime ? candidate : existing
}

/** Union message lists — keep the row with richer reactions (flower fill after reopen). */
export function mergeChatMessageLists(...lists) {
  const byId = new Map()
  const idByClientKey = new Map()
  for (const list of lists) {
    for (const row of list || []) {
      if (!row?.id) continue
      const ck = clientMessageKey(row)
      const linkedId = ck ? idByClientKey.get(ck) : null
      if (linkedId && linkedId !== row.id) {
        const kept = preferMessageRow(byId.get(linkedId), row)
        byId.delete(linkedId)
        byId.set(kept.id, kept)
        if (ck) idByClientKey.set(ck, kept.id)
        continue
      }
      const next = preferMessageRow(byId.get(row.id), row)
      byId.set(row.id, next)
      if (ck) idByClientKey.set(ck, next.id)
    }
  }
  return sortChatRows([...byId.values()])
}
