import { CHAT_DEFAULT_REACTION, CHAT_REACTION_EMOJIS } from './firebase'

const DEFAULT_REACTION_KEY = 'hana-chat-default-reaction'
const ENTER_TO_SEND_KEY = 'hana-chat-enter-to-send'
const MESSAGE_SOUND_KEY = 'hana-chat-message-sound'

const ALLOWED = new Set(CHAT_REACTION_EMOJIS)

export function readDefaultReaction() {
  try {
    const raw = String(window.localStorage.getItem(DEFAULT_REACTION_KEY) || '').trim()
    if (ALLOWED.has(raw)) return raw
  } catch {
    /* ignore */
  }
  return CHAT_DEFAULT_REACTION
}

export function writeDefaultReaction(emoji) {
  const next = ALLOWED.has(String(emoji || '').trim())
    ? String(emoji).trim()
    : CHAT_DEFAULT_REACTION
  try {
    window.localStorage.setItem(DEFAULT_REACTION_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

/** When true: Enter sends, Shift+Enter inserts a newline. Desktop/laptop only (UI ignores on touch). Default on. */
export function readEnterToSend() {
  try {
    const raw = window.localStorage.getItem(ENTER_TO_SEND_KEY)
    if (raw == null) return true
    return raw !== '0' && raw !== 'false'
  } catch {
    return true
  }
}

export function writeEnterToSend(enabled) {
  const next = Boolean(enabled)
  try {
    window.localStorage.setItem(ENTER_TO_SEND_KEY, next ? '1' : '0')
  } catch {
    /* ignore */
  }
  return next
}

/** Soft chime when a new chat message arrives while the tab is open. Default on. */
export function readMessageSound() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_SOUND_KEY)
    if (raw == null) return true
    return raw !== '0' && raw !== 'false'
  } catch {
    return true
  }
}

export function writeMessageSound(enabled) {
  const next = Boolean(enabled)
  try {
    window.localStorage.setItem(MESSAGE_SOUND_KEY, next ? '1' : '0')
  } catch {
    /* ignore */
  }
  return next
}
