/** Personal chat extras (pin / reminders) — keyed by profile id. */

function safeParse(raw, fallback) {
  try {
    const value = JSON.parse(raw)
    return value ?? fallback
  } catch {
    return fallback
  }
}

function readList(key) {
  try {
    return safeParse(window.localStorage.getItem(key), [])
  } catch {
    return []
  }
}

function writeList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* ignore quota */
  }
}

function pinsKey(profileId) {
  return `hana-chat-pins-${String(profileId || 'guest')}`
}

function remindersKey(profileId) {
  return `hana-chat-reminders-${String(profileId || 'guest')}`
}

export function loadChatPins(profileId) {
  const list = readList(pinsKey(profileId))
  return Array.isArray(list) ? list : []
}

export function isMessagePinned(profileId, messageId) {
  return loadChatPins(profileId).some((entry) => entry.messageId === messageId)
}

export function toggleChatPin(profileId, message, meta = {}) {
  const key = pinsKey(profileId)
  const list = loadChatPins(profileId)
  const messageId = String(message?.id || '')
  if (!messageId) return { pinned: false, list }
  const existing = list.findIndex((entry) => entry.messageId === messageId)
  if (existing >= 0) {
    list.splice(existing, 1)
    writeList(key, list)
    return { pinned: false, list }
  }
  const next = [
    {
      messageId,
      threadId: String(meta.threadId || ''),
      text: String(message.rawText || message.text || '').slice(0, 500),
      sender: String(message.sender || message.role || ''),
      createdAt: message.createdAt || null,
      pinnedAt: new Date().toISOString(),
    },
    ...list,
  ].slice(0, 40)
  writeList(key, next)
  return { pinned: true, list: next }
}

export function unpinChatMessage(profileId, messageId) {
  const key = pinsKey(profileId)
  const next = loadChatPins(profileId).filter((entry) => entry.messageId !== messageId)
  writeList(key, next)
  return next
}

export function loadChatReminders(profileId) {
  const list = readList(remindersKey(profileId))
  return Array.isArray(list) ? list : []
}

export function addChatReminder(profileId, message, remindAtIso, meta = {}) {
  const key = remindersKey(profileId)
  const text = String(message?.rawText || message?.text || '').trim()
  if (!text || !remindAtIso) return null
  const entry = {
    id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.slice(0, 500),
    messageId: String(message.id || ''),
    threadId: String(meta.threadId || ''),
    remindAt: remindAtIso,
    createdAt: new Date().toISOString(),
    done: false,
  }
  const next = [entry, ...loadChatReminders(profileId)].slice(0, 80)
  writeList(key, next)
  return entry
}

export function dueChatReminders(profileId, now = Date.now()) {
  return loadChatReminders(profileId).filter((entry) => {
    if (entry.done) return false
    const t = new Date(entry.remindAt).getTime()
    return !Number.isNaN(t) && t <= now
  })
}

export function markChatReminderDone(profileId, reminderId) {
  const key = remindersKey(profileId)
  const next = loadChatReminders(profileId).map((entry) => (
    entry.id === reminderId ? { ...entry, done: true } : entry
  ))
  writeList(key, next)
  return next
}

/** Build remindAt ISO from a preset choice. */
export function remindAtFromChoice(choice) {
  const now = Date.now()
  if (choice === '1h') return new Date(now + 60 * 60 * 1000).toISOString()
  if (choice === '3h') return new Date(now + 3 * 60 * 60 * 1000).toISOString()
  if (choice === 'tomorrow') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }
  if (choice === 'tonight') {
    const d = new Date()
    d.setHours(21, 0, 0, 0)
    if (d.getTime() <= now) d.setDate(d.getDate() + 1)
    return d.toISOString()
  }
  return null
}
