/**
 * Unified human send — same path for owner, guest, admin (no per-guest branches).
 */

import { deliverChatOutbox, upsertChatOutbox } from '../chatOutbox.js'
import { runDirectSendWithOutbox } from '../chatSendPipeline.js'
import {
    CHAT_OWNER_USER_ID,
    conversationIdForGuestUser,
    conversationIdForParticipants,
} from './chatIdentity.js'
import { newClientMessageId } from './clientMessageId.js'

export function resolveHumanConversationId({ actingAsOwner, guestUserId, threadId = '' } = {}) {
  const fromGuest = conversationIdForGuestUser(guestUserId)
  if (fromGuest) return fromGuest
  if (actingAsOwner && guestUserId) return conversationIdForParticipants(CHAT_OWNER_USER_ID, guestUserId)
  const raw = String(threadId || '').trim()
  if (raw.startsWith('guest-')) return raw
  return raw
}

export function createOutboxSendJob({
  conversationId,
  text,
  sender,
  guestUserId = '',
  guestLabel = '',
  clientId = newClientMessageId(),
  createdAtIso = new Date().toISOString(),
  replyTo = null,
  extra = {},
  inFlightMap,
  runSend,
}) {
  const threadId = String(conversationId || '').trim()
  if (!threadId) {
    return Promise.reject(Object.assign(new Error('conversationId required'), { code: 'chat/invalid-thread' }))
  }
  const cid = String(clientId || '').trim() || newClientMessageId()
  const iso = String(createdAtIso || '').trim() || new Date().toISOString()
  const outboxEntry = {
    clientId: cid,
    threadId,
    text: String(text || '').trim(),
    sender: sender === 'hana' ? 'hana' : 'guest',
    guestKey: guestUserId,
    guestLabel,
    replyTo,
    createdAtIso: iso,
    ...extra,
  }
  return runDirectSendWithOutbox({
    upsertChatOutbox,
    deliverChatOutbox,
    outboxEntry,
    inFlightMap,
    runSend: () => runSend({
      clientId: cid,
      createdAtIso: iso,
      conversationId: threadId,
      outboxEntry,
    }),
  })
}
