import { expect, test } from '@playwright/test'

/** Same keys as App.jsx — seed guest session without Firestore login round-trip. */
function seedGuestSession(page, guestKey = 'zen') {
  return page.addInitScript((key) => {
    window.localStorage.setItem('media-share-lite-auth', 'true')
    window.localStorage.setItem('media-share-lite-role', 'guest')
    window.localStorage.setItem('media-share-lite-guest', key)
  }, guestKey)
}

test.describe('LINE-style chat E2E (guest → human → Firestore)', () => {
  test.setTimeout(180_000)

  test('zen session, open human chat, send message, IndexedDB present', async ({ page }) => {
    await seedGuestSession(page, 'zen')
    await page.goto('/')

    await expect(page.locator('#password')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByTestId('hana-chat-launcher')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('hana-chat-launcher').click({ force: true })
    await page.getByRole('button', { name: '本物のはなと話したい' }).click({ force: true })

    const body = `e2e-human-${Date.now()}`
    const input = page.getByTestId('hana-chat-input')
    await expect(input).toBeVisible({ timeout: 20_000 })
    await input.fill(body)
    await page.locator('form.hana-chat-composer').evaluate((form) => {
      if (form instanceof HTMLFormElement) form.requestSubmit()
    })

    await expect(
      page.locator('.hana-chat-msg-row').filter({ hasText: body }),
    ).toBeVisible({ timeout: 45_000 })

    const hasDexieDb = await page.evaluate(async () => {
      if (typeof indexedDB?.databases === 'function') {
        const dbs = await indexedDB.databases()
        if (dbs.some((row) => row.name === 'hana-chat-v2')) return true
      }
      return new Promise((resolve) => {
        const req = indexedDB.open('hana-chat-v2')
        req.onsuccess = () => {
          req.result.close()
          resolve(true)
        }
        req.onerror = () => resolve(false)
      })
    })
    expect(hasDexieDb).toBe(true)

    await page.evaluate(() => {
      window.localStorage.setItem('hana-chat-channel-hana-zen', 'human')
      window.localStorage.setItem('hana-chat-channel-guest-zen', 'human')
    })

    await page.reload()
    await expect(page.getByTestId('hana-chat-launcher')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('hana-chat-launcher').click({ force: true })
    await expect(
      page.locator('.hana-chat-msg-row').filter({ hasText: body }),
    ).toBeVisible({ timeout: 45_000 })
  })
})
