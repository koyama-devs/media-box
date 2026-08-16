import { CHAT_DEFAULT_REACTION, CHAT_REACTION_EMOJIS } from './firebase'

const DEFAULT_REACTION_KEY = 'hana-chat-default-reaction'
const ENTER_TO_SEND_KEY = 'hana-chat-enter-to-send'
const MESSAGE_SOUND_KEY = 'hana-chat-message-sound'
const STICKER_SET_OWNER_KEY = 'hana-chat-sticker-set-owner'
const STICKER_SET_GUEST_KEY = 'hana-chat-sticker-set-guest'
const VOICE_SKIN_KEY = 'hana-chat-voice-skin'
const ALLOWED_VOICE_SKINS = new Set(['sakura', 'yozora', 'tegami', 'umi'])

const ALLOWED_STICKER_SETS = new Set(['hana', 'kaito'])

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

/**
 * Last-used sticker set on this device.
 * Owner/Hana defaults to `hana`; guests default to `kaito`.
 * Preferences are stored separately so a shared browser keeps both roles.
 * @param {{ asOwner?: boolean }} [opts]
 */
export function readStickerSet({ asOwner = false } = {}) {
  const fallback = asOwner ? 'hana' : 'kaito'
  const key = asOwner ? STICKER_SET_OWNER_KEY : STICKER_SET_GUEST_KEY
  try {
    const raw = String(window.localStorage.getItem(key) || '').trim().toLowerCase()
    if (ALLOWED_STICKER_SETS.has(raw)) return raw
  } catch {
    /* ignore */
  }
  return fallback
}

/**
 * @param {string} setId
 * @param {{ asOwner?: boolean }} [opts]
 */
export function writeStickerSet(setId, { asOwner = false } = {}) {
  const next = ALLOWED_STICKER_SETS.has(String(setId || '').trim().toLowerCase())
    ? String(setId).trim().toLowerCase()
    : (asOwner ? 'hana' : 'kaito')
  const key = asOwner ? STICKER_SET_OWNER_KEY : STICKER_SET_GUEST_KEY
  try {
    window.localStorage.setItem(key, next)
  } catch {
    /* ignore */
  }
  return next
}

export function readVoiceSkin() {
  try {
    const raw = String(window.localStorage.getItem(VOICE_SKIN_KEY) || '').trim().toLowerCase()
    if (ALLOWED_VOICE_SKINS.has(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'sakura'
}

export function writeVoiceSkin(skinId) {
  const next = ALLOWED_VOICE_SKINS.has(String(skinId || '').trim().toLowerCase())
    ? String(skinId).trim().toLowerCase()
    : 'sakura'
  try {
    window.localStorage.setItem(VOICE_SKIN_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}
