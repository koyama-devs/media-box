import assert from 'node:assert/strict'
import test from 'node:test'

const { mergeMessagesByClientId, mergeServerWithOutboxPending } = await import('./chatMerge.js')

test('merge by clientMessageId — server wins status', () => {
  const local = [{
    clientId: 'abc',
    id: 'abc',
    text: 'hi',
    pending: true,
    status: 'pending',
    createdAtIso: '2026-01-01T00:00:01.000Z',
  }]
  const remote = [{
    clientId: 'abc',
    id: 'abc',
    text: 'hi',
    createdAtIso: '2026-01-01T00:00:01.000Z',
  }]
  const merged = mergeMessagesByClientId(local, remote)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].pending, false)
})

test('merge keeps UI sent when cache row is still pending', () => {
  const ui = [{
    clientId: 'abc',
    id: 'abc',
    text: 'hi',
    pending: false,
    status: 'sent',
    serverId: 'abc',
    createdAtIso: '2026-01-01T00:00:01.000Z',
  }]
  const cache = [{
    clientId: 'abc',
    id: 'abc',
    text: 'hi',
    pending: true,
    status: 'pending',
    createdAtIso: '2026-01-01T00:00:01.000Z',
  }]
  const merged = mergeMessagesByClientId(ui, cache)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].pending, false)
  assert.equal(merged[0].status, 'sent')
})

test('merge keeps local-only pending until server has same clientId', () => {
  const local = [{ clientId: 'x1', id: 'x1', text: 'offline', pending: true }]
  const remote = [{ clientId: 'y1', id: 'y1', text: 'other' }]
  const merged = mergeServerWithOutboxPending(remote, local)
  assert.equal(merged.length, 2)
})
