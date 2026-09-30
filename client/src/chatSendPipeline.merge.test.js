import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
}

const { mergeServerMessagesWithPending, ingestLiveChatSnapshot } = await import('./chatSendPipeline.js')

test('merge drops pending when server doc id equals clientId', () => {
  store.clear()
  const server = [{
    id: 'pending-msg-1',
    clientId: 'pending-msg-1',
    sender: 'guest',
    text: 'hello',
    createdAtIso: '2026-01-01T00:00:00.000Z',
  }]
  const previous = [{
    id: 'pending-msg-1',
    clientId: 'pending-msg-1',
    pending: true,
    sender: 'guest',
    text: 'hello',
    createdAtIso: '2026-01-01T00:00:00.000Z',
  }]
  const merged = mergeServerMessagesWithPending(server, previous)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'pending-msg-1')
  assert.equal(merged[0].pending, undefined)
})

test('ingestLiveChatSnapshot persists server rows and merges pending', () => {
  store.clear()
  const merged = ingestLiveChatSnapshot({
    threadId: 'guest-gabusan',
    serverRows: [{
      id: 'doc-1',
      clientId: 'pending-msg-2',
      sender: 'hana',
      text: 'yo',
      createdAtIso: '2026-01-02T00:00:00.000Z',
    }],
    previous: [{
      id: 'pending-msg-2',
      clientId: 'pending-msg-2',
      pending: true,
      sender: 'hana',
      text: 'yo',
      createdAtIso: '2026-01-02T00:00:00.000Z',
    }],
  })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'doc-1')
})
