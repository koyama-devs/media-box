import assert from 'node:assert/strict'
import test from 'node:test'
import { getMessageDeliveryStatus } from '../firebase.js'

test('read requires delivered — not unreadByGuest=false alone', () => {
  const thread = {
    unreadByGuest: false,
    guestLastReadAtIso: '2026-01-01T00:00:00.000Z',
  }
  const message = {
    sender: 'hana',
    id: 'new-msg',
    clientId: 'new-msg',
    createdAtIso: '2026-06-01T12:00:00.000Z',
    pending: false,
  }
  assert.equal(getMessageDeliveryStatus(message, thread, 'hana'), 'sent')
})

test('read only after delivered cursor matches', () => {
  const thread = {
    hanaLastDeliveredMessageId: 'm1',
    guestLastReadMessageId: 'm1',
    hanaLastDeliveredAtIso: '2026-06-01T12:00:01.000Z',
    guestLastReadAtIso: '2026-06-01T12:00:02.000Z',
  }
  const message = {
    sender: 'hana',
    id: 'm1',
    clientId: 'm1',
    createdAtIso: '2026-06-01T12:00:00.000Z',
  }
  assert.equal(getMessageDeliveryStatus(message, thread, 'hana'), 'read')
})

test('guest sender uses guestLastDelivered from hana ack', () => {
  const thread = {
    guestLastDeliveredMessageId: 'g1',
    guestLastDeliveredAtIso: '2026-06-01T12:00:01.000Z',
  }
  const message = {
    sender: 'guest',
    id: 'g1',
    createdAtIso: '2026-06-01T12:00:00.000Z',
  }
  assert.equal(getMessageDeliveryStatus(message, thread, 'guest'), 'delivered')
})

test('pending outbound shows sending', () => {
  const message = {
    sender: 'guest',
    id: 'local-1',
    pending: true,
    status: 'sending',
    createdAtIso: new Date().toISOString(),
  }
  assert.equal(getMessageDeliveryStatus(message, {}, 'guest'), 'sending')
})
