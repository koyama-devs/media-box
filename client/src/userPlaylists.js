const FAVORITES_KEY = 'hana-mediabox-favorites'
const PLAYLISTS_KEY = 'hana-mediabox-playlists'
const LIST_FILTER_KEY = 'hana-mediabox-list-filter'

function safeParseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function loadFavoriteIds() {
  try {
    const parsed = safeParseJson(window.localStorage.getItem(FAVORITES_KEY), [])
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function saveFavoriteIds(ids) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadCustomPlaylists() {
  try {
    const parsed = safeParseJson(window.localStorage.getItem(PLAYLISTS_KEY), [])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id || ''),
        name: String(item.name || 'Untitled').slice(0, 40),
        trackIds: Array.isArray(item.trackIds)
          ? item.trackIds.filter((id) => typeof id === 'string')
          : [],
      }))
      .filter((item) => item.id)
  } catch {
    return []
  }
}

export function saveCustomPlaylists(playlists) {
  try {
    window.localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists))
  } catch {
    /* ignore */
  }
}

export function loadListFilter() {
  try {
    return window.localStorage.getItem(LIST_FILTER_KEY) || 'all'
  } catch {
    return 'all'
  }
}

export function saveListFilter(filter) {
  try {
    window.localStorage.setItem(LIST_FILTER_KEY, filter)
  } catch {
    /* ignore */
  }
}

export function createPlaylistId() {
  return globalThis.crypto?.randomUUID?.() || `pl-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
