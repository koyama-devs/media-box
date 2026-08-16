export function normalizeMessageSearchQuery(value) {
  return String(value || '').trim()
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function messageSearchHaystack(message, translation = '') {
  if (!message || message.deleted) return ''
  return [
    message.text,
    message.rawText,
    translation,
    message.replyTo?.text,
  ].map((part) => String(part || '')).join('\n')
}

export function messageMatchesSearch(message, query, translation = '') {
  const needle = normalizeMessageSearchQuery(query)
  if (!needle) return false
  const hay = messageSearchHaystack(message, translation)
  if (!hay) return false
  return hay.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

export function collectMessageSearchHits(messages, query, translations = {}) {
  const needle = normalizeMessageSearchQuery(query)
  if (!needle || !Array.isArray(messages)) return []
  return messages.filter((message) => (
    messageMatchesSearch(message, needle, translations[message.id] || '')
  )).map((message) => message.id)
}

export function splitHighlightedText(text, query) {
  const raw = String(text || '')
  const needle = normalizeMessageSearchQuery(query)
  if (!raw || !needle) return [{ type: 'text', value: raw }]
  const re = new RegExp(escapeRegExp(needle), 'gi')
  const parts = []
  let lastIndex = 0
  let match = re.exec(raw)
  let n = 0
  while (match && n < 80) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: raw.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'hit', value: match[0] })
    lastIndex = match.index + match[0].length
    match = re.exec(raw)
    n += 1
  }
  if (lastIndex < raw.length) {
    parts.push({ type: 'text', value: raw.slice(lastIndex) })
  }
  return parts.length ? parts : [{ type: 'text', value: raw }]
}
