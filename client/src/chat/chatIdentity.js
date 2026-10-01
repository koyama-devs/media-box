/**

 * Conversation identity — one code path for every guest (no zen/gabu branches).

 * Standalone (no firebase import) so outbox/tests stay lightweight.

 *

 * Logical conversation id (Dexie / outbox / UI): `hana_{guestUserId}` (sorted pair).

 * Firestore thread doc id (legacy layout): `guest-{guestUserId}` via firestoreThreadId().

 */



export const CHAT_OWNER_USER_ID = 'hana'



const PASS_KEY_ALIASES = {

  gabu: 'gabusan',

  gabriel: 'gabusan',

}



export function normalizeChatUserId(raw = '') {

  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')

}



/** Maps login pass keys (gabu) → canonical user id (gabusan). */

export function resolveChatUserId(raw = '') {

  const needle = normalizeChatUserId(raw)

  if (!needle) return ''

  if (needle === 'hana') return CHAT_OWNER_USER_ID

  return PASS_KEY_ALIASES[needle] || needle

}



export function participantUserId(raw = '') {

  return resolveChatUserId(raw)

}



/**

 * Deterministic conversation id for two login users (LINE-style sorted pair).

 * Owner ↔ guest → `hana_{guest}` (same for every guest).

 */

export function conversationIdForParticipants(userA = '', userB = '') {

  const a = participantUserId(userA)

  const b = participantUserId(userB)

  if (!a && !b) return ''

  if (!a || !b) {

    const solo = a || b

    if (!solo || solo === CHAT_OWNER_USER_ID) return ''

    return `${CHAT_OWNER_USER_ID}_${solo}`

  }

  const owner = CHAT_OWNER_USER_ID

  if (a === owner || b === owner) {

    const guest = a === owner ? b : a

    return `${owner}_${guest}`

  }

  const [x, y] = [a, b].sort()

  return `${x}_${y}`

}



export function conversationIdForGuestUser(guestUserId = '') {

  return conversationIdForParticipants(CHAT_OWNER_USER_ID, guestUserId)

}



/** Logical conversation id for a guest login key (alias). */

export function humanChatThreadIdForUserKey(userKey = '') {

  return conversationIdForGuestUser(userKey)

}



export function humanUserKeyFromChatThreadId(threadId = '') {

  const id = String(threadId || '').trim()

  const legacy = id.match(/^guest-([a-z0-9_-]+)$/i)

  if (legacy) return resolveChatUserId(legacy[1])

  const sorted = id.match(/^hana_([a-z0-9_-]+)$/i)

  if (sorted) return resolveChatUserId(sorted[1])

  const parts = id.split('_')

  if (parts.length === 2 && parts.includes(CHAT_OWNER_USER_ID)) {

    const other = parts.find((p) => p !== CHAT_OWNER_USER_ID)

    return resolveChatUserId(other)

  }

  return ''

}



export function guestUserIdFromConversationId(conversationId = '') {

  return humanUserKeyFromChatThreadId(conversationId)

}



/** Normalize any legacy id to logical `hana_{guest}`. */

export function normalizeConversationId(conversationId = '') {

  const id = String(conversationId || '').trim()

  if (!id) return ''

  const guest = humanUserKeyFromChatThreadId(id)

  if (guest) return `${CHAT_OWNER_USER_ID}_${guest}`

  if (/^hana_[a-z0-9_-]+$/i.test(id)) return id

  return id

}



/**

 * Map logical conversation id → Firestore `chatThreads/{id}` document id.

 * Production data lives under `guest-{key}` until a full collection migration.

 */

export function firestoreThreadId(conversationId = '') {

  const logical = normalizeConversationId(conversationId)

  const guest = humanUserKeyFromChatThreadId(logical || conversationId)

  if (guest) return `guest-${guest}`

  const raw = String(conversationId || '').trim()

  if (/^guest-[a-z0-9_-]+$/i.test(raw)) return raw

  return raw

}



/** All ids that may refer to the same conversation in local storage. */

export function conversationIdAliases(conversationId = '') {

  const id = String(conversationId || '').trim()

  if (!id) return []

  const normalized = normalizeConversationId(id)

  const fs = firestoreThreadId(normalized || id)

  return [...new Set([id, normalized, fs].filter(Boolean))]

}


