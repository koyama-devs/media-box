import { CHAT_DEFAULT_REACTION, CHAT_REACTION_EMOJIS } from './firebase'

const DEFAULT_REACTION_KEY = 'hana-chat-default-reaction'

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
