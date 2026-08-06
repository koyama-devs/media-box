/**
 * Local cache for the owner-only はな専用 cards (Vietnamese translation, reading,
 * reply drafts). Gemini results are expensive and were previously kept in React
 * state only, so closing the app lost every card and reopening had to re-analyze
 * (and showed nothing at all when that call failed). Nothing here is shared with
 * guests — it stays in the owner's own browser storage.
 */

// v2: cards created before the fuller/politeness-aware reply drafts are dropped.
const STORAGE_KEY = 'hana-owner-assist-cache-v2'
const MAX_THREADS = 12
const MAX_PER_THREAD = 60

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
    /* storage full or blocked — the cards still work in memory */
  }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const replies = Array.isArray(raw.replies)
    ? raw.replies
      .map((item) => ({ ja: String(item?.ja || ''), vi: String(item?.vi || '') }))
      .filter((item) => item.ja)
    : []
  const translationVi = String(raw.translationVi || '')
  const readingHiragana = String(raw.readingHiragana || '')
  if (!translationVi && !readingHiragana && !replies.length) return null
  return {
    translationVi,
    readingHiragana,
    replies,
    text: String(raw.text || ''),
    savedAt: Number(raw.savedAt) || 0,
  }
}

function newestFirst(entries) {
  return entries.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))
}

/**
 * Restore a thread's cards as ready-to-render assist state.
 * @returns {Record<string, object>} keyed by message id
 */
export function readOwnerAssistCache(threadId) {
  const key = String(threadId || '').trim()
  if (!key) return {}
  const thread = readStore()[key]
  if (!thread || typeof thread !== 'object') return {}
  const restored = {}
  Object.entries(thread).forEach(([messageId, raw]) => {
    const entry = normalizeEntry(raw)
    if (!entry) return
    restored[messageId] = {
      status: 'ready',
      translationVi: entry.translationVi,
      readingHiragana: entry.readingHiragana,
      replies: entry.replies,
      reason: null,
      sourceText: entry.text,
    }
  })
  return restored
}

export function writeOwnerAssistCache(threadId, messageId, assist, sourceText = '') {
  const thread = String(threadId || '').trim()
  const id = String(messageId || '').trim()
  if (!thread || !id) return
  const entry = normalizeEntry({ ...assist, text: sourceText, savedAt: Date.now() })
  if (!entry) return

  const store = readStore()
  const current = store[thread] && typeof store[thread] === 'object' ? store[thread] : {}
  const next = { ...current, [id]: entry }

  const trimmed = Object.fromEntries(newestFirst(Object.entries(next)).slice(0, MAX_PER_THREAD))
  const threads = { ...store, [thread]: trimmed }

  const ranked = Object.entries(threads)
    .map(([tid, entries]) => {
      const savedAt = Object.values(entries || {})
        .reduce((best, item) => Math.max(best, Number(item?.savedAt) || 0), 0)
      return [tid, entries, savedAt]
    })
    .sort((a, b) => b[2] - a[2])
    .slice(0, MAX_THREADS)

  writeStore(Object.fromEntries(ranked.map(([tid, entries]) => [tid, entries])))
}

export function dropOwnerAssistCache(threadId, messageId) {
  const thread = String(threadId || '').trim()
  const id = String(messageId || '').trim()
  if (!thread || !id) return
  const store = readStore()
  if (!store[thread]?.[id]) return
  const next = { ...store[thread] }
  delete next[id]
  writeStore({ ...store, [thread]: next })
}
