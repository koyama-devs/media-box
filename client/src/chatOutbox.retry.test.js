import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
const fakeLocalStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(key, String(value))
  },
  removeItem(key) {
    store.delete(key)
  },
}

globalThis.window = { localStorage: fakeLocalStorage }

const {
  deliverChatOutbox,
  listChatOutbox,
  listChatRecoveryForThread,
  upsertChatOutbox,
  markChatOutboxSent,
  resolveRetryableOutboxEntry,
  listChatOutboxForThread,
  reconcileChatDeliveryStorage,
} = await import('./chatOutbox.js')

test('outbox recovery keeps pending bubble for canonical guest thread', () => {
  store.clear()
  const entry = {
    clientId: 'pending-msg-1',
    threadId: 'guest-hiro',
    guestKey: 'hiro',
    text: 'hello',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  }

  upsertChatOutbox(entry)
  const rows = listChatOutboxForThread('guest-hiro')
  const retryLocal = resolveRetryableOutboxEntry({
    threadId: 'guest-hiro',
    guestKey: 'hiro',
    clientId: 'pending-msg-1',
    messages: [],
  })

  assert.equal(rows.length, 1)
  assert.equal(retryLocal?.clientId, 'pending-msg-1')
  assert.equal(retryLocal?.pending, true)
  assert.equal(retryLocal?.serverId, undefined)
})

test('retry lookup falls back to outbox when live messages list is empty', () => {
  store.clear()
  upsertChatOutbox({
    clientId: 'pending-msg-2',
    threadId: 'guest-zen',
    guestKey: 'zen',
    text: 'saved after reload',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  })

  const retryLocal = resolveRetryableOutboxEntry({
    threadId: 'guest-zen',
    guestKey: 'zen',
    clientId: 'pending-msg-2',
    messages: [],
  })

  assert.ok(retryLocal)
  assert.equal(retryLocal.pending, true)
  assert.equal(retryLocal.sendFailed, false)
})

test('reload lookup matches legacy thread ids for every guest identity', () => {
  for (const [index, guestKey] of ['hiro', 'zen', 'gabusan', 'gabu'].entries()) {
    store.clear()
    upsertChatOutbox({
      clientId: `pending-msg-${index + 3}`,
      threadId: 'legacy-random-thread',
      guestKey,
      text: `sent before closing: ${guestKey}`,
      sender: 'guest',
      createdAtIso: new Date().toISOString(),
    })

    const rows = listChatOutboxForThread('legacy-random-thread', guestKey)

    assert.equal(rows.length, 1, guestKey)
    assert.equal(rows[0].clientId, `pending-msg-${index + 3}`)
  }
})

test('pending outbox exists even when the channel preference was not persisted', () => {
  store.clear()
  upsertChatOutbox({
    clientId: 'pending-before-channel-save',
    threadId: 'guest-zen',
    guestKey: 'zen',
    text: 'must survive immediate close',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  })

  assert.equal(listChatOutboxForThread('guest-zen', 'zen').length, 1)
})

test('admin-deleted server copy drops archived outbox so reload does not replay', () => {
  store.clear()
  upsertChatOutbox({
    clientId: 'pending-deleted',
    threadId: 'guest-gabusan',
    guestKey: 'gabusan',
    text: 'Test1',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  })
  deliverChatOutbox('pending-deleted', 'server-deleted-1')
  assert.equal(listChatRecoveryForThread('guest-gabusan', 'gabusan').length, 1)
  reconcileChatDeliveryStorage([], 'guest-gabusan', 'gabusan')
  assert.equal(listChatRecoveryForThread('guest-gabusan', 'gabusan').length, 0)
})

test('pending test junk is dropped when absent from server snapshot', () => {
  store.clear()
  upsertChatOutbox({
    clientId: 'pending-testx',
    threadId: 'guest-gabusan',
    guestKey: 'gabusan',
    text: 'Testx',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  })
  const isTest = (body) => String(body || '').toLowerCase() === 'testx'
  reconcileChatDeliveryStorage([], 'guest-gabusan', 'gabusan', isTest)
  assert.equal(listChatOutbox().length, 0)
})

test('successful write stays durable until the server snapshot confirms it', () => {
  store.clear()
  upsertChatOutbox({
    clientId: 'pending-confirmation',
    threadId: 'guest-gabusan',
    guestKey: 'gabu',
    text: 'keep me until snapshot',
    sender: 'guest',
    createdAtIso: new Date().toISOString(),
  })

  markChatOutboxSent('pending-confirmation', 'server-message-1')
  const entry = listChatOutbox()[0]
  const restored = resolveRetryableOutboxEntry({
    threadId: 'guest-gabusan',
    guestKey: 'gabusan',
    clientId: 'pending-confirmation',
    messages: [],
  })

  assert.equal(entry.serverId, 'server-message-1')
  assert.equal(restored?.serverId, 'server-message-1')
  assert.equal(restored?.pending, false)
})
