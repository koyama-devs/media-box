import { expect, test } from '@playwright/test'
import {
  closeChatPanel,
  dexieChatDbPresent,
  ensureGuestHumanChannel,
  expectBubbleVisible,
  messageBubble,
  openChatPanel,
  openGuestHumanChat,
  openOwnerChatWithGuest,
  seedGuestSession,
  seedOwnerSession,
  submitComposerText,
  typeInComposer,
  waitAppReady,
  waitMessagePersistedLocally,
} from './chat-helpers.js'

test.describe('Chat — LINE-style cases (browser)', () => {
  test.setTimeout(180_000)

  for (const guestKey of ['zen', 'gabusan']) {
    test(`guest ${guestKey}: optimistic bubble + Dexie`, async ({ page }) => {
      await seedGuestSession(page, guestKey)
      await page.goto('/')
      await waitAppReady(page)
      await openGuestHumanChat(page)

      const body = `e2e-opt-${guestKey}-${Date.now()}`
      const t0 = Date.now()
      await submitComposerText(page, body)
      await expectBubbleVisible(page, body, 45_000)
      expect(Date.now() - t0).toBeLessThan(20_000)

      expect(await dexieChatDbPresent(page)).toBe(true)
    })
  }

  test('guest zen: bubble survives close/reopen panel', async ({ page }) => {
    await seedGuestSession(page, 'zen')
    await page.goto('/')
    await waitAppReady(page)
    await openGuestHumanChat(page)

    const body = `e2e-reopen-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body)
    await waitMessagePersistedLocally(page, body)

    await closeChatPanel(page)
    await openChatPanel(page)
    await ensureGuestHumanChannel(page)
    await expectBubbleVisible(page, body, 15_000)
  })

  test('guest zen: bubble survives full reload', async ({ page }) => {
    await seedGuestSession(page, 'zen')
    await page.goto('/')
    await waitAppReady(page)
    await openGuestHumanChat(page)

    const body = `e2e-reload-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body, 45_000)
    await waitMessagePersistedLocally(page, body)

    await page.reload()
    await waitAppReady(page)
    await openGuestHumanChat(page)
    await expectBubbleVisible(page, body, 30_000)
  })

  test('guest gabu alias: opens human chat and sends', async ({ page }) => {
    await seedGuestSession(page, 'gabu')
    await page.goto('/')
    await waitAppReady(page)
    await openGuestHumanChat(page)

    const body = `e2e-gabu-alias-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body, 45_000)
  })

  test('owner: select ぜん thread and send', async ({ page }) => {
    await seedOwnerSession(page)
    await page.goto('/')
    await waitAppReady(page)
    await openOwnerChatWithGuest(page, 'ぜん')

    const body = `e2e-owner-zen-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body, 45_000)
  })

  test('typing: owner draft → guest sees はなが入力中', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const guestPage = await guestContext.newPage()

    try {
      await seedOwnerSession(ownerPage)
      await seedGuestSession(guestPage, 'zen')

      await ownerPage.goto('/')
      await guestPage.goto('/')
      await waitAppReady(ownerPage)
      await waitAppReady(guestPage)

      await openOwnerChatWithGuest(ownerPage, 'ぜん')
      await openGuestHumanChat(guestPage)

      await typeInComposer(ownerPage, 'typing probe owner')

      await expect(guestPage.getByTestId('hana-chat-partner-typing')).toHaveClass(/is-visible/, { timeout: 25_000 })
      await expect(guestPage.getByTestId('hana-chat-partner-typing')).toContainText('はなが入力中')
    } finally {
      await ownerContext.close()
      await guestContext.close()
    }
  })

  test('typing: guest draft → owner sees partner typing', async ({ browser }) => {
    const ownerContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const guestPage = await guestContext.newPage()

    try {
      await seedOwnerSession(ownerPage)
      await seedGuestSession(guestPage, 'zen')

      await ownerPage.goto('/')
      await guestPage.goto('/')
      await waitAppReady(ownerPage)
      await waitAppReady(guestPage)

      await openOwnerChatWithGuest(ownerPage, 'ぜん')
      await openGuestHumanChat(guestPage)

      await typeInComposer(guestPage, 'typing probe guest')

      await expect(ownerPage.getByTestId('hana-chat-partner-typing')).toHaveClass(/is-visible/, { timeout: 25_000 })
      await expect(ownerPage.getByTestId('hana-chat-partner-typing')).toContainText('入力中')
    } finally {
      await ownerContext.close()
      await guestContext.close()
    }
  })

  test('guest send: message list not wiped while listener connects', async ({ page }) => {
    await seedGuestSession(page, 'zen')
    await page.goto('/')
    await waitAppReady(page)
    await openGuestHumanChat(page)

    const body = `e2e-no-wipe-${Date.now()}`
    await submitComposerText(page, body)
    await expectBubbleVisible(page, body)

    await expect.poll(async () => {
      const count = await messageBubble(page, body).count()
      return count >= 1
    }, { timeout: 10_000, intervals: [500] }).toBe(true)
  })
})
