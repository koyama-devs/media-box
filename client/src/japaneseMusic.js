const CHART_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CHART_CACHE_PREFIX = 'hana-jp-music-chart-v2:'
const LIBRARY_KEY = 'hana-jp-music-library'
const LEGACY_PROGRESS_KEY = 'hana-jp-music-progress'

/** @type {{ id: string, label: string, genreId: number|null }[]} */
export const MUSIC_GENRES = [
  { id: 'all', label: '総合', genreId: null },
  { id: 'jpop', label: 'J-Pop', genreId: 27 },
  { id: 'anime', label: 'アニメ', genreId: 29 },
  { id: 'rock', label: 'ロック', genreId: 15 },
  { id: 'hiphop', label: 'ヒップホップ', genreId: 18 },
  { id: 'rnb', label: 'R&B', genreId: 13 },
  { id: 'electronic', label: 'エレクトロニック', genreId: 7 },
  { id: 'karaoke', label: 'カラオケ', genreId: 51 },
]

/** Chart/search target. Artist has no iTunes RSS chart — search only. */
export const SEARCH_ENTITIES = [
  { id: 'song', label: '曲', itunes: 'song', media: 'music', chartFeed: 'topsongs' },
  { id: 'artist', label: '歌手', itunes: 'musicArtist', media: 'music', chartFeed: null },
  { id: 'album', label: 'アルバム', itunes: 'album', media: 'music', chartFeed: 'topalbums' },
  { id: 'mv', label: 'MV', itunes: 'musicVideo', media: 'musicVideo', chartFeed: 'topmusicvideos' },
]

const CHART_KIND_BY_FEED = {
  topsongs: 'song',
  topalbums: 'album',
  topmusicvideos: 'mv',
}

export const MUSIC_KIND_LABEL = {
  song: '曲',
  artist: '歌手',
  album: 'アルバム',
  mv: 'MV',
}

function artworkUrl(url, size = 200) {
  if (!url) return null
  return String(url).replace(/100x100bb|60x60bb|30x30bb/g, `${size}x${size}bb`)
}

function makeId(kind, numericId) {
  return `${kind}:${numericId}`
}

/** Normalize iTunes Search API result. */
export function normalizeSearchResult(item) {
  if (!item) return null

  if (item.wrapperType === 'track' && item.kind === 'song') {
    return {
      id: makeId('song', item.trackId),
      kind: 'song',
      title: item.trackName || '無題',
      artist: item.artistName || '',
      album: item.collectionName || '',
      artwork: artworkUrl(item.artworkUrl100),
      url: item.trackViewUrl || item.collectionViewUrl || null,
      previewUrl: item.previewUrl || null,
      rank: null,
    }
  }

  if (item.wrapperType === 'track' && item.kind === 'music-video') {
    return {
      id: makeId('mv', item.trackId),
      kind: 'mv',
      title: item.trackName || '無題',
      artist: item.artistName || '',
      album: item.collectionName || '',
      artwork: artworkUrl(item.artworkUrl100),
      url: item.trackViewUrl || null,
      previewUrl: item.previewUrl || null,
      rank: null,
    }
  }

  if (item.wrapperType === 'collection' && item.collectionType === 'Album') {
    return {
      id: makeId('album', item.collectionId),
      kind: 'album',
      title: item.collectionName || '無題',
      artist: item.artistName || '',
      album: item.collectionName || '',
      artwork: artworkUrl(item.artworkUrl100),
      url: item.collectionViewUrl || null,
      previewUrl: null,
      rank: null,
    }
  }

  if (item.wrapperType === 'artist') {
    return {
      id: makeId('artist', item.artistId),
      kind: 'artist',
      title: item.artistName || '無題',
      artist: item.artistName || '',
      album: '',
      artwork: null,
      url: item.artistLinkUrl || null,
      previewUrl: null,
      rank: null,
    }
  }

  return null
}

/**
 * Normalize iTunes JP RSS chart entry (songs / albums / music videos).
 * @param {object} entry
 * @param {number} index
 * @param {'song'|'album'|'mv'} [kind]
 */
export function normalizeChartEntry(entry, index, kind = 'song') {
  if (!entry) return null
  const idAttr = entry.id?.attributes?.['im:id'] || entry.id?.label
  const numericId = idAttr ? String(idAttr).replace(/\D/g, '') : ''
  const title = entry['im:name']?.label || entry.title?.label || '無題'
  const artist = entry['im:artist']?.label || ''
  const images = entry['im:image'] || []
  const largest = images[images.length - 1]?.label || images[0]?.label || null
  const link = Array.isArray(entry.link)
    ? entry.link.find((l) => l.attributes?.rel === 'alternate')?.attributes?.href
    : entry.link?.attributes?.href

  if (!numericId) return null

  const albumName = entry['im:collection']?.['im:name']?.label || ''
  return {
    id: makeId(kind, numericId),
    kind,
    title,
    artist,
    album: kind === 'album' ? title : albumName,
    artwork: artworkUrl(largest),
    url: link || null,
    previewUrl: null,
    rank: index + 1,
  }
}

/**
 * @param {number|null} genreId
 * @param {{ limit?: number, force?: boolean, feed?: string|null }} [options]
 */
export async function fetchJapanMusicChart(genreId = null, options = {}) {
  const feed = options.feed ?? 'topsongs'
  if (!feed) return []

  const limit = options.limit ?? 30
  const kind = CHART_KIND_BY_FEED[feed] || 'song'
  const cacheKey = `${CHART_CACHE_PREFIX}${feed}-${genreId ?? 'all'}-${limit}`

  if (!options.force) {
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const cached = JSON.parse(raw)
        if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CHART_CACHE_TTL_MS && Array.isArray(cached.items)) {
          return cached.items
        }
      }
    } catch {
      /* ignore */
    }
  }

  const genrePart = genreId != null ? `genre=${genreId}/` : ''
  const url = `https://itunes.apple.com/jp/rss/${feed}/limit=${limit}/${genrePart}json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes chart ${res.status}`)

  const json = await res.json()
  const entries = json?.feed?.entry
  const list = Array.isArray(entries) ? entries : entries ? [entries] : []
  const items = list
    .map((entry, index) => normalizeChartEntry(entry, index, kind))
    .filter(Boolean)

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), items }))
  } catch {
    /* ignore */
  }

  return items
}

/**
 * @param {string} term
 * @param {{ entity?: string, media?: string, limit?: number }} [options]
 */
export async function searchJapanMusic(term, options = {}) {
  const q = term.trim()
  if (!q) return []

  const entity = options.entity || 'song'
  const media = options.media || (entity === 'musicVideo' ? 'musicVideo' : 'music')
  const limit = options.limit ?? 25
  const params = new URLSearchParams({
    term: q,
    country: 'jp',
    media,
    entity,
    limit: String(limit),
    lang: 'ja_jp',
  })

  const res = await fetch(`https://itunes.apple.com/search?${params}`)
  if (!res.ok) throw new Error(`iTunes search ${res.status}`)

  const json = await res.json()
  const results = Array.isArray(json?.results) ? json.results : []
  return results.map(normalizeSearchResult).filter(Boolean)
}

/** @returns {Record<string, object>} */
export function loadMusicLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** @returns {object[]} newest favorites first */
export function listMusicLibrary() {
  return Object.values(loadMusicLibrary())
    .filter((item) => item?.id)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

export function isMusicFavorite(id) {
  return Boolean(loadMusicLibrary()[String(id)])
}

function writeMusicLibrary(next) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(next))
  try {
    localStorage.removeItem(LEGACY_PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} item
 * @returns {Record<string, object>}
 */
export function addMusicFavorite(item) {
  if (!item?.id) return loadMusicLibrary()
  const next = {
    ...loadMusicLibrary(),
    [item.id]: {
      id: item.id,
      kind: item.kind,
      title: item.title,
      artist: item.artist || '',
      album: item.album || '',
      artwork: item.artwork || null,
      url: item.url || null,
      previewUrl: item.previewUrl || null,
      rank: null,
      savedAt: Date.now(),
    },
  }
  writeMusicLibrary(next)
  return next
}

/**
 * @param {string} id
 * @returns {Record<string, object>}
 */
export function removeMusicFavorite(id) {
  const key = String(id)
  const current = loadMusicLibrary()
  if (!(key in current)) return current
  const next = { ...current }
  delete next[key]
  writeMusicLibrary(next)
  return next
}

/**
 * @param {object} item
 * @returns {{ library: Record<string, object>, favorited: boolean }}
 */
export function toggleMusicFavorite(item) {
  if (!item?.id) return { library: loadMusicLibrary(), favorited: false }
  if (isMusicFavorite(item.id)) {
    return { library: removeMusicFavorite(item.id), favorited: false }
  }
  return { library: addMusicFavorite(item), favorited: true }
}
