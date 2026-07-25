const CHART_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CHART_CACHE_PREFIX = 'hana-jp-music-chart-v4:'
const LIBRARY_KEY = 'hana-jp-music-library'
const LEGACY_PROGRESS_KEY = 'hana-jp-music-progress'
const CHART_FETCH_LIMIT = 50
const CHART_DISPLAY_LIMIT = 30

/** Japan-leaning genres only (Western / K-pop genre tabs removed). */
/** @type {{ id: string, label: string, genreId: number|null }[]} */
export const MUSIC_GENRES = [
  { id: 'all', label: '総合', genreId: null },
  { id: 'jpop', label: 'J-Pop', genreId: 27 },
  { id: 'anime', label: 'アニメ', genreId: 29 },
  { id: 'rock', label: 'ロック', genreId: 15 },
  { id: 'karaoke', label: 'カラオケ', genreId: 51 },
]

const JP_STRONG_SCRIPT_RE = /[\u3040-\u309f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** Always drop — usually non-Japanese acts on the JP store. */
const EXCLUDED_GENRES = new Set([
  'K-Pop',
  'ポップ',
  'ラテン',
  'カントリー',
  'レゲエ',
  'ブルース',
  'ジャズ',
  'クラシック',
  'ワールドミュージック',
  'ダンス',
  'ワールド',
])

/** Strong Japan genre labels from iTunes JP. */
const KEEP_GENRES = new Set([
  'J-Pop',
  'アニメ',
  'アニメーション',
  '演歌',
  'カラオケ',
  'ヴィジュアル系',
  'J-Rock',
  'J-Punk',
  'アイドル',
  '童謡/唱歌',
  '伝統音楽',
])

/** Domestic-leaning genres that often use Latin artist names (Mrs. GREEN APPLE, Number_i). */
const SOFT_KEEP_GENRES = new Set([
  'ロック',
  'エレクトロニック',
  'ヒップホップ/ラップ',
  'R&B/ソウル',
  'サウンドトラック',
  'フォーク',
])

/** Chart/search target. Artist chart is derived from topsongs (no iTunes artist RSS). */
export const SEARCH_ENTITIES = [
  { id: 'song', label: '曲', itunes: 'song', media: 'music', chartFeed: 'topsongs' },
  { id: 'artist', label: '歌手', itunes: 'musicArtist', media: 'music', chartFeed: 'topartists' },
  { id: 'album', label: 'アルバム', itunes: 'album', media: 'music', chartFeed: 'topalbums' },
  { id: 'mv', label: 'MV', itunes: 'musicVideo', media: 'musicVideo', chartFeed: 'topmusicvideos' },
]

const CHART_KIND_BY_FEED = {
  topsongs: 'song',
  topalbums: 'album',
  topmusicvideos: 'mv',
  topartists: 'artist',
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

function numericIdFromItem(item) {
  if (!item?.id) return ''
  const parts = String(item.id).split(':')
  return parts[1] || ''
}

function normalizeGenreKey(genre) {
  return String(genre || '').trim().replace(/／/g, '/')
}

function hasStrongJapaneseScript(...parts) {
  return JP_STRONG_SCRIPT_RE.test(parts.filter(Boolean).join(' '))
}

function isExcludedGenre(genre) {
  const g = normalizeGenreKey(genre)
  if (!g) return false
  if (EXCLUDED_GENRES.has(g)) return true
  if (g === 'J-Pop' || g === 'J-Rock' || g === 'J-Punk') return false
  // スペイン語ポップ, 韓国ポップ, etc.
  if (g.includes('ポップ') || /k-?pop/i.test(g)) return true
  return false
}

/**
 * Heuristic: keep domestic JP catalog, drop K-Pop / Western pop on the JP store.
 * @param {{ title?: string, artist?: string, album?: string, genre?: string, kind?: string }} item
 */
export function isJapaneseMusic(item) {
  if (!item) return false
  const genre = normalizeGenreKey(item.genre)
  if (isExcludedGenre(genre)) return false
  if (hasStrongJapaneseScript(item.title, item.artist, item.album)) return true
  if (genre && KEEP_GENRES.has(genre)) return true
  if (genre && SOFT_KEEP_GENRES.has(genre)) return true
  // Artists with unknown genre but matching a Japanese search — keep if not excluded
  if (item.kind === 'artist' && !genre) return true
  return false
}

/**
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
async function lookupItunesJp(ids) {
  const unique = [...new Set(ids.map(String).filter(Boolean))]
  const map = new Map()
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40).join(',')
    const res = await fetch(`https://itunes.apple.com/lookup?id=${chunk}&country=jp`)
    if (!res.ok) continue
    const json = await res.json()
    for (const row of json?.results || []) {
      const id = String(row.trackId || row.collectionId || row.artistId || '')
      if (id) map.set(id, row)
    }
  }
  return map
}

/**
 * Attach genre from lookup and keep Japanese-leaning rows; re-rank.
 * @param {object[]} items
 * @param {number} [limit]
 */
async function enrichAndFilterJapanese(items, limit = CHART_DISPLAY_LIMIT) {
  if (!items.length) return []
  const lookup = await lookupItunesJp(items.map(numericIdFromItem))
  const filtered = []
  for (const item of items) {
    const raw = lookup.get(numericIdFromItem(item))
    const genre = normalizeGenreKey(raw?.primaryGenreName || item.genre || '')
    const next = {
      ...item,
      genre,
      artistId: raw?.artistId ? String(raw.artistId) : item.artistId || null,
      artistUrl: raw?.artistViewUrl || item.artistUrl || null,
      artwork: item.artwork || artworkUrl(raw?.artworkUrl100) || null,
      url: item.url || raw?.trackViewUrl || raw?.collectionViewUrl || raw?.artistLinkUrl || null,
      previewUrl: item.previewUrl || raw?.previewUrl || null,
    }
    if (isJapaneseMusic(next)) filtered.push(next)
  }
  return filtered.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }))
}

/** Build a ranked artist list from filtered top songs. */
function artistsFromSongs(songs, limit = CHART_DISPLAY_LIMIT) {
  const seen = new Set()
  const artists = []
  for (const song of songs) {
    const name = String(song.artist || '').trim()
    if (!name) continue
    const key = song.artistId ? `id:${song.artistId}` : `name:${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const artistNumericId = song.artistId || String(
      [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7),
    )
    artists.push({
      id: makeId('artist', artistNumericId),
      kind: 'artist',
      title: name,
      artist: name,
      album: '',
      artwork: song.artwork || null,
      url: song.artistUrl || song.url || null,
      previewUrl: null,
      genre: song.genre || '',
      rank: artists.length + 1,
    })
    if (artists.length >= limit) break
  }
  return artists
}

/** Normalize iTunes Search API result. */
export function normalizeSearchResult(item) {
  if (!item) return null
  const genre = item.primaryGenreName || ''

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
      genre,
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
      genre,
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
      genre,
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
      genre,
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
    genre: '',
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

  const fetchLimit = options.limit ?? CHART_FETCH_LIMIT
  const cacheKey = `${CHART_CACHE_PREFIX}${feed}-${genreId ?? 'all'}-${fetchLimit}`

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

  // iTunes has no top-artists RSS — derive from topsongs.
  const rssFeed = feed === 'topartists' ? 'topsongs' : feed
  const kind = CHART_KIND_BY_FEED[rssFeed] || 'song'
  const genrePart = genreId != null ? `genre=${genreId}/` : ''
  const url = `https://itunes.apple.com/jp/rss/${rssFeed}/limit=${fetchLimit}/${genrePart}json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes chart ${res.status}`)

  const json = await res.json()
  const entries = json?.feed?.entry
  const list = Array.isArray(entries) ? entries : entries ? [entries] : []
  const rawItems = list
    .map((entry, index) => normalizeChartEntry(entry, index, kind))
    .filter(Boolean)

  // Pull enough songs so artist chart still has ~30 unique names after filter.
  const songLimit = feed === 'topartists' ? fetchLimit : CHART_DISPLAY_LIMIT
  const songs = await enrichAndFilterJapanese(rawItems, songLimit)
  const items = feed === 'topartists'
    ? artistsFromSongs(songs, CHART_DISPLAY_LIMIT)
    : songs

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
  const limit = options.limit ?? 40
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
  return results
    .map(normalizeSearchResult)
    .filter(Boolean)
    .filter(isJapaneseMusic)
    .slice(0, 25)
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
