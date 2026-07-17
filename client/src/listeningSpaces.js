import { JACKET_STYLES, getLocalDateKey } from './todayPick'

const SPACE_STORAGE_KEY = 'hana-listening-space-id'
const AMBIENT_STORAGE_KEY = 'hana-listening-space-ambient'
const FOCUS_STORAGE_KEY = 'hana-listening-space-focus'
const SPACE_IMAGES_STORAGE_KEY = 'hana-listening-space-images'

const MAX_BACKGROUND_EDGE = 1600
const MAX_BACKGROUND_DATA_URL_CHARS = 1_500_000
const JPEG_QUALITY = 0.78

export const LISTENING_SPACES = [
  {
    id: 'ocean-night',
    label: '海辺の夜',
    labelShort: '海辺',
    jacketStyleId: 'record',
    gradient: ['#0b1a2e', '#061220', '#02060c'],
    glow: 'rgba(56, 189, 248, 0.24)',
    horizon: 'rgba(56, 189, 248, 0.12)',
    particle: 'stars',
    ambient: 'ocean',
    tagline: 'いま、海辺でこの一曲を。',
    postcardGradient: ['#0b1a2e', '#0a2438', '#02060c'],
    postcardGlow: 'rgba(56, 189, 248, 0.3)',
  },
  {
    id: 'rainy-city',
    label: '雨の街',
    labelShort: '雨の街',
    jacketStyleId: 'poster',
    gradient: ['#1a1a2e', '#141428', '#090912'],
    glow: 'rgba(129, 140, 248, 0.22)',
    horizon: 'rgba(167, 139, 250, 0.1)',
    particle: 'rain',
    ambient: 'rain',
    tagline: '雨上がりの街で、ひとり。',
    postcardGradient: ['#1a1a2e', '#1e1e3a', '#090912'],
    postcardGlow: 'rgba(129, 140, 248, 0.28)',
  },
  {
    id: 'mountain-morning',
    label: '山の朝',
    labelShort: '山の朝',
    jacketStyleId: 'paper',
    gradient: ['#2a3444', '#3d4f5f', '#1a222c'],
    glow: 'rgba(251, 191, 36, 0.2)',
    horizon: 'rgba(251, 191, 36, 0.14)',
    particle: 'mist',
    ambient: 'wind',
    tagline: '朝の山で、息を整える。',
    postcardGradient: ['#2a3444', '#4a5d6e', '#1a222c'],
    postcardGlow: 'rgba(251, 191, 36, 0.26)',
  },
  {
    id: 'sakura-room',
    label: '桜の部屋',
    labelShort: '桜',
    jacketStyleId: 'sakura',
    gradient: ['#3b1f35', '#2a1828', '#140f18'],
    glow: 'rgba(244, 114, 182, 0.22)',
    horizon: 'rgba(244, 114, 182, 0.1)',
    particle: 'petals',
    ambient: 'room',
    tagline: '窓辺の桜と、この一曲。',
    postcardGradient: ['#3b1f35', '#331a2e', '#140f18'],
    postcardGlow: 'rgba(244, 114, 182, 0.28)',
  },
]

const JACKET_TO_SPACE = Object.fromEntries(
  LISTENING_SPACES.map((space) => [space.jacketStyleId, space.id]),
)

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function resolveListeningSpace(spaceId) {
  return LISTENING_SPACES.find((space) => space.id === spaceId) || LISTENING_SPACES[0]
}

export function spaceForJacketStyle(jacketStyleId) {
  if (!jacketStyleId) return null
  const spaceId = JACKET_TO_SPACE[jacketStyleId]
  return spaceId ? resolveListeningSpace(spaceId) : null
}

export function loadSavedListeningSpaceId() {
  try {
    const saved = window.localStorage.getItem(SPACE_STORAGE_KEY)
    if (saved && LISTENING_SPACES.some((space) => space.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return LISTENING_SPACES[0].id
}

export function saveListeningSpaceId(spaceId) {
  if (!LISTENING_SPACES.some((space) => space.id === spaceId)) return
  try {
    window.localStorage.setItem(SPACE_STORAGE_KEY, spaceId)
  } catch {
    /* ignore */
  }
}

export function loadAmbientSettings() {
  const data = readJson(AMBIENT_STORAGE_KEY, { enabled: true, volume: 0.28 })
  return {
    enabled: Boolean(data?.enabled),
    volume: Number.isFinite(data?.volume) ? Math.min(1, Math.max(0, data.volume)) : 0.28,
  }
}

export function saveAmbientSettings({ enabled, volume }) {
  writeJson(AMBIENT_STORAGE_KEY, {
    enabled: Boolean(enabled),
    volume: Math.min(1, Math.max(0, volume)),
  })
}

export function loadFocusModePreference() {
  try {
    return window.localStorage.getItem(FOCUS_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveFocusModePreference(enabled) {
  try {
    window.localStorage.setItem(FOCUS_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function isValidBackgroundEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (entry.source === 'upload' && typeof entry.dataUrl === 'string' && entry.dataUrl.startsWith('data:image/')) {
    return true
  }
  if (entry.source === 'library' && typeof entry.itemId === 'string' && entry.itemId) {
    return true
  }
  return false
}

export function loadSpaceBackgrounds() {
  const data = readJson(SPACE_IMAGES_STORAGE_KEY, {})
  if (!data || typeof data !== 'object') return {}
  const next = {}
  for (const space of LISTENING_SPACES) {
    const entry = data[space.id]
    if (isValidBackgroundEntry(entry)) next[space.id] = entry
  }
  return next
}

export function getSpaceBackground(spaceId) {
  return loadSpaceBackgrounds()[spaceId] || null
}

export function saveSpaceBackground(spaceId, entry) {
  if (!LISTENING_SPACES.some((space) => space.id === spaceId)) return
  const current = loadSpaceBackgrounds()
  if (entry == null) {
    delete current[spaceId]
  } else if (isValidBackgroundEntry(entry)) {
    current[spaceId] = entry
  } else {
    return
  }
  writeJson(SPACE_IMAGES_STORAGE_KEY, current)
}

/**
 * Compress an image File to a JPEG data URL suitable for localStorage.
 * @returns {Promise<string>}
 */
export function compressImageFileToDataUrl(file, {
  maxEdge = MAX_BACKGROUND_EDGE,
  quality = JPEG_QUALITY,
  maxChars = MAX_BACKGROUND_DATA_URL_CHARS,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('画像ファイルを選択してください。'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight, 1))
        const width = Math.max(1, Math.round(image.naturalWidth * scale))
        const height = Math.max(1, Math.round(image.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('画像の処理に失敗しました。'))
          return
        }
        ctx.drawImage(image, 0, 0, width, height)

        let nextQuality = quality
        let dataUrl = canvas.toDataURL('image/jpeg', nextQuality)
        while (dataUrl.length > maxChars && nextQuality > 0.45) {
          nextQuality -= 0.08
          dataUrl = canvas.toDataURL('image/jpeg', nextQuality)
        }
        if (dataUrl.length > maxChars) {
          reject(new Error('画像が大きすぎます。別の画像を選んでください。'))
          return
        }
        resolve(dataUrl)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('画像を読み込めませんでした。'))
    }
    image.src = objectUrl
  })
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

export function resolveTodayJacketStyleId(item, date = new Date()) {
  if (!item) return null
  if (item.jacketStyle) return item.jacketStyle
  const index = hashString(`${getLocalDateKey(date)}::${item.id}`) % JACKET_STYLES.length
  return JACKET_STYLES[index]?.id || null
}

function spaceFromHour(hour) {
  if (hour >= 5 && hour < 11) return 'mountain-morning'
  if (hour >= 17 && hour < 22) return 'rainy-city'
  return 'ocean-night'
}

function spaceFromPlaylistName(name) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized) return null
  if (/桜|sakura|春/.test(normalized)) return 'sakura-room'
  if (/雨|night|夜|city|街|lo-?fi|シティ/.test(normalized)) return 'rainy-city'
  if (/山|朝|morning|自然|アコース/.test(normalized)) return 'mountain-morning'
  if (/海|ocean|波|ambient|環境/.test(normalized)) return 'ocean-night'
  return null
}

/**
 * Suggest a listening space from track, time, jacket, and active playlist.
 */
export function suggestListeningSpace({
  item = null,
  date = new Date(),
  jacketStyleId = null,
  playlistName = '',
  savedSpaceId = null,
} = {}) {
  const styleId = jacketStyleId || resolveTodayJacketStyleId(item, date)
  const fromJacket = styleId ? JACKET_TO_SPACE[styleId] : null
  if (fromJacket) return fromJacket

  const fromPlaylist = spaceFromPlaylistName(playlistName)
  if (fromPlaylist) return fromPlaylist

  const fromHour = spaceFromHour(date.getHours())
  if (fromHour) return fromHour

  if (savedSpaceId && LISTENING_SPACES.some((space) => space.id === savedSpaceId)) {
    return savedSpaceId
  }

  return LISTENING_SPACES[0].id
}

export function listeningSpaceStyleVars(spaceId) {
  const space = resolveListeningSpace(spaceId)
  return {
    '--space-gradient-0': space.gradient[0],
    '--space-gradient-1': space.gradient[1],
    '--space-gradient-2': space.gradient[2],
    '--space-glow': space.glow,
    '--space-horizon': space.horizon,
  }
}

export function getPostcardThemeFromSpace(spaceId) {
  const space = resolveListeningSpace(spaceId)
  return {
    id: space.id,
    label: space.labelShort,
    gradient: space.postcardGradient,
    glow: space.postcardGlow,
    tagline: space.tagline,
  }
}
