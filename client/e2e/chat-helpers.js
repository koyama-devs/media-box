import { expect } from '@playwright/test'

export function guestChannelIsHuman() {
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (key?.startsWith('hana-chat-channel-') && window.localStorage.getItem(key) === 'human') {
      return true
    }
  }
  return false
}

const GUEST_CANONICAL = { gabu: 'gabusan', gabriel: 'gabusan' }

/** Seed guest session (same keys as App.jsx). */
export function seedGuestSession(page, guestKey = 'zen') {
  return page.addInitScript(({ key, canonMap }) => {
    const canon = canonMap[key] || key
    window.localStorage.setItem('media-share-lite-auth', 'true')
    window.localStorage.setItem('media-share-lite-role', 'guest')
    window.localStorage.setItem('media-share-lite-guest', key)
    for (const id of new Set([key, canon])) {
      window.localStorage.setItem(`hana-chat-channel-hana_${id}`, 'human')
      window.localStorage.setItem(`hana-chat-channel-guest-${id}`, 'human')
    }
    if (canon !== key) {
      window.localStorage.setItem(`hana-chat-channel-hana_${canon}`, 'human')
      window.localStorage.setItem(`hana-chat-channel-guest-${canon}`, 'human')
    }
  }, { key: guestKey, canonMap: GUEST_CANONICAL })
}

export function seedOwnerSession(page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('media-share-lite-auth', 'true')
    window.localStorage.setItem('media-share-lite-role', 'owner')
    window.localStorage.setItem('media-share-lite-guest', 'hana')
  })
}

export async function waitAppReady(page) {
  await expect(page.locator('#password')).toHaveCount(0, { timeout: 25_000 })
  await expect(page.getByTestId('hana-chat-launcher')).toBeVisible({ timeout: 25_000 })
}

export async function openChatPanel(page) {
  await page.getByTestId('hana-chat-launcher').click({ force: true })
  await expect(page.locator('.hana-chat-panel')).toBeVisible({ timeout: 20_000 })
}

export async function closeChatPanel(page) {
  await page.locator('.hana-chat-close').click({ force: true })
  await expect(page.locator('.hana-chat-panel')).toBeHidden({ timeout: 15_000 })
}

export async function ensureGuestHumanChannel(page) {
  await expect(page.getByTestId('hana-chat-input')).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => page.evaluate(guestChannelIsHuman)).toBe(true)
}

export async function openGuestHumanChat(page) {
  await openChatPanel(page)
  await ensureGuestHumanChannel(page)
}

export async function submitComposerText(page, body) {
  const input = page.getByTestId('hana-chat-input')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.fill(body)
  await page.locator('form.hana-chat-composer').evaluate((form) => {
    if (form instanceof HTMLFormElement) form.requestSubmit()
  })
}

/** React composer listens on change — use for typing indicator tests. */
export async function typeInComposer(page, text) {
  const input = page.getByTestId('hana-chat-input')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.click()
  await input.fill(text)
}

export async function waitMessagePersistedLocally(page, body, timeout = 45_000) {
  await expect.poll(async () => page.evaluate(async (needle) => {
    const openDb = () => new Promise((resolve, reject) => {
      const req = indexedDB.open('hana-chat-v2')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const db = await openDb()
    try {
      const threads = await new Promise((resolve, reject) => {
        const tx = db.transaction('messageThreads', 'readonly')
        const req = tx.objectStore('messageThreads').getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
      })
      for (const row of threads) {
        if (String(row.messagesJson || '').includes(needle)) return true
      }
      const messages = await new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readonly')
        const req = tx.objectStore('messages').getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
      })
      for (const row of messages) {
        const t = row.payload?.text || ''
        if (String(t).includes(needle)) return true
      }
      return false
    } finally {
      db.close()
    }
  }, body), { timeout }).toBe(true)
}

export function messageBubble(page, body) {
  return page.locator('.hana-chat-msg-row').filter({ hasText: body })
}

export async function expectBubbleVisible(page, body, timeout = 45_000) {
  await expect(messageBubble(page, body)).toBeVisible({ timeout })
}

export async function ownerSelectGuestByLabel(page, label) {
  await page.locator('.hana-chat-guest-select-trigger').click({ force: true })
  await expect(page.locator('.hana-chat-guest-menu')).toBeVisible({ timeout: 15_000 })
  await page.locator('.hana-chat-guest-option').filter({ hasText: label }).first().click({ force: true })
  await expect(page.getByTestId('hana-chat-input')).toBeVisible({ timeout: 20_000 })
}

export async function openOwnerChatWithGuest(page, guestLabel) {
  await openChatPanel(page)
  await ownerSelectGuestByLabel(page, guestLabel)
}

export async function dexieChatDbPresent(page) {
  return page.evaluate(async () => {
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
}
