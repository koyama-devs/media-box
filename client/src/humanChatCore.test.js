import assert from 'node:assert/strict'
import test from 'node:test'
import { createHumanChatController, mergeHumanServerMessages, sortHumanMessages } from './humanChatCore.js'

test('human messages preserve client timestamp and dedupe server rows', () => {
  const rows = sortHumanMessages([
    { id: 'a', clientId: 'same', text: 'hello', createdAtIso: '2026-09-30T10:00:00.000Z' },
    { id: 'b', clientId: 'same', text: 'hello', createdAtIso: '2026-09-30T10:00:00.000Z' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].createdAtIso, '2026-09-30T10:00:00.000Z')
})

test('controller sends with immutable timestamp and restores pending outbox', async () => {
  let subscriber = null
  const sent = []
  const adapter = {
    async loadCache() { return [] },
    subscribe(_threadId, _guestKey, onData) {
      subscriber = onData
      return () => { subscriber = null }
    },
    saveOutbox() {},
    async send(payload) {
      sent.push(payload)
      return 'server-1'
    },
  }
  const controller = createHumanChatController({ adapter, now: () => '2026-09-30T10:01:00.000Z' })
  await controller.connect({ nextThreadId: 'guest-zen', nextGuestKey: 'zen' })
  await controller.send({ text: 'hello', sender: 'guest', clientId: 'client-1' })
  assert.equal(sent[0].createdAtIso, '2026-09-30T10:01:00.000Z')
  subscriber?.([{ id: 'server-1', clientId: 'client-1', text: 'hello', sender: 'guest', createdAtIso: sent[0].createdAtIso }])
  assert.equal(mergeHumanServerMessages(controller.getState().messages).length, 1)
})
