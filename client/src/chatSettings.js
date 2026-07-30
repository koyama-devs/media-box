import { CHAT_DEFAULT_REACTION, CHAT_REACTION_EMOJIS } from './firebase'

const DEFAULT_REACTION_KEY = 'hana-chat-default-reaction'
const ENTER_TO_SEND_KEY = 'hana-chat-enter-to-send'
const MESSAGE_SOUND_KEY = 'hana-chat-message-sound'
const STICKER_SET_OWNER_KEY = 'hana-chat-sticker-set-owner'
const STICKER_SET_GUEST_KEY = 'hana-chat-sticker-set-guest'
const TRANSLATE_LANG_KEY = 'hana-chat-translate-lang'

const ALLOWED_STICKER_SETS = new Set(['hana', 'kaito'])

/** Target languages for the chat 「翻訳」 action. `id` is sent as targetLang. */
export const CHAT_TRANSLATE_LANGS = [
  { id: 'ja', label: '日本語', short: 'JP' },
  { id: 'vi', label: 'ベトナム語', short: 'VI' },
  { id: 'en', label: '英語', short: 'EN' },
  { id: 'zh', label: '中国語', short: 'ZH' },
  { id: 'ko', label: '韓国語', short: 'KO' },
]

const ALLOWED_TRANSLATE_LANGS = new Set(CHAT_TRANSLATE_LANGS.map((item) => item.id))

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

/** Chat message translate target. Default Japanese. */
export function readTranslateLang() {
  try {
    const raw = String(window.localStorage.getItem(TRANSLATE_LANG_KEY) || '').trim().toLowerCase()
    if (ALLOWED_TRANSLATE_LANGS.has(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'ja'
}

export function writeTranslateLang(langId) {
  const next = ALLOWED_TRANSLATE_LANGS.has(String(langId || '').trim().toLowerCase())
    ? String(langId).trim().toLowerCase()
    : 'ja'
  try {
    window.localStorage.setItem(TRANSLATE_LANG_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

export function translateLangLabel(langId) {
  return CHAT_TRANSLATE_LANGS.find((item) => item.id === langId)?.label || '日本語'
}
