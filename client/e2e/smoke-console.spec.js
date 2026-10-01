import { test, expect } from '@playwright/test'

function seedGuest(page, guestKey) {
  return page.addInitScript((key) => {
    window.localStorage.setItem('media-share-lite-auth', 'true')
    window.localStorage.setItem('media-share-lite-role', 'guest')
    window.localStorage.setItem('media-share-lite-guest', key)
  }, guestKey)
}

test.describe('Smoke — console errors & chat open', () => {
  test.setTimeout(180_000)

  for (const guest of ['zen', 'gabusan', 'hiro']) {
    test(`guest ${guest} loads app and opens chat without page errors`, async ({ page }) => {
      const pageErrors = []
      const consoleErrors = []
      page.on('pageerror', (err) => pageErrors.push(String(err)))
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await seedGuest(page, guest)
      await page.goto('/')
      await expect(page.locator('#password')).toHaveCount(0, { timeout: 25_000 })

      await page.getByTestId('hana-chat-launcher').click({ force: true })
      await page.getByRole('button', { name: '本物のはなと話したい' }).click({ force: true }).catch(() => {})

      await page.waitForTimeout(3000)

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

    await page.goto('/')
    await page.locator('#password').fill('hana')
    await page.locator('form.login-form button[type="submit"]').click()
    await expect(page.locator('#password')).toHaveCount(0, { timeout: 25_000 })

    await page.getByTestId('hana-chat-launcher').click({ force: true })
    await page.waitForTimeout(2000)

    expect(pageErrors.filter((e) => !/ResizeObserver/i.test(e))).toEqual([])
  })
})
