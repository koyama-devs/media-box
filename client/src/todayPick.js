import jacketSakuraUrl from './assets/vinyl-jacket-0-sakura.svg?url'
import jacketPosterUrl from './assets/vinyl-jacket-1-poster.svg?url'
import jacketRecordUrl from './assets/vinyl-jacket-2-record.svg?url'
import jacketPaperUrl from './assets/vinyl-jacket-3-paper.svg?url'
import jacketPetalUrl from './assets/vinyl-jacket-4-petal.svg?url'

const SHOWN_KEY = 'hana-today-ichimai-shown-date'
const LEGACY_SHOWN_KEYS = [
  'hana-tonight-dismissed-date',
  'hana-today-record-shown-date',
]

export const JACKET_STYLES = [
  {
    id: 'petal',
    label: 'ペタル',
    url: jacketPetalUrl,
    reveal: { kanji: '愛', quote: ['好きこそものの', '上手なれ'] },
  },
  {
    id: 'sakura',
    label: 'サクラ',
    url: jacketSakuraUrl,
    reveal: { kanji: '縁', quote: ['一期一会'] },
  },
  {
    id: 'poster',
    label: '花火',
    url: jacketPosterUrl,
    reveal: { kanji: '煌', quote: ['夏は短し', '恋せよ乙女'] },
  },
  {
    id: 'paper',
    label: '紅葉',
    url: jacketPaperUrl,
    reveal: { kanji: '時', quote: ['諸行無常'] },
  },
  {
    id: 'record',
    label: '雪',
    url: jacketRecordUrl,
    reveal: { kanji: '静', quote: ['雪月花'] },
  },
]

const FALLBACK_REVEAL = { kanji: '今', quote: ['今日は', 'この一枚'] }

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatTodayDateLabel(date = new Date()) {
  return date.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function clearLegacyShownKeys() {
  try {
    for (const key of LEGACY_SHOWN_KEYS) {
      window.localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export function isTodayRecordShown(date = new Date()) {
  clearLegacyShownKeys()
  try {
    return window.localStorage.getItem(SHOWN_KEY) === getLocalDateKey(date)
  } catch {
    return false
  }
}

/** Mark today's record as already shown on this device. */
export function markTodayRecordShown(date = new Date()) {
  clearLegacyShownKeys()
  try {
    window.localStorage.setItem(SHOWN_KEY, getLocalDateKey(date))
  } catch {
    /* ignore */
  }
}

export function resetTodayRecordShown() {
  try {
    window.localStorage.removeItem(SHOWN_KEY)
    clearLegacyShownKeys()
  } catch {
    /* ignore */
  }
}

function hashString(value) {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function resolveJacketStyle(styleId) {
  return JACKET_STYLES.find((style) => style.id === styleId) || JACKET_STYLES[1]
}

export function resolveJacketUrl(jacketSrc, jacketStyleId) {
  if (jacketSrc) return jacketSrc
  return resolveJacketStyle(jacketStyleId).url
}

export function resolveTodayReveal(item, date = new Date()) {
  if (!item) return FALLBACK_REVEAL
  if (item.jacketStyle) {
    return resolveJacketStyle(item.jacketStyle).reveal
  }
  const styles = JACKET_STYLES
  const index = hashString(`${getLocalDateKey(date)}::${item.id}`) % styles.length
  return styles[index].reveal
}

function trackIdsFrom(playlists) {
  return new Set(playlists.flatMap((playlist) => playlist.trackIds || []))
}

function newestAudio(pool) {
  if (!pool.length) return null
  return [...pool].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0
    const bTime = Date.parse(b.createdAt || '') || 0
    if (bTime !== aTime) return bTime - aTime
    const aOrder = typeof a.order === 'number' ? a.order : -1
    const bOrder = typeof b.order === 'number' ? b.order : -1
    return bOrder - aOrder
  })[0]
}

/**
 * Newest audio for Today's record.
 * Prefer music playlists; never prefer English-study playlists.
 */
export function pickTodayAudioItem(items, customPlaylists = []) {
  const audioItems = (Array.isArray(items) ? items : []).filter((item) => item?.kind === 'audio')
  if (audioItems.length === 0) return null

  const playlists = Array.isArray(customPlaylists) ? customPlaylists : []
  const studyPlaylists = playlists.filter(isStudyPlaylistName)
  const musicPlaylists = playlists.filter(isMusicPlaylistName)
  const otherPlaylists = playlists.filter(
    (playlist) => !isStudyPlaylistName(playlist) && !isMusicPlaylistName(playlist),
  )

  const fromIds = (ids) => audioItems.filter((item) => ids.has(item.id))

  if (musicPlaylists.length > 0) {
    const fromMusic = fromIds(trackIdsFrom(musicPlaylists))
    if (fromMusic.length > 0) return newestAudio(fromMusic)
  }

  if (otherPlaylists.length > 0) {
    const fromOther = fromIds(trackIdsFrom(otherPlaylists))
    if (fromOther.length > 0) return newestAudio(fromOther)
  }

  if (studyPlaylists.length > 0) {
    const studyIds = trackIdsFrom(studyPlaylists)
    const outsideStudy = audioItems.filter((item) => !studyIds.has(item.id))
    if (outsideStudy.length > 0) return newestAudio(outsideStudy)
  }

  return newestAudio(audioItems)
}

function normalizePlaylistName(name) {
  return String(name || '').trim().toLowerCase()
}

function isStudyPlaylistName(playlist) {
  const name = normalizePlaylistName(playlist?.name)
  if (!name) return false
  return /英語|学習|english|study|toeic|ielts|単語|listening\s*practice|học|tiếng\s*anh/.test(name)
}

function isMusicPlaylistName(playlist) {
  const name = normalizePlaylistName(playlist?.name)
  if (!name) return false
  if (isStudyPlaylistName(playlist)) return false
  return /音楽|曲|歌|songs?|music|nhạc|bài\s*hát|ポップ|j-?pop|プレイリスト音楽/.test(name)
}
