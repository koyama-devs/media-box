import assert from 'node:assert/strict'
import test from 'node:test'

const { conversationIdForParticipants, conversationIdForGuestUser } = await import('./chatIdentity.js')

test('owner + guest uses same conversation id regardless of order', () => {
  const a = conversationIdForParticipants('hana', 'zen')
  const b = conversationIdForParticipants('zen', 'hana')
  assert.equal(a, b)
  assert.equal(a, 'hana_zen')
})

test('any guest shares one code path', () => {
  assert.equal(conversationIdForGuestUser('gabu'), 'hana_gabusan')
  assert.equal(conversationIdForGuestUser('hiro'), 'hana_hiro')
})

test('firestore thread id maps logical conversation to legacy chatThreads doc', async () => {
  const { firestoreThreadId, normalizeConversationId } = await import('./chatIdentity.js')
  assert.equal(firestoreThreadId('hana_zen'), 'guest-zen')
  assert.equal(firestoreThreadId('guest-zen'), 'guest-zen')
  assert.equal(normalizeConversationId('guest-gabusan'), 'hana_gabusan')
})
