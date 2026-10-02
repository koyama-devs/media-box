/**
 * Runtime lifecycle debug — enable: localStorage.setItem('hana-chat-debug', '1'); reload.
 * Disable: localStorage.removeItem('hana-chat-debug')
 */

export function isChatDebugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage?.getItem('hana-chat-debug') === '1'
  } catch {
    return false
  }
}

export function messageRowKey(message) {
  const cid = String(message?.clientMessageId || message?.clientId || '').trim()
  if (cid) return cid
  return String(message?.id || '').trim()
}

/** Outbound transport only (not thread read/delivered). */
export function chatTransportStatus(message) {
  if (!message) return '(none)'
  if (message.sendFailed || message.status === 'failed') return 'failed'
  if (message.pending || message.status === 'pending') return 'pending'
  if (message.status === 'sending') return 'sending'
  if (message.status === 'sent') return 'sent'
  const id = String(message.id || '').trim()
  const cid = String(message.clientId || message.clientMessageId || '').trim()
  if (String(message.serverId || '').trim()) return 'sent'
  if (id && cid && id !== cid) return 'sent'
  if (!message.pending && !message.sendFailed && id) return 'sent'
  return 'unknown'
}

export function chatLogStatus(source, {
  clientMessageId = '',
  conversationId = '',
  from = '',
  to = '',
} = {}) {
  if (!isChatDebugEnabled()) return
  const cid = String(clientMessageId || '').trim()
  if (!cid) return
  const ts = new Date().toISOString()
  const lines = [
    `[CHAT][STATUS] ${ts}`,
    `cid=${cid}`,
    `${from || '(none)'} -> ${to || '(none)'}`,
    `source=${source}`,
  ]
  if (conversationId) lines.push(`conversationId=${conversationId}`)
  console.info(lines.join('\n'))
}

export function chatLogEvent(source, {
  clientMessageId = '',
  conversationId = '',
  status = '',
  detail = '',
} = {}) {
  if (!isChatDebugEnabled()) return
  const ts = new Date().toISOString()
  const cid = String(clientMessageId || '').trim()
  const lines = [`[CHAT][${source}] ${ts}`]
  if (cid) lines.push(`cid=${cid}`)
  if (conversationId) lines.push(`conversationId=${conversationId}`)
  if (status) lines.push(`status=${status}`)
  if (detail) lines.push(detail)
  console.info(lines.join('\n'))
}

export function logTransportTransition(source, conversationId, before, after) {
  if (!isChatDebugEnabled() || !before && !after) return
  const from = chatTransportStatus(before)
  const to = chatTransportStatus(after)
  if (from === to && before && after) return
  const cid = messageRowKey(after || before)
  chatLogStatus(source, {
    clientMessageId: cid,
    conversationId,
    from: before ? from : '(none)',
    to: after ? to : '(none)',
  })
}

/** Compare two message lists by clientMessageId; log transport changes. */
/** Grep-friendly lifecycle line: [CHAT][LIFECYCLE] cid=… event=… */
export function logChatLifecycle({
  clientMessageId = '',
  conversationId = '',
  event = '',
  statusBefore = '',
  statusAfter = '',
  source = '',
  detail = '',
} = {}) {
  if (!isChatDebugEnabled()) return
  const cid = String(clientMessageId || '').trim()
  const ev = String(event || '').trim()
  if (!cid && !ev) return
  const ts = new Date().toISOString()
  const lines = [
    '[CHAT][LIFECYCLE]',
    cid ? `cid=${cid}` : null,
    ev ? `event=${ev}` : null,
    statusBefore ? `statusBefore=${statusBefore}` : null,
    statusAfter ? `statusAfter=${statusAfter}` : null,
    source ? `source=${source}` : null,
    `timestamp=${ts}`,
    conversationId ? `conversationId=${conversationId}` : null,
    detail || null,
  ].filter(Boolean)
  console.info(lines.join('\n'))
}

export function logTransportListDiff(source, conversationId, beforeRows = [], afterRows = []) {
  if (!isChatDebugEnabled()) return
  const beforeMap = new Map()
  for (const row of beforeRows) {
    const key = messageRowKey(row)
    if (key) beforeMap.set(key, row)
  }
  const afterMap = new Map()
  for (const row of afterRows) {
    const key = messageRowKey(row)
    if (key) afterMap.set(key, row)
  }
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()])
  for (const key of keys) {
    const prev = beforeMap.get(key)
    const next = afterMap.get(key)
    if (!prev && next) {
      chatLogStatus(source, {
        clientMessageId: key,
        conversationId,
        from: '(none)',
        to: chatTransportStatus(next),
      })
      continue
    }
    if (prev && next) logTransportTransition(source, conversationId, prev, next)
  }
}
