import { test, expect } from '@playwright/test'
import { openGuestHumanChat, seedGuestSession, seedOwnerSession, waitAppReady } from './chat-helpers.js'

test.describe('Smoke — console errors & chat open', () => {
  test.setTimeout(120_000)

  for (const guest of ['zen', 'gabusan', 'hiro']) {
    test(`guest ${guest} loads app and opens chat without page errors`, async ({ page }) => {
      const pageErrors = []
      const consoleErrors = []
      page.on('pageerror', (err) => pageErrors.push(String(err)))
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await seedGuestSession(page, guest)
      await page.goto('/')
      await waitAppReady(page)
      await openGuestHumanChat(page)

      const fatal = pageErrors.filter((e) => !/ResizeObserver|Non-Error promise rejection/i.test(e))
      expect(fatal, `pageerror: ${fatal.join(' | ')}`).toEqual([])

      const chatFatals = consoleErrors.filter((t) => (
        /Uncaught|TypeError|ReferenceError|is not a function|Cannot read propert/i.test(t)
        && !/firebase|Firestore|PERMISSION|Failed to load resource/i.test(t)
      ))
      expect(chatFatals, `console: ${chatFatals.join(' | ')}`).toEqual([])
    })
  }

  test('owner password hana opens owner reply inbox in chat', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))

    await seedOwnerSession(page)
    await page.goto('/')
    await waitAppReady(page)

    await page.getByTestId('hana-chat-launcher').click({ force: true })
    await expect(page.locator('.hana-chat-panel')).toBeVisible({ timeout: 20_000 })

    expect(pageErrors.filter((e) => !/ResizeObserver/i.test(e))).toEqual([])
  })
})
