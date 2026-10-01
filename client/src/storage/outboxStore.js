import { chatDb } from './db.js'

/** @deprecated Legacy localStorage keys — migrated once into Dexie, then cleared. */
export const LEGACY_OUTBOX_LS_KEY = 'hana-chat-outbox-v1'
export const LEGACY_ARCHIVE_LS_KEY = 'hana-chat-archive-v1'

const OUTBOX_MAX = 40
const ARCHIVE_MAX = 1000

/** In-memory mirror for sync reads (UI + worker). Authoritative copy is Dexie. */
let outboxCache = null
let archiveCache = null
let hydratePromise = null

function safeParse(raw) {
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function normalizeEntry(entry) {
  if (!entry?.clientId) return null
  const conversationId = String(entry.conversationId || entry.threadId || '').trim()
  const createdAt = Number(entry.createdAt)
    || Date.parse(entry.createdAtIso || '') || Date.now()
  return {
    ...entry,
    threadId: String(entry.threadId || conversationId).trim(),
    conversationId,
    retryCount: Math.max(0, Math.floor(Number(entry.retryCount) || 0)),
    nextRetryAt: Math.max(0, Math.floor(Number(entry.nextRetryAt) || 0)),
    status: String(entry.status || 'pending'),
    createdAt,
  }
}

function entryToDexieRow(entry) {
  const row = normalizeEntry(entry)
  if (!row) return null
  return {
    clientId: row.clientId,
    conversationId: row.conversationId || row.threadId,
    payload: row,
    retryCount: row.retryCount,
    nextRetryAt: row.nextRetryAt,
    status: row.status,
    createdAt: row.createdAt,
  }
}

function dexieRowToEntry(row) {
  if (!row) return null
  const base = row.payload && typeof row.payload === 'object' ? row.payload : row
  return normalizeEntry({ ...base, clientId: row.clientId || base.clientId })
}

function ensureOutboxMemoryLoaded() {
  if (outboxCache !== null) return
  if (typeof window !== 'undefined' && window.localStorage) {
    outboxCache = safeParse(window.localStorage.getItem(LEGACY_OUTBOX_LS_KEY))
  } else {
    outboxCache = []
  }
}

function ensureArchiveMemoryLoaded() {
  if (archiveCache !== null) return
  if (typeof window !== 'undefined' && window.localStorage) {
    archiveCache = safeParse(window.localStorage.getItem(LEGACY_ARCHIVE_LS_KEY))
  } else {
    archiveCache = []
  }
}

async function writeOutboxToDexie(rows) {
  if (typeof indexedDB === 'undefined') return
  try {
    await chatDb.transaction('rw', chatDb.outbox, async () => {
      await chatDb.outbox.clear()
      const dexieRows = rows.map(entryToDexieRow).filter(Boolean)
      if (dexieRows.length) await chatDb.outbox.bulkPut(dexieRows)
    })
  } catch {
    /* Dexie unavailable — memory cache still holds data for this session */
  }
}

async function writeArchiveToDexie(rows) {
  if (typeof indexedDB === 'undefined') return
  try {
    await chatDb.transaction('rw', chatDb.outboxArchive, async () => {
      await chatDb.outboxArchive.clear()
      const dexieRows = rows.map((entry) => {
        const row = entryToDexieRow(entry)
        if (!row) return null
        return { ...row, archivedAt: Date.now() }
      }).filter(Boolean)
      if (dexieRows.length) await chatDb.outboxArchive.bulkPut(dexieRows)
    })
  } catch {
    /* ignore */
  }
}

function clearLegacyOutboxLocalStorage() {
  try {
    window.localStorage?.removeItem(LEGACY_OUTBOX_LS_KEY)
    window.localStorage?.removeItem(LEGACY_ARCHIVE_LS_KEY)
  } catch {
    /* ignore */
  }
}

export async function hydrateOutboxStore() {
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    ensureOutboxMemoryLoaded()
    ensureArchiveMemoryLoaded()
    if (typeof indexedDB === 'undefined') return

    try {
      const fromDexie = await chatDb.outbox.toArray()
      const fromArchiveDexie = await chatDb.outboxArchive.toArray()
      if (fromDexie.length) {
        outboxCache = fromDexie.map(dexieRowToEntry).filter(Boolean)
      } else if (outboxCache.length) {
        await writeOutboxToDexie(outboxCache)
        clearLegacyOutboxLocalStorage()
      }

      if (fromArchiveDexie.length) {
        archiveCache = fromArchiveDexie.map(dexieRowToEntry).filter(Boolean)
      } else if (archiveCache.length) {
        await writeArchiveToDexie(archiveCache)
        clearLegacyOutboxLocalStorage()
      } else if (fromDexie.length) {
        clearLegacyOutboxLocalStorage()
      }
    } catch {
      /* keep memory / legacy LS for this session */
    }
  })()
  return hydratePromise
}

export function listOutboxEntriesSync() {
  ensureOutboxMemoryLoaded()
  return outboxCache
}

export function listArchiveEntriesSync() {
  ensureArchiveMemoryLoaded()
  return archiveCache
}

export async function persistOutboxEntries(rows) {
  ensureOutboxMemoryLoaded()
  outboxCache = (rows || []).slice(-OUTBOX_MAX)
  await writeOutboxToDexie(outboxCache)
  clearLegacyOutboxLocalStorage()
}

export async function persistArchiveEntries(rows) {
  ensureArchiveMemoryLoaded()
  archiveCache = (rows || []).slice(-ARCHIVE_MAX)
  await writeArchiveToDexie(archiveCache)
  clearLegacyOutboxLocalStorage()
}

/** Sync persist for hot paths — updates memory immediately, Dexie write async. */
export function persistOutboxEntriesSync(rows) {
  ensureOutboxMemoryLoaded()
  outboxCache = (rows || []).slice(-OUTBOX_MAX)
  void writeOutboxToDexie(outboxCache)
  clearLegacyOutboxLocalStorage()
}

export function persistArchiveEntriesSync(rows) {
  ensureArchiveMemoryLoaded()
  archiveCache = (rows || []).slice(-ARCHIVE_MAX)
  void writeArchiveToDexie(archiveCache)
  clearLegacyOutboxLocalStorage()
}

/** Test helper — reset in-memory state. */
export function resetOutboxStoreForTests() {
  outboxCache = null
  archiveCache = null
  hydratePromise = null
}
