const CHART_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CHART_CACHE_PREFIX = 'x-jp-music-chart-v5:'
const LIBRARY_KEY = 'x-jp-music-library'
const LEGACY_PROGRESS_KEY = 'x-jp-music-progress'
const CHART_FETCH_LIMIT = 50
const CHART_DISPLAY_LIMIT = 30

/**
 * Chart categories. `store` chooses which iTunes store RSS to read.
 * @type {{ id: string, label: string, store: string, genreId: number|null, keep?: string }[]}
 */
export const MUSIC_GENRES = [
  { id: 'all', label: '総合', store: 'jp', genreId: null },
  { id: 'jpop', label: 'J-Pop', store: 'jp', genreId: 27 },
  { id: 'anime', label: 'アニメ', store: 'jp', genreId: 29 },
  { id: 'kpop', label: 'K-Pop', store: 'jp', genreId: 51 },
  { id: 'cpop', label: '華語', store: 'tw', genreId: null, keep: 'cpop' },
  { id: 'western', label: '洋楽', store: 'us', genreId: null },
  { id: 'rock', label: 'ロック', store: 'jp', genreId: 21 },
]

/** Chart/search target. Artist chart is derived from topsongs (no iTunes artist RSS). */
export const SEARCH_ENTITIES = [
  { id: 'song', label: '曲', itunes: 'song', media: 'music', chartFeed: 'topsongs' },
  { id: 'artist', label: '歌手', itunes: 'musicArtist', media: 'music', chartFeed: 'topartists' },
  { id: 'album', label: 'アルバム', itunes: 'album', media: 'music', chartFeed: 'topalbums' },
  { id: 'mv', label: 'MV', itunes: 'musicVideo', media: 'musicVideo', chartFeed: 'topmusicvideos' },
]

export const FAVORITE_KIND_FILTERS = [
  { id: 'all', label: 'すべて' },
  ...SEARCH_ENTITIES.map(({ id, label }) => ({ id, label })),
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

/** Prefer jp Apple Music links when the URL is store-scoped. */
function preferJpStoreUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('apple.com') || u.hostname.includes('itunes.apple.com')) {
      u.pathname = u.pathname.replace(/^\/[a-z]{2}(?=\/)/i, '/jp')
      if (u.searchParams.has('uo')) u.searchParams.set('uo', '4')
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return url
}

/** Keep Mandopop / Taiwan / Cantonese-leaning rows from TW charts. */
function isCpopItem(item) {
  const genre = normalizeGenreKey(item?.genre)
  if (/韓國|K-Pop|日本流行|J-Pop|基督教|クラシック|Classical/i.test(genre)) return false
  if (/華語|台灣|国语|國語|粤语|粵語|廣東|广东|Mandarin|Cantonese|C-Pop/i.test(genre)) return true
  const blob = `${item?.title || ''} ${item?.artist || ''}`
  // Han characters without hiragana → likely C-Pop / Mandopop title
  if (/[\u4e00-\u9fff]/.test(blob) && !/[\u3040-\u309f]/.test(blob)) return true
  return false
}

function applyKeepFilter(items, keep) {
  if (!keep) return items
  if (keep === 'cpop') {
    return items
      .filter(isCpopItem)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  }
  return items
}

/**
 * @param {string[]} ids
 * @param {string} [store]
 * @returns {Promise<Map<string, object>>}
 */
async function lookupItunes(ids, store = 'jp') {
  const unique = [...new Set(ids.map(String).filter(Boolean))]
  const map = new Map()
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40).join(',')
    const res = await fetch(`https://itunes.apple.com/lookup?id=${chunk}&country=${store}`)
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
 * Attach genre / artist metadata from lookup; re-rank.
 * @param {object[]} items
 * @param {{ limit?: number, store?: string }} [options]
 */
async function enrichChartItems(items, options = {}) {
  const limit = options.limit ?? CHART_DISPLAY_LIMIT
  const store = options.store || 'jp'
  if (!items.length) return []

  const lookup = await lookupItunes(items.map(numericIdFromItem), store)
  const enriched = []
  for (const item of items) {
    const raw = lookup.get(numericIdFromItem(item))
    const genre = normalizeGenreKey(raw?.primaryGenreName || item.genre || '')
    enriched.push({
      ...item,
      genre,
      artistId: raw?.artistId ? String(raw.artistId) : item.artistId || null,
      artistUrl: preferJpStoreUrl(raw?.artistViewUrl || item.artistUrl || null),
      artwork: item.artwork || artworkUrl(raw?.artworkUrl100) || null,
      url: preferJpStoreUrl(
        item.url || raw?.trackViewUrl || raw?.collectionViewUrl || raw?.artistLinkUrl || null,
      ),
      previewUrl: item.previewUrl || raw?.previewUrl || null,
    })
  }
  return enriched.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }))
}

/** Build a ranked artist list from top songs. */
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
  const genre = normalizeGenreKey(item.primaryGenreName || '')

  if (item.wrapperType === 'track' && item.kind === 'song') {
    return {
      id: makeId('song', item.trackId),
      kind: 'song',
      title: item.trackName || '無題',
      artist: item.artistName || '',
      album: item.collectionName || '',
      artwork: artworkUrl(item.artworkUrl100),
      url: preferJpStoreUrl(item.trackViewUrl || item.collectionViewUrl || null),
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
      url: preferJpStoreUrl(item.trackViewUrl || null),
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
      url: preferJpStoreUrl(item.collectionViewUrl || null),
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
      url: preferJpStoreUrl(item.artistLinkUrl || null),
      previewUrl: null,
      genre,
      rank: null,
    }
  }

  return null
}

/**
 * Normalize iTunes RSS chart entry (songs / albums / music videos).
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
  const genre = normalizeGenreKey(entry.category?.attributes?.label || '')

  if (!numericId) return null

  const albumName = entry['im:collection']?.['im:name']?.label || ''
  return {
    id: makeId(kind, numericId),
    kind,
    title,
    artist,
    album: kind === 'album' ? title : albumName,
    artwork: artworkUrl(largest),
    url: preferJpStoreUrl(link || null),
    previewUrl: null,
    genre,
    rank: index + 1,
  }
}

/**
 * @param {{ store?: string, genreId?: number|null, id?: string }} genre
 * @param {{ limit?: number, force?: boolean, feed?: string|null }} [options]
 */
export async function fetchJapanMusicChart(genre = {}, options = {}) {
  const feed = options.feed ?? 'topsongs'
  if (!feed) return []

  const store = genre.store || 'jp'
  const genreId = genre.genreId ?? null
  const keep = genre.keep || null
  const fetchLimit = options.limit ?? CHART_FETCH_LIMIT
  const cacheKey = `${CHART_CACHE_PREFIX}${store}-${feed}-${genreId ?? 'all'}-${keep || 'any'}-${fetchLimit}`

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
  const url = `https://itunes.apple.com/${store}/rss/${rssFeed}/limit=${fetchLimit}/${genrePart}json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes chart ${res.status}`)

  const json = await res.json()
  const entries = json?.feed?.entry
  const list = Array.isArray(entries) ? entries : entries ? [entries] : []
  const rawItems = list
    .map((entry, index) => normalizeChartEntry(entry, index, kind))
    .filter(Boolean)

  const songLimit = feed === 'topartists' || keep ? fetchLimit : CHART_DISPLAY_LIMIT
  const enriched = await enrichChartItems(rawItems, { limit: songLimit, store })
  const songs = applyKeepFilter(enriched, keep).slice(0, CHART_DISPLAY_LIMIT)
    .map((item, index) => ({ ...item, rank: index + 1 }))
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
export function listMusicLibrary(kind = 'all') {
  const all = Object.values(loadMusicLibrary())
    .filter((item) => item?.id)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
  if (!kind || kind === 'all') return all
  return all.filter((item) => item.kind === kind)
}

/** @returns {Record<string, number>} */
export function countMusicLibraryByKind() {
  const counts = { all: 0, song: 0, artist: 0, album: 0, mv: 0 }
  for (const item of Object.values(loadMusicLibrary())) {
    if (!item?.id) continue
    counts.all += 1
    if (item.kind && counts[item.kind] != null) counts[item.kind] += 1
  }
  return counts
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
      genre: item.genre || '',
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
