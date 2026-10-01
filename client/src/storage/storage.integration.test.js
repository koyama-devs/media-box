import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  },
}

const { resetOutboxStoreForTests, persistOutboxEntriesSync, listOutboxEntriesSync, hydrateOutboxStore } = await import('./outboxStore.js')
const { resetMessageStoreForTests, saveThreadMessages, loadThreadMessages, hydrateMessageStore } = await import('./messageStore.js')

test('Dexie outbox round-trip survives hydrate', async () => {
  store.clear()
  resetOutboxStoreForTests()
  resetMessageStoreForTests()
  persistOutboxEntriesSync([{
    clientId: 'uuid-1',
    threadId: 'guest-zen',
    conversationId: 'guest-zen',
    text: 'offline',
    sender: 'guest',
    status: 'pending',
    createdAtIso: new Date().toISOString(),
  }])
  await hydrateOutboxStore()
  resetOutboxStoreForTests()
  await hydrateOutboxStore()
  const rows = listOutboxEntriesSync()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].clientId, 'uuid-1')
})

test('Dexie message thread round-trip', async () => {
  store.clear()
  resetMessageStoreForTests()
  await saveThreadMessages('guest-zen', [
    { id: 'a1', clientId: 'a1', text: 'hello', createdAtIso: '2026-01-01T00:00:00.000Z' },
  ])
  await hydrateMessageStore()
  resetMessageStoreForTests()
  await hydrateMessageStore()
  const rows = await loadThreadMessages('guest-zen')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'hello')
})
