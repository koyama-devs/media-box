import { expect, test } from '@playwright/test'
import {
  dexieChatDbPresent,
  openGuestHumanChat,
  seedGuestSession,
  submitComposerText,
  expectBubbleVisible,
  waitAppReady,
} from './chat-helpers.js'

test.describe('LINE-style chat E2E (guest → human → Firestore)', () => {
  test.setTimeout(180_000)

  test('zen session, open human chat, send message, IndexedDB present', async ({ page }) => {
    await seedGuestSession(page, 'zen')
    await page.goto('/')
    await waitAppReady(page)
    await openGuestHumanChat(page)

    const body = `e2e-human-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body)

    expect(await dexieChatDbPresent(page)).toBe(true)
  })
})
