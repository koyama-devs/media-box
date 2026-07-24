const ANILIST_URL = 'https://graphql.anilist.co'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_PREFIX = 'hana-seasonal-anime-v3:'
const PROGRESS_KEY = 'hana-anime-watch-progress'

const SEASON_ORDER = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
const SEASON_LABEL = {
  WINTER: '冬',
  SPRING: '春',
  SUMMER: '夏',
  FALL: '秋',
}

const MEDIA_CORE_FIELDS = `
  id
  title { romaji native english }
  coverImage { large medium }
  averageScore
  popularity
  episodes
  siteUrl
  format
  status
  season
  seasonYear
  genres
  description(asHtml: false)
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode {
    airingAt
    timeUntilAiring
    episode
  }
`

const SEASONAL_QUERY = `
query ($season: MediaSeason, $seasonYear: Int, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(
      season: $season
      seasonYear: $seasonYear
      type: ANIME
      sort: POPULARITY_DESC
      isAdult: false
    ) {
      ${MEDIA_CORE_FIELDS}
    }
  }
}
`

const SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(
      search: $search
      type: ANIME
      sort: SEARCH_MATCH
      isAdult: false
    ) {
      ${MEDIA_CORE_FIELDS}
    }
  }
}
`

/** @param {Date} [date] */
export function getAnimeSeason(date = new Date()) {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month <= 3) return { season: 'WINTER', seasonYear: year }
  if (month <= 6) return { season: 'SPRING', seasonYear: year }
  if (month <= 9) return { season: 'SUMMER', seasonYear: year }
  return { season: 'FALL', seasonYear: year }
}

/** @param {{ season: string, seasonYear: number }} current */
export function getPreviousSeason(current) {
  const idx = SEASON_ORDER.indexOf(current.season)
  if (idx <= 0) {
    return { season: 'FALL', seasonYear: current.seasonYear - 1 }
  }
  return { season: SEASON_ORDER[idx - 1], seasonYear: current.seasonYear }
}

/** @param {{ season: string, seasonYear: number }} info */
export function formatSeasonLabel(info) {
  return `${info.seasonYear}年${SEASON_LABEL[info.season] || info.season}`
}

/** @param {{ year?: number, month?: number, day?: number } | null} date */
export function formatFuzzyDate(date) {
  if (!date?.year) return null
  if (!date.month) return `${date.year}年`
  if (!date.day) return `${date.year}年${date.month}月`
  return `${date.year}/${date.month}/${date.day}`
}

/** @param {number} airingAtSec unix seconds */
export function formatAiringAtJst(airingAtSec) {
  if (!airingAtSec) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(airingAtSec * 1000))
}

/** @param {number} airingAtSec unix seconds */
export function formatWeeklySlotJst(airingAtSec) {
  if (!airingAtSec) return ''
  const date = new Date(airingAtSec * 1000)
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return `毎週${weekday} ${time}`
}

/** @param {number} seconds */
export function formatTimeUntilAiring(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return ''
  if (seconds <= 60) return 'まもなく'
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `あと${days}日`
  if (hours >= 1) return `あと${hours}時間`
  return `あと${mins}分`
}

/**
 * Broadcast schedule summary for list / preview.
 * @param {object} media
 * @returns {{ short: string, detail: string, weekly: string|null, kind: string } | null}
 */
export function getBroadcastSchedule(media) {
  const next = media?.nextAiringEpisode
  if (next?.airingAt) {
    const when = formatAiringAtJst(next.airingAt)
    const until = formatTimeUntilAiring(next.timeUntilAiring)
    const weekly = formatWeeklySlotJst(next.airingAt)
    return {
      kind: 'next',
      weekly,
      short: `第${next.episode}話 ${when}`,
      detail: `次回 第${next.episode}話 · ${when}${until ? `（${until}）` : ''} · ${weekly}（JST）`,
    }
  }

  const start = formatFuzzyDate(media?.startDate)
  const end = formatFuzzyDate(media?.endDate)

  if (media?.status === 'NOT_YET_RELEASED' && start) {
    return {
      kind: 'premiere',
      weekly: null,
      short: `${start} 開始予定`,
      detail: `放送開始予定 · ${start}`,
    }
  }

  if (media?.status === 'FINISHED') {
    if (start && end) {
      return {
        kind: 'finished',
        weekly: null,
        short: `${start}〜${end}`,
        detail: `放送期間 · ${start} 〜 ${end}`,
      }
    }
    if (start) {
      return {
        kind: 'finished',
        weekly: null,
        short: `${start}〜`,
        detail: `放送開始 · ${start}`,
      }
    }
  }

  if (start) {
    return {
      kind: 'start',
      weekly: null,
      short: `${start}〜`,
      detail: `放送開始 · ${start}`,
    }
  }

  return null
}

/**
 * @param {{ title?: { native?: string, romaji?: string, english?: string } }} media
 */
export function pickAnimeTitle(media) {
  const t = media?.title
  return t?.native || t?.romaji || t?.english || '無題'
}

/** Plain text synopsis cleanup. */
export function cleanAnimeDescription(raw, maxLen = 280) {
  if (!raw) return ''
  const text = String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/~/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trim()}…`
}

export const ANIME_STATUS_LABEL = {
  FINISHED: '完結',
  RELEASING: '放送中',
  NOT_YET_RELEASED: '放送前',
  CANCELLED: '中止',
  HIATUS: '休止',
}

export const ANIME_GENRE_JA = {
  Action: 'アクション',
  Adventure: 'アドベンチャー',
  Comedy: 'コメディ',
  Drama: 'ドラマ',
  Ecchi: 'エッチ',
  Fantasy: 'ファンタジー',
  Horror: 'ホラー',
  'Mahou Shoujo': '魔法少女',
  Mecha: 'メカ',
  Music: '音楽',
  Mystery: 'ミステリー',
  Psychological: 'サイコロジカル',
  Romance: 'ロマンス',
  'Sci-Fi': 'SF',
  'Slice of Life': '日常',
  Sports: 'スポーツ',
  Supernatural: '超自然',
  Thriller: 'スリラー',
}

export function localizeAnimeGenres(genres = []) {
  return genres.map((genre) => ANIME_GENRE_JA[genre] || genre)
}

const synopsisCache = new Map()

async function fetchWikipediaSummary(title) {
  const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const json = await res.json()
  if (json.type === 'disambiguation') return null
  const extract = typeof json.extract === 'string' ? json.extract.trim() : ''
  return extract || null
}

async function searchWikipediaTitle(query) {
  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: '5',
    namespace: '0',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?${params}`)
  if (!res.ok) return null
  const json = await res.json()
  const titles = Array.isArray(json?.[1]) ? json[1] : []
  return titles[0] || null
}

/**
 * Japanese synopsis via Wikipedia JA (AniList description is English-only).
 * @param {{ id: number, title?: { native?: string, romaji?: string, english?: string } }} media
 */
export async function fetchJapaneseSynopsis(media) {
  const cacheKey = String(media?.id || '')
  if (cacheKey && synopsisCache.has(cacheKey)) {
    return synopsisCache.get(cacheKey)
  }

  const candidates = [
    media?.title?.native,
    media?.title?.romaji,
    media?.title?.english,
  ].filter(Boolean)

  let text = null
  for (const candidate of candidates) {
    try {
      text = await fetchWikipediaSummary(candidate)
      if (text) break
      const searched = await searchWikipediaTitle(candidate)
      if (searched && searched !== candidate) {
        text = await fetchWikipediaSummary(searched)
        if (text) break
      }
    } catch {
      /* try next title form */
    }
  }

  const result = text ? cleanAnimeDescription(text, 320) : ''
  if (cacheKey) synopsisCache.set(cacheKey, result)
  return result
}



/**
 * @param {{ season: string, seasonYear: number }} seasonInfo
 * @param {{ perPage?: number, force?: boolean }} [options]
 */
export async function fetchSeasonalAnime(seasonInfo, options = {}) {
  const perPage = options.perPage ?? 24
  const cacheKey = `${CACHE_PREFIX}${seasonInfo.seasonYear}-${seasonInfo.season}-${perPage}`

  if (!options.force) {
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const cached = JSON.parse(raw)
        if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS && Array.isArray(cached.media)) {
          return cached.media
        }
      }
    } catch {
      /* ignore cache parse errors */
    }
  }

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: SEASONAL_QUERY,
      variables: {
        season: seasonInfo.season,
        seasonYear: seasonInfo.seasonYear,
        perPage,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`AniList ${res.status}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList error')
  }

  const media = (json.data?.Page?.media || []).map((item, index) => ({
    ...item,
    rank: index + 1,
  }))

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), media }))
  } catch {
    /* quota / private mode */
  }

  return media
}

/**
 * @param {string} search
 * @param {{ perPage?: number }} [options]
 */
export async function searchAnimeByTitle(search, options = {}) {
  const q = search.trim()
  if (!q) return []

  const perPage = options.perPage ?? 20
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { search: q, perPage },
    }),
  })

  if (!res.ok) {
    throw new Error(`AniList ${res.status}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList error')
  }

  return (json.data?.Page?.media || []).map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}

/** @returns {Record<string, { status: 'want'|'watching'|'done', updatedAt: number }>} */
export function loadWatchProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * @param {number|string} animeId
 * @param {'want'|'watching'|'done'|null} status
 */
export function setWatchStatus(animeId, status) {
  const key = String(animeId)
  const next = { ...loadWatchProgress() }
  if (!status) {
    delete next[key]
  } else {
    next[key] = { status, updatedAt: Date.now() }
  }
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(next))
  return next
}

export const WATCH_STATUS_LABEL = {
  want: '見たい',
  watching: '視聴中',
  done: '視聴済',
}
