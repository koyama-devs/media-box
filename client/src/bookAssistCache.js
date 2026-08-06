/**
 * Local cache for owner-only book page assist (VI translation + hiragana reading).
 * Keyed by bookId + page. Guests never see this UI.
 */

const STORAGE_KEY = 'hana-book-assist-cache-v1'
const MAX_BOOKS = 8
const MAX_PAGES_PER_BOOK = 40

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage full or blocked */
  }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const translationVi = String(raw.translationVi || '').trim()
  const readingHiragana = String(raw.readingHiragana || '').trim()
  if (!translationVi && !readingHiragana) return null
  return {
    translationVi,
    readingHiragana,
    savedAt: Number(raw.savedAt) || Date.now(),
  }
}

function pageKey(page) {
  return String(Math.max(1, Math.floor(Number(page) || 1)))
}

/**
 * @returns {{ translationVi: string, readingHiragana: string } | null}
 */
export function readBookAssistCache(bookId, page) {
  const book = String(bookId || '').trim()
  if (!book) return null
  const entry = normalizeEntry(readStore()[book]?.[pageKey(page)])
  return entry
    ? { translationVi: entry.translationVi, readingHiragana: entry.readingHiragana }
    : null
}

export function writeBookAssistCache(bookId, page, assist) {
  const book = String(bookId || '').trim()
  if (!book) return
  const entry = normalizeEntry({ ...assist, savedAt: Date.now() })
  if (!entry) return

  const store = readStore()
  const current = store[book] && typeof store[book] === 'object' ? store[book] : {}
  const nextPages = { ...current, [pageKey(page)]: entry }

  const trimmedPages = Object.fromEntries(
    Object.entries(nextPages)
      .sort((a, b) => (Number(b[1]?.savedAt) || 0) - (Number(a[1]?.savedAt) || 0))
      .slice(0, MAX_PAGES_PER_BOOK),
  )

  const nextStore = { ...store, [book]: trimmedPages }
  const ranked = Object.entries(nextStore)
    .map(([id, pages]) => {
      const savedAt = Object.values(pages || {})
        .reduce((best, item) => Math.max(best, Number(item?.savedAt) || 0), 0)
      return [id, pages, savedAt]
    })
    .sort((a, b) => b[2] - a[2])
    .slice(0, MAX_BOOKS)

  writeStore(Object.fromEntries(ranked.map(([id, pages]) => [id, pages])))
}
