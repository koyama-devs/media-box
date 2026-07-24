const BOOKMARKS_KEY = 'hana-mediabox-book-bookmarks'

function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

function loadAll() {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(BOOKMARKS_KEY)
  const parsed = safeParse(raw, {})
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed
}

function saveAll(bookmarks) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
}

/**
 * @returns {{ page: number, pageCount: number, updatedAt: string } | null}
 */
export function getBookBookmark(bookId) {
  if (!bookId) return null
  const entry = loadAll()[bookId]
  if (!entry || typeof entry !== 'object') return null
  const page = Number(entry.page)
  const pageCount = Number(entry.pageCount)
  if (!Number.isFinite(page) || page < 1) return null
  return {
    page: Math.floor(page),
    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 0,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
  }
}

export function getAllBookBookmarks() {
  return loadAll()
}

/**
 * Save しおり. Cleared automatically when the reader finishes the last page.
 */
export function setBookBookmark(bookId, page, pageCount) {
  if (!bookId) return null
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safeCount = Math.max(0, Math.floor(Number(pageCount) || 0))

  if (safeCount > 0 && safePage >= safeCount) {
    clearBookBookmark(bookId)
    return null
  }

  const next = {
    ...loadAll(),
    [bookId]: {
      page: safePage,
      pageCount: safeCount,
      updatedAt: new Date().toISOString(),
    },
  }
  saveAll(next)
  return next[bookId]
}

export function clearBookBookmark(bookId) {
  if (!bookId) return
  const all = loadAll()
  if (!(bookId in all)) return
  delete all[bookId]
  saveAll(all)
}
