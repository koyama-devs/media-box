/** Daily card expedition — Tokyo-seeded hunt, TCG-style cards, duo matchup. */

export const POKE_ZUKAN_GUEST = 'gabusan'
export const CHEERS = ['すごい！', 'がんばれ', 'いいね', '今日もエースだね']
export const HUNT_LIMIT = 3
export const TYPE_LABELS = {
  normal: 'ノーマル',
  fire: 'ほのお',
  water: 'みず',
  electric: 'でんき',
  grass: 'くさ',
  ice: 'こおり',
  fighting: 'かくとう',
  poison: 'どく',
  ground: 'じめん',
  flying: 'ひこう',
  psychic: 'エスパー',
  bug: 'むし',
  rock: 'いわ',
  ghost: 'ゴースト',
  dragon: 'ドラゴン',
  dark: 'あく',
  steel: 'はがね',
  fairy: 'フェアリー',
}

const TYPE_KEYS = Object.keys(TYPE_LABELS)

export const POKE_POOL = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 25, 26, 27, 37, 38,
  39, 40, 43, 44, 45, 52, 53, 54, 55, 58, 59, 63, 66, 74, 77, 78, 81, 92, 94, 95,
  104, 105, 113, 129, 130, 131, 133, 134, 135, 136, 143, 147, 148, 149, 150, 151,
  152, 153, 154, 155, 156, 157, 158, 159, 160, 172, 175, 176, 179, 180, 181,
  196, 197, 212, 248, 249, 250, 280, 281, 282, 303, 306, 310, 334, 359,
  373, 376, 380, 381, 384, 393, 394, 395, 448, 445, 658, 700, 724, 778,
]

export const REGION_RANGES = [
  { id: 'kanto', label: 'カントー', min: 1, max: 151 },
  { id: 'johto', label: 'ジョウト', min: 152, max: 251 },
  { id: 'hoenn', label: 'ホウエン', min: 252, max: 386 },
  { id: 'sinnoh', label: 'シンオウ', min: 387, max: 493 },
  { id: 'unova', label: 'イッシュ', min: 494, max: 649 },
  { id: 'kalos', label: 'カロス', min: 650, max: 721 },
  { id: 'alola', label: 'アローラ', min: 722, max: 809 },
]

const CACHE_PREFIX = 'hana-poke-zukan-v2-'
const memoryCache = new Map()

const WEAK = {
  fire: ['water', 'ground', 'rock'],
  water: ['electric', 'grass'],
  grass: ['fire', 'ice', 'poison', 'flying', 'bug'],
  electric: ['ground'],
  ice: ['fire', 'fighting', 'rock', 'steel'],
  fighting: ['flying', 'psychic', 'fairy'],
  poison: ['ground', 'psychic'],
  ground: ['water', 'grass', 'ice'],
  flying: ['electric', 'ice', 'rock'],
  psychic: ['bug', 'ghost', 'dark'],
  bug: ['fire', 'flying', 'rock'],
  rock: ['water', 'grass', 'fighting', 'ground', 'steel'],
  ghost: ['ghost', 'dark'],
  dragon: ['ice', 'dragon', 'fairy'],
  dark: ['fighting', 'bug', 'fairy'],
  steel: ['fire', 'fighting', 'ground'],
  fairy: ['poison', 'steel'],
  normal: ['fighting'],
}

export function tokyoZukanYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function tokyoHour(date = new Date()) {
  const raw = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

export function formatTokyoHm(value) {
  const date = value instanceof Date ? value : new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function formatTokyoStamp(value) {
  const date = value instanceof Date ? value : new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export const SHORT_SLEEP_MS = 6 * 60 * 60 * 1000

export function formatSleepSpan(ms) {
  const totalMin = Math.max(0, Math.round(Number(ms) / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h && m) return `${h}時間${m}分`
  if (h) return `${h}時間`
  return `${m}分`
}

export function sleepDurationMs(mon, now = Date.now()) {
  const start = Date.parse(mon?.sleepAtIso || '') || 0
  if (!start) return 0
  return Math.max(0, (now instanceof Date ? now.getTime() : now) - start)
}

function shiftTokyoYmd(ymd, days) {
  const parts = String(ymd || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days || 0)))
  return next.toISOString().slice(0, 10)
}

/** Bedtime night: 00:00–05:59 still belongs to the previous calendar day. */
export function sleepNightYmd(date = new Date()) {
  const t = date instanceof Date ? date : new Date(date)
  const ymd = tokyoZukanYmd(t)
  return tokyoHour(t) < 6 ? shiftTokyoYmd(ymd, -1) : ymd
}

/** Early = before 1:00; late = 1:00–5:59; day = daytime nap. */
export function sleepTimingFor(date = new Date()) {
  const hour = tokyoHour(date)
  if (hour >= 18 || hour < 1) {
    return { kind: 'early', health: 12, mood: 4, label: '早寝' }
  }
  if (hour >= 1 && hour < 6) {
    return { kind: 'late', health: -12, mood: -6, label: '夜ふかし' }
  }
  return { kind: 'day', health: 0, mood: 0, label: 'ひるね' }
}

export function worldMonIsSleeping(mon, now = Date.now()) {
  const until = Date.parse(mon?.sleepingUntilIso || '') || 0
  return until > now
}

function hashSeed(str) {
  let h = 2166136261
  const s = String(str || '')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffleWithSeed(list, seed) {
  const arr = [...list]
  let h = hashSeed(seed)
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
    const j = h % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function dailySpeciesId(ymd = tokyoZukanYmd(), biasIds = []) {
  const pool = POKE_POOL.slice()
  const extra = (biasIds || []).map(Number).filter((id) => pool.includes(id))
  const mixed = extra.length ? [...extra, ...extra, ...pool] : pool
  const i = hashSeed(`expedition:${ymd}`) % mixed.length
  return mixed[i]
}

function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key)
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      memoryCache.set(key, parsed)
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(key, value) {
  memoryCache.set(key, value)
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('図鑑データを取れませんでした。')
  return res.json()
}

function jaNameFrom(names, fallback) {
  const ja = (Array.isArray(names) ? names : []).find((n) => n?.language?.name === 'ja-Hrkt' || n?.language?.name === 'ja')
  return String(ja?.name || fallback || '').trim()
}

function flavorFrom(entries) {
  const list = Array.isArray(entries) ? entries : []
  const ja = list.find((e) => e?.language?.name === 'ja' || e?.language?.name === 'ja-Hrkt')
  const en = list.find((e) => e?.language?.name === 'en')
  return String(ja?.flavor_text || en?.flavor_text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function pickSprite(pokemon) {
  return String(
    pokemon?.sprites?.other?.['official-artwork']?.front_default
    || pokemon?.sprites?.front_default
    || '',
  )
}

async function loadChain(url) {
  if (!url) return []
  const chainDoc = await fetchJson(url)
  const out = []
  const walk = (node) => {
    if (!node?.species?.url) return
    const id = Number(String(node.species.url).match(/\/pokemon-species\/(\d+)/)?.[1] || 0)
    if (id) {
      out.push({
        id,
        name: String(node.species.name || ''),
      })
    }
    const next = Array.isArray(node.evolves_to) ? node.evolves_to[0] : null
    if (next) walk(next)
  }
  walk(chainDoc.chain)
  return out
}

function tcgHp(stats) {
  const hp = Number((stats || []).find((s) => s?.stat?.name === 'hp')?.base_stat) || 50
  return Math.min(340, Math.max(40, Math.round(hp / 10) * 10 + 30))
}

function weaknessesFor(types) {
  const set = new Set()
  ;(types || []).forEach((t) => {
    (WEAK[t] || []).forEach((w) => set.add(w))
  })
  return [...set].slice(0, 3)
}

async function loadStabMoves(pokemon, types) {
  const typeSet = new Set(types || [])
  const slots = [...(pokemon.moves || [])].slice(-8)
  const fetched = await Promise.all(
    slots.slice(0, 6).map(async (slot) => {
      try {
        const url = slot?.move?.url
        if (!url) return null
        const cached = readCache(`mv-${url}`)
        if (cached) return cached
        const doc = await fetchJson(url)
        const row = {
          id: String(doc.id),
          slug: String(doc.name || ''),
          nameJa: jaNameFrom(doc.names, doc.name),
          type: String(doc.type?.name || 'normal'),
          power: Number(doc.power) || 0,
        }
        writeCache(`mv-${url}`, row)
        return row
      } catch {
        return null
      }
    }),
  )
  const withPower = fetched.filter((m) => m && m.power >= 40)
  const stab = withPower.filter((m) => typeSet.has(m.type))
  const picked = [...stab, ...withPower].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i).slice(0, 2)
  if (picked.length) return picked
  const t = types[0] || 'normal'
  return [{
    id: `basic-${t}`,
    slug: 'tackle',
    nameJa: 'たいあたり',
    type: t,
    power: 40,
  }]
}

export async function loadSpeciesCard(id) {
  const sid = Number(id)
  if (!Number.isFinite(sid) || sid < 1) throw new Error('図鑑番号がありません。')
  const cached = readCache(`sp-${sid}`)
  if (cached?.moves) return cached

  const [pokemon, species] = await Promise.all([
    fetchJson(`https://pokeapi.co/api/v2/pokemon/${sid}`),
    fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${sid}`),
  ])
  const types = (pokemon.types || []).map((t) => t?.type?.name).filter(Boolean)
  const [evo, moves] = await Promise.all([
    loadChain(species?.evolution_chain?.url),
    loadStabMoves(pokemon, types),
  ])
  const card = {
    id: sid,
    slug: String(pokemon.name || species.name || ''),
    nameEn: String(pokemon.name || '').replace(/-/g, ' '),
    nameJa: jaNameFrom(species.names, pokemon.name),
    types,
    flavor: flavorFrom(species.flavor_text_entries),
    sprite: pickSprite(pokemon),
    evo,
    hp: tcgHp(pokemon.stats),
    moves,
    weaknesses: weaknessesFor(types),
    region: regionForId(sid),
  }
  writeCache(`sp-${sid}`, card)
  return card
}

export function regionForId(id) {
  const n = Number(id)
  return REGION_RANGES.find((r) => n >= r.min && n <= r.max) || REGION_RANGES[0]
}

export function wantedEvoIds(entries, cardsById) {
  const owned = new Set(Object.keys(entries || {}))
  const missing = []
  owned.forEach((id) => {
    const card = cardsById[id]
    ;(card?.evo || []).forEach((row) => {
      if (!owned.has(String(row.id)) && !missing.includes(row.id)) missing.push(row.id)
    })
  })
  return missing.slice(0, 8)
}

export async function loadDailyCard(ymd = tokyoZukanYmd(), biasIds = []) {
  return loadSpeciesCard(dailySpeciesId(ymd, biasIds))
}

export function dailyBoss(ymd = tokyoZukanYmd()) {
  const a = TYPE_KEYS[hashSeed(`${ymd}:boss-a`) % TYPE_KEYS.length]
  let b = TYPE_KEYS[hashSeed(`${ymd}:boss-b`) % TYPE_KEYS.length]
  if (b === a) b = TYPE_KEYS[(TYPE_KEYS.indexOf(a) + 3) % TYPE_KEYS.length]
  return [a, b]
}

export function dailyMatchupMode(ymd = tokyoZukanYmd()) {
  const modes = ['weakness', 'combo', 'trade']
  return modes[hashSeed(`${ymd}:mode`) % modes.length]
}

export function huntTiles(ymd = tokyoZukanYmd()) {
  const rareAt = hashSeed(`${ymd}:rare-tile`) % 6
  const kinds = ['energy', 'clue', 'empty', 'empty', 'energy', 'rare']
  const shuffled = shuffleWithSeed(kinds.filter((k) => k !== 'rare'), `${ymd}:tiles`)
  shuffled.splice(rareAt, 0, 'rare')
  return shuffled.slice(0, 6).map((kind, i) => ({
    id: `t${i}`,
    kind,
  }))
}

export function energyPips(ymd = tokyoZukanYmd()) {
  return shuffleWithSeed(TYPE_KEYS, `${ymd}:pips`).slice(0, 6)
}

export function typeHitsWeakness(attackType, defenderTypes) {
  return (defenderTypes || []).some((t) => (WEAK[t] || []).includes(attackType))
}

export function typeAdvantage(aTypes, bTypes) {
  const a = aTypes || []
  const b = bTypes || []
  const aHits = a.some((t) => typeHitsWeakness(t, b))
  const bHits = b.some((t) => typeHitsWeakness(t, a))
  if (aHits && !bHits) return 'a'
  if (bHits && !aHits) return 'b'
  return 'draw'
}

export function resolveWeaknessMatchup(hanaType, guestType, bossTypes) {
  const picks = [hanaType, guestType].filter(Boolean)
  const covered = (bossTypes || []).filter((boss) => picks.some((p) => (WEAK[boss] || []).includes(p)))
  return {
    ready: Boolean(hanaType && guestType),
    covered,
    duoOk: covered.length > 0 && hanaType !== guestType,
  }
}

export function resolveComboMatchup(hanaMoveType, guestMoveType, bossTypes) {
  const ready = Boolean(hanaMoveType && guestMoveType)
  const different = hanaMoveType && guestMoveType && hanaMoveType !== guestMoveType
  const cover = [hanaMoveType, guestMoveType].filter((t) => typeHitsWeakness(t, bossTypes))
  return {
    ready,
    duoOk: ready && different && cover.length > 0,
  }
}

export function coverageScore(partyTypes, bossTypes, supportType = '') {
  const bosses = bossTypes || []
  const types = [...(partyTypes || []), supportType].filter(Boolean)
  let score = 0
  bosses.forEach((boss) => {
    if ((WEAK[boss] || []).some((w) => types.includes(w))) score += 2
  })
  if (supportType && (WEAK[bosses[0]] || []).includes(supportType)) score += 1
  return score
}

export function typeLabel(id) {
  return TYPE_LABELS[id] || id
}

export function tileLabel(kind) {
  if (kind === 'rare') return 'レア'
  if (kind === 'energy') return 'エネルギー'
  if (kind === 'clue') return '手がかり'
  return 'からっぽ'
}

export function matchupTitle(mode) {
  if (mode === 'combo') return 'コンボ'
  if (mode === 'trade') return 'トレード賭け'
  return '弱点当て'
}

export function binderProgress(entries) {
  const ids = Object.keys(entries || {}).map(Number)
  return REGION_RANGES.map((region) => {
    const pool = POKE_POOL.filter((id) => id >= region.min && id <= region.max)
    const have = ids.filter((id) => id >= region.min && id <= region.max).length
    return {
      ...region,
      have,
      total: pool.length,
    }
  }).filter((r) => r.total > 0)
}

/** Village world: each trainer has their own party. */
export const WORLD_VER = 2
export const WORLD_SEASON = 'hana-gabu-1'
export const WORLD_PARTY_MAX = 3
export const WORLD_ACT_LIMIT = 8
export const XP_PER_LEVEL = 20
export const WORLD_SLEEP_MS = 8 * 60 * 60 * 1000
export const WORLD_STARTER = { hana: '172', guest: '4' }

export const WORLD_COOL_MS = {
  pet: 0,
  feed: 0,
  nap: 0,
  walk: 3 * 60 * 60 * 1000,
  find: 4 * 60 * 60 * 1000,
  cafe: 20 * 60 * 1000,
  cafeGift: 30 * 60 * 1000,
  train: 8 * 60 * 60 * 1000,
}

export const WORLD_DUO_COOL_MS = {
  treat: 3 * 60 * 60 * 1000,
  petFriend: 60 * 60 * 1000,
  cheer: 2 * 60 * 60 * 1000,
  gift: 4 * 60 * 60 * 1000,
}

export const WORLD_PLACES = [
  { id: 'home', label: 'おうち', kicker: 'ふたりの家', hint: 'なでて、ごはん、おやすみ' },
  { id: 'park', label: 'こうえん', kicker: 'そよ風の道', hint: 'おさんぽして、草むらをのぞく' },
  { id: 'cafe', label: 'カフェ', kicker: 'ショーケース', hint: 'メニューから選んで、あげる／おくる' },
  { id: 'gym', label: 'ジム', kicker: '特訓ひろば', hint: 'きたえるとレベルが上がり、しんかする' },
]

export const WORLD_STARTERS = [
  1, 4, 7, 152, 155, 158, 393,
  16, 25, 37, 39, 43, 52, 54, 58, 77, 104,
  113, 129, 133, 147, 172, 175, 179, 280, 303, 778,
]

/** First form → next form. Eevee branches by the place they train/live in. */
export const WORLD_EVO = {
  1: { into: 2, level: 5 },
  2: { into: 3, level: 12 },
  4: { into: 5, level: 5 },
  5: { into: 6, level: 12 },
  7: { into: 8, level: 5 },
  8: { into: 9, level: 12 },
  10: { into: 11, level: 4 },
  11: { into: 12, level: 7 },
  16: { into: 17, level: 6 },
  17: { into: 18, level: 12 },
  25: { into: 26, level: 12, needBond: 48 },
  37: { into: 38, level: 8 },
  39: { into: 40, level: 7 },
  43: { into: 44, level: 6 },
  44: { into: 45, level: 11 },
  52: { into: 53, level: 8 },
  54: { into: 55, level: 10 },
  58: { into: 59, level: 12 },
  77: { into: 78, level: 12 },
  104: { into: 105, level: 8 },
  129: { into: 130, level: 6 },
  147: { into: 148, level: 8 },
  148: { into: 149, level: 16 },
  152: { into: 153, level: 5 },
  153: { into: 154, level: 12 },
  155: { into: 156, level: 5 },
  156: { into: 157, level: 12 },
  158: { into: 159, level: 5 },
  159: { into: 160, level: 12 },
  172: { into: 25, level: 5 },
  175: { into: 176, level: 6 },
  179: { into: 180, level: 5 },
  180: { into: 181, level: 10 },
  280: { into: 281, level: 6 },
  281: { into: 282, level: 10 },
  393: { into: 394, level: 5 },
  394: { into: 395, level: 12 },
}

export const POKE_JA = {
  1: 'フシギダネ', 2: 'フシギソウ', 3: 'フシギバナ',
  4: 'ヒトカゲ', 5: 'リザード', 6: 'リザードン',
  7: 'ゼニガメ', 8: 'カメール', 9: 'カメックス',
  10: 'キャタピー', 11: 'トランセル', 12: 'バタフリー',
  16: 'ポッポ', 17: 'ピジョン', 18: 'ピジョット', 19: 'コラッタ',
  25: 'ピカチュウ', 26: 'ライチュウ', 27: 'サンド',
  37: 'ロコン', 38: 'キュウコン', 39: 'プリン', 40: 'プクリン',
  43: 'ナゾノクサ', 44: 'クサイハナ', 45: 'ラフレシア',
  52: 'ニャース', 53: 'ペルシアン', 54: 'コダック', 55: 'ゴルダック',
  58: 'ガーディ', 59: 'ウインディ',
  63: 'ケーシィ', 66: 'ワンリキー', 74: 'イシツブテ', 77: 'ポニータ', 78: 'ギャロップ',
  81: 'コイル', 92: 'ゴース', 94: 'ゲンガー', 95: 'イワーク',
  104: 'カラカラ', 105: 'ガラガラ', 113: 'ラッキー', 129: 'コイキング', 130: 'ギャラドス',
  131: 'ラプラス', 133: 'イーブイ', 134: 'シャワーズ', 135: 'サンダース', 136: 'ブースター',
  143: 'カビゴン', 147: 'ミニリュウ', 148: 'ハクリュー', 149: 'カイリュー',
  150: 'ミュウツー', 151: 'ミュウ', 152: 'チコリータ', 153: 'ベイリーフ', 154: 'メガニウム',
  155: 'ヒノアラシ', 156: 'マグマラシ', 157: 'バクフーン',
  158: 'ワニノコ', 159: 'アリゲイツ', 160: 'オーダイル',
  172: 'ピチュー', 175: 'トゲピー', 176: 'トゲチック', 179: 'メリープ', 180: 'モココ', 181: 'デンリュウ',
  196: 'エーフィ', 197: 'ブラッキー',
  212: 'ハッサム', 248: 'バンギラス', 249: 'ルギア', 250: 'ホウオウ',
  280: 'ラルトス', 281: 'キルリア', 282: 'サーナイト', 303: 'ヤミラミ', 306: 'ボスゴドラ',
  310: 'ライボルト', 334: 'チルタリス', 359: 'アブソル', 373: 'ボーマンダ',
  376: 'メタグロス', 380: 'ラティアス', 381: 'ラティオス', 384: 'レックウザ',
  393: 'ポッチャマ', 394: 'ポッタイシ', 395: 'エンペルト', 445: 'ガブリアス',
  448: 'ルカリオ', 658: 'ゲッコウガ', 700: 'ニンフィア', 724: 'ジュナイパー', 778: 'ミミッキュ',
}

export function pokeNameJa(id, fallback = '') {
  const n = Number(id)
  return POKE_JA[n] || fallback || ''
}

export function pokeArtUrls(id) {
  const n = Number(id)
  if (!Number.isFinite(n) || n < 1) return []
  const pad = String(n).padStart(3, '0')
  return [
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${n}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`,
    `https://assets.pokemon.com/assets/cms2/img/pokedex/detail/${pad}.png`,
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${n}.png`,
  ]
}

export const CAFE_MENU = [
  { id: 'lemon', name: 'はちみつれもん', emoji: '🍋', kind: 'drink', coins: 4, hunger: 6, mood: 10, energy: 20, health: 6, bond: 2, xp: 2 },
  { id: 'jasmine', name: 'ジャスミン茶', emoji: '🍵', kind: 'tea', coins: 4, hunger: 3, mood: 12, energy: 16, health: 8, bond: 2, xp: 2 },
  { id: 'houji', name: 'ほうじ茶', emoji: '🫖', kind: 'tea', coins: 3, hunger: 3, mood: 10, energy: 14, health: 10, bond: 2, xp: 1 },
  { id: 'chamomile', name: 'カモミール茶', emoji: '🌼', kind: 'tea', coins: 4, hunger: 2, mood: 14, energy: 12, health: 8, bond: 3, xp: 2 },
  { id: 'berry', name: 'きのみスムージー', emoji: '🍓', kind: 'drink', coins: 5, hunger: 12, mood: 12, energy: 18, health: 4, bond: 3, xp: 2 },
  { id: 'yogurt', name: 'ヨーグルトスムージー', emoji: '🫐', kind: 'drink', coins: 5, hunger: 10, mood: 10, energy: 16, health: 6, bond: 2, xp: 2 },
  { id: 'milk', name: 'あったかミルク', emoji: '🥛', kind: 'drink', coins: 3, hunger: 8, mood: 8, energy: 16, health: 6, bond: 2, xp: 1 },
  { id: 'onigiri', name: 'おにぎり', emoji: '🍙', kind: 'food', coins: 5, hunger: 28, mood: 8, energy: 10, health: 2, bond: 2, xp: 2 },
  { id: 'yaki', name: 'やきおにぎり', emoji: '🔥', kind: 'food', coins: 6, hunger: 30, mood: 10, energy: 12, health: 2, bond: 3, xp: 2 },
  { id: 'toast', name: 'はちみつトースト', emoji: '🍞', kind: 'food', coins: 5, hunger: 22, mood: 10, energy: 8, health: 2, bond: 2, xp: 2 },
  { id: 'parfait', name: 'きのみパフェ', emoji: '🍨', kind: 'food', coins: 6, hunger: 18, mood: 16, energy: 10, health: 2, bond: 4, xp: 3 },
  { id: 'mochi', name: 'さくらもち', emoji: '🌸', kind: 'food', coins: 6, hunger: 16, mood: 18, energy: 8, health: 2, bond: 5, xp: 3 },
]

const CAFE_KIND_LABEL = {
  drink: 'ドリンク',
  tea: 'お茶',
  food: 'ごはん',
}

export function cafeMenuItem(itemId) {
  const id = String(itemId || '').trim()
  return CAFE_MENU.find((row) => row.id === id) || null
}

export function cafeKindLabel(kind) {
  return CAFE_KIND_LABEL[kind] || 'メニュー'
}

export const WORLD_ACTIONS = {
  pet: { place: 'home', label: 'なでる', hunger: 0, mood: 14, energy: 2, bond: 4, coins: 0, xp: 0 },
  feed: { place: 'home', label: 'えさ', hunger: 22, mood: 6, energy: 4, bond: 2, coins: 0, xp: 1 },
  nap: { place: 'home', label: 'おやすみ', hunger: -4, mood: 4, energy: 26, bond: 2, coins: 0, xp: 1 },
  walk: { place: 'park', label: 'おさんぽ', hunger: -8, mood: 16, energy: -8, bond: 5, coins: 3, xp: 1 },
  find: { place: 'park', label: 'さがす', hunger: -4, mood: 8, energy: -6, bond: 3, coins: 4, xp: 1 },
  cafe: { place: 'cafe', label: 'ごはん', hunger: 26, mood: 12, energy: 6, bond: 6, coins: -4, xp: 1 },
  train: { place: 'gym', label: 'きたえる', hunger: -10, mood: 6, energy: -16, bond: 4, coins: 2, xp: 2 },
}

export const WORLD_DUO_ACTIONS = {
  treat: {
    place: 'cafe',
    label: 'カフェおごり',
    coins: -8,
    self: { hunger: 8, mood: 8, energy: 3, bond: 4, xp: 1 },
    mate: { hunger: 10, mood: 18, energy: 5, bond: 8, xp: 1 },
  },
  petFriend: {
    place: 'any',
    label: 'おせわ',
    coins: 0,
    self: { mood: 5, energy: 0, bond: 4, xp: 0 },
    mate: { mood: 10, energy: 1, bond: 10, xp: 1 },
  },
  cheer: {
    place: 'gym',
    label: 'おうえん',
    coins: 0,
    self: { mood: 6, energy: -3, bond: 4, xp: 1 },
    mate: { mood: 10, energy: 2, bond: 6, xp: 1 },
  },
  gift: {
    place: 'home',
    label: 'プレゼント',
    coins: -12,
    self: { mood: 6, energy: 0, bond: 5, xp: 0 },
    mate: { mood: 20, energy: 4, bond: 10, xp: 1 },
  },
}

export const WORLD_GUIDE = {
  pet: { gesture: 'stroke', line: 'なでてみて…', how: 'そっとなでなでして' },
  feed: { gesture: 'tap', line: 'おなかすいたよ…', how: 'タップでえさをあげて' },
  nap: { gesture: 'tap', line: 'ねむいよ…', how: 'タップでおやすみ。1時まえがけんこう' },
  walk: { gesture: 'stroke', line: 'おさんぽしよう…', how: 'スワイプして歩こう' },
  find: { gesture: 'tap', line: 'くさむらが気になる…', how: 'タップしてさがして' },
  cafe: { gesture: 'tap', line: 'いいにおい…', how: 'ショーケースから選んでね' },
  train: { gesture: 'tap', line: 'きたえたい！', how: 'タップして特訓' },
}

const WORLD_LOG_ICON = {
  pet: '🤚', feed: '🍚', nap: '🌙', wake: '☀️',
  walk: '👟', find: '🔍', cafe: '☕', cafeGift: '🎁',
  cafeClaim: '📦', train: '💪', treat: '🍰', petFriend: '🤝',
  cheer: '📣', gift: '🎀', adopt: '🥚', visit: '🚶',
  evolve: '✨',
}
const WORLD_LOG_LABEL = {
  pet: 'なでなで',
  feed: 'ごはん',
  nap: 'おやすみ',
  wake: 'おきた',
  walk: 'おさんぽ',
  find: 'さがす',
  cafe: 'カフェ',
  cafeGift: 'おくりもの',
  cafeClaim: 'うけとり',
  train: 'とっくん',
  treat: 'ごちそう',
  petFriend: 'おせわ',
  cheer: 'おうえん',
  gift: 'プレゼント',
  adopt: 'なかまに',
  visit: 'いどう',
  wake: '起こした',
  evolve: 'しんかした',
}

function emptyMon(id, speciesId = '') {
  return {
    id: String(id || ''),
    speciesId: String(speciesId || ''),
    nickname: '',
    hunger: 78,
    mood: 80,
    energy: 76,
    health: 82,
    bond: 28,
    level: 1,
    xp: 0,
    lastTickIso: '',
    cool: {},
    sleepAtIso: '',
    sleepYmd: '',
    sleepKind: '',
    sleepingUntilIso: '',
    careXpYmd: '',
    careXpActs: {},
    log: [],
  }
}

function starterTrainer(role) {
  const who = worldRole(role)
  const id = who === 'hana' ? 'mhana' : 'mgabu'
  const speciesId = WORLD_STARTER[who]
  const mon = emptyMon(id, speciesId)
  return {
    activeId: id,
    coins: 24,
    lastActYmd: '',
    mons: { [id]: mon },
    partyOrder: [id],
    gifts: [],
  }
}

export function emptyPokeWorld() {
  return {
    v: WORLD_VER,
    season: WORLD_SEASON,
    hanaPlace: 'home',
    guestPlace: 'home',
    hanaPlaceAt: '',
    guestPlaceAt: '',
    trainers: {
      hana: starterTrainer('hana'),
      guest: starterTrainer('guest'),
    },
    log: [],
  }
}

function clampStat(n, fallback = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(100, Math.round(v)))
}

function serializeWorldLog(raw) {
  const out = []
  if (!Array.isArray(raw)) return out
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const action = String(row.action || '').trim().slice(0, 12)
    if (!action) continue
    out.push({
      at: String(row.at || '').trim().slice(0, 40),
      by: row.by === 'hana' ? 'hana' : 'guest',
      action,
      place: String(row.place || '').trim().slice(0, 12),
      note: String(row.note || '').trim().slice(0, 64),
      monId: String(row.monId || '').trim().slice(0, 20),
    })
    if (out.length >= 24) break
  }
  return out
}

function serializeCool(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  const keys = new Set([
    ...Object.keys(WORLD_ACTIONS),
    ...Object.keys(WORLD_DUO_ACTIONS),
    ...Object.keys(WORLD_COOL_MS),
    ...Object.keys(WORLD_DUO_COOL_MS),
  ])
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue
    out[key] = String(raw[key] || '').trim().slice(0, 40)
  }
  return out
}

function serializeCafeGifts(raw) {
  const out = []
  if (!Array.isArray(raw)) return out
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const item = cafeMenuItem(row.itemId)
    if (!item) continue
    const id = String(row.id || '').trim().slice(0, 24)
    if (!id) continue
    out.push({
      id,
      itemId: item.id,
      from: row.from === 'hana' ? 'hana' : 'guest',
      atIso: String(row.atIso || '').trim().slice(0, 40),
    })
    if (out.length >= 4) break
  }
  return out
}

function serializeMon(raw, id) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const mid = String(id || src.id || '').trim().slice(0, 20)
  const kind = String(src.sleepKind || '').trim()
  return {
    id: mid,
    speciesId: String(Number(src.speciesId) || '').trim(),
    nickname: String(src.nickname || '').trim().slice(0, 16),
    hunger: clampStat(src.hunger, 78),
    mood: clampStat(src.mood, 80),
    energy: clampStat(src.energy, 76),
    health: clampStat(src.health, 82),
    bond: clampStat(src.bond, 28),
    level: Math.max(1, Math.min(99, Math.round(Number(src.level) || 1))),
    xp: Math.max(0, Math.round(Number(src.xp) || 0)),
    lastTickIso: String(src.lastTickIso || '').trim().slice(0, 40),
    cool: serializeCool(src.cool),
    sleepAtIso: String(src.sleepAtIso || '').trim().slice(0, 40),
    sleepYmd: String(src.sleepYmd || '').trim().slice(0, 12),
    sleepKind: kind === 'early' || kind === 'late' || kind === 'day' ? kind : '',
    sleepingUntilIso: String(src.sleepingUntilIso || '').trim().slice(0, 40),
    careXpYmd: String(src.careXpYmd || '').trim().slice(0, 12),
    careXpActs: serializeCareXpActs(src.careXpActs),
    log: serializeWorldLog(src.log),
  }
}

function serializeCareXpActs(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(WORLD_ACTIONS)) {
    if (raw[key]) out[key] = true
  }
  return out
}

function evoFamily(speciesId) {
  const ids = new Set()
  const start = String(Number(speciesId) || '').trim()
  if (!start) return ids
  ids.add(start)
  let cur = Number(start)
  const seen = new Set()
  while (WORLD_EVO[cur] && !seen.has(cur)) {
    seen.add(cur)
    cur = Number(WORLD_EVO[cur].into)
    if (!Number.isFinite(cur)) break
    ids.add(String(cur))
  }
  let added = true
  while (added) {
    added = false
    for (const [from, spec] of Object.entries(WORLD_EVO)) {
      const into = String(spec.into)
      if (ids.has(into) && !ids.has(String(from))) {
        ids.add(String(from))
        added = true
      }
    }
  }
  return ids
}

export function trainerOwnsFamily(trainer, speciesId) {
  const fam = evoFamily(speciesId)
  return Object.values(trainer?.mons || {}).some((mon) => fam.has(String(mon.speciesId)))
}

function preferredMon(a, b) {
  const an = Boolean(a?.nickname)
  const bn = Boolean(b?.nickname)
  if (an !== bn) return bn ? b : a
  if ((a.level || 1) !== (b.level || 1)) return (a.level || 1) >= (b.level || 1) ? a : b
  if ((a.bond || 0) !== (b.bond || 0)) return (a.bond || 0) >= (b.bond || 0) ? a : b
  return a
}

function dedupeTrainerMons(mons, activeId, partyOrder) {
  const kept = {}
  const winnerByFam = new Map()
  for (const mon of Object.values(mons || {})) {
    const key = [...evoFamily(mon.speciesId)].sort().join('-') || mon.speciesId
    const prev = winnerByFam.get(key)
    const win = prev ? preferredMon(prev, mon) : mon
    winnerByFam.set(key, win)
  }
  for (const mon of winnerByFam.values()) kept[mon.id] = mon
  const seen = new Set()
  const order = []
  for (const id of [...(Array.isArray(partyOrder) ? partyOrder : []), ...Object.keys(mons || {}), ...Object.keys(kept)]) {
    const key = String(id || '').trim()
    if (!kept[key] || seen.has(key)) continue
    seen.add(key)
    order.push(key)
  }
  const ordered = {}
  for (const id of order) ordered[id] = kept[id]
  let nextActive = order.includes(activeId) ? activeId : ''
  if (!nextActive) {
    const named = order.find((id) => ordered[id].nickname)
    nextActive = named || order[0] || ''
  }
  return { mons: ordered, activeId: nextActive, partyOrder: order.slice(0, WORLD_PARTY_MAX) }
}

function logOnMon(mon, entry) {
  if (!mon) return mon
  const row = { ...entry, monId: mon.id }
  return { ...mon, log: serializeWorldLog([row, ...(mon.log || [])]) }
}

function serializeTrainer(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const mons = {}
  const srcMons = src.mons && typeof src.mons === 'object' ? src.mons : {}
  let n = 0
  for (const [id, mon] of Object.entries(srcMons)) {
    if (n >= WORLD_PARTY_MAX) break
    const row = serializeMon(mon, id)
    if (!row.id || !row.speciesId) continue
    mons[row.id] = row
    n += 1
  }
  const unique = dedupeTrainerMons(
    mons,
    String(src.activeId || '').trim().slice(0, 20),
    src.partyOrder,
  )
  return {
    activeId: unique.activeId,
    coins: Math.max(0, Math.min(999, Math.round(Number(src.coins) || 24))),
    lastActYmd: String(src.lastActYmd || '').trim().slice(0, 12),
    mons: unique.mons,
    partyOrder: unique.partyOrder,
    gifts: serializeCafeGifts(src.gifts),
  }
}

function placeOf(value, fallback = 'home') {
  const loc = String(value || fallback || 'home').trim()
  return WORLD_PLACES.some((p) => p.id === loc) ? loc : 'home'
}

export function serializePokeWorld(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  if (String(src.season || '') !== WORLD_SEASON) return emptyPokeWorld()
  const log = serializeWorldLog(src.log)
  const hana = serializeTrainer(src.trainers?.hana)
  const guest = serializeTrainer(src.trainers?.guest)
  return {
    v: WORLD_VER,
    season: WORLD_SEASON,
    hanaPlace: placeOf(src.hanaPlace),
    guestPlace: placeOf(src.guestPlace),
    hanaPlaceAt: String(src.hanaPlaceAt || '').trim().slice(0, 40),
    guestPlaceAt: String(src.guestPlaceAt || '').trim().slice(0, 40),
    trainers: {
      hana: seedLegacyMonLog(hana, log, 'hana'),
      guest: seedLegacyMonLog(guest, log, 'guest'),
    },
    log,
  }
}

function seedLegacyMonLog(trainer, worldLog, role) {
  const mine = (worldLog || []).filter((row) => !row.by || row.by === role)
  if (!mine.length) return trainer
  const any = Object.values(trainer.mons || {}).some((mon) => mon.log?.length)
  if (any) return trainer
  const byMon = {}
  for (const row of mine) {
    const id = row.monId || trainer.activeId
    if (!trainer.mons[id]) continue
    if (!byMon[id]) byMon[id] = []
    byMon[id].push({ ...row, monId: id })
  }
  if (!Object.keys(byMon).length) return trainer
  const mons = { ...trainer.mons }
  for (const [id, rows] of Object.entries(byMon)) {
    mons[id] = { ...mons[id], log: serializeWorldLog(rows) }
  }
  return { ...trainer, mons }
}

function decayMon(mon, now) {
  const t = now instanceof Date ? now : new Date(now)
  const prevMs = Date.parse(mon.lastTickIso || '') || t.getTime()
  const hours = Math.max(0, Math.min(48, (t.getTime() - prevMs) / 3_600_000))
  if (hours < 0.08) {
    return { ...mon, lastTickIso: mon.lastTickIso || t.toISOString() }
  }
  return {
    ...mon,
    hunger: clampStat(mon.hunger - hours * 3.6),
    mood: clampStat(mon.mood - hours * 2.2),
    energy: clampStat(mon.energy + hours * 1.4),
    lastTickIso: t.toISOString(),
  }
}

function decayTrainer(trainer, now) {
  const mons = {}
  for (const [id, mon] of Object.entries(trainer.mons || {})) {
    mons[id] = decayMon(mon, now)
  }
  return { ...trainer, mons }
}

export function applyPokeWorldDecay(world, now = new Date()) {
  const next = serializePokeWorld(world)
  const t = now instanceof Date ? now : new Date(now)
  return {
    ...next,
    trainers: {
      hana: decayTrainer(next.trainers.hana, t),
      guest: decayTrainer(next.trainers.guest, t),
    },
  }
}

function pushWorldLog(world, entry) {
  return [{ ...entry }, ...(world.log || [])].slice(0, 24)
}

function applyXp(mon, amount) {
  let level = mon.level
  let xp = mon.xp + Math.max(0, Math.round(Number(amount) || 0))
  let guard = 0
  while (xp >= XP_PER_LEVEL && level < 99 && guard < 8) {
    xp -= XP_PER_LEVEL
    level += 1
    guard += 1
  }
  return { ...mon, level, xp }
}

const DAILY_CARE_XP = new Set(['feed', 'nap', 'cafe'])

function grantCareXp(mon, action, day, amount) {
  const gain = Math.max(0, Math.round(Number(amount) || 0))
  if (!gain) return { mon, gain: 0 }
  if (!DAILY_CARE_XP.has(action)) return { mon, gain }
  const acts = mon.careXpYmd === day ? { ...(mon.careXpActs || {}) } : {}
  if (acts[action]) return { mon, gain: 0 }
  return {
    mon: { ...mon, careXpYmd: day, careXpActs: { ...acts, [action]: true } },
    gain,
  }
}

function evoFor(mon, place) {
  const id = Number(mon?.speciesId)
  if (id === 133) {
    if (place === 'gym') return { into: 136, level: 6 }
    if (place === 'cafe') return { into: 700, level: 6 }
    if (place === 'park') return { into: 134, level: 6 }
    if (mon.bond >= 55) return { into: 196, level: 6 }
    return { into: 135, level: 6 }
  }
  return WORLD_EVO[id] || null
}

function maybeEvolveMon(mon, place) {
  const evo = evoFor(mon, place)
  if (!evo || mon.level < evo.level) return { mon, evolvedTo: '' }
  if (evo.needBond && mon.bond < evo.needBond) return { mon, evolvedTo: '' }
  const into = String(evo.into)
  return {
    mon: { ...mon, speciesId: into, mood: Math.max(mon.mood, 90) },
    evolvedTo: into,
  }
}

export function worldRole(role) {
  return role === 'hana' ? 'hana' : 'guest'
}

export function worldTrainer(world, role) {
  const trainers = world?.trainers
  if (trainers?.hana && trainers?.guest) return trainers[worldRole(role)] || trainers.guest
  return serializePokeWorld(world).trainers[worldRole(role)]
}

export function worldActiveMon(world, role) {
  const trainer = worldTrainer(world, role)
  return trainer.mons[trainer.activeId] || null
}

export function worldPartyList(world, role) {
  const trainer = worldTrainer(world, role)
  const mons = trainer.mons || {}
  const order = Array.isArray(trainer.partyOrder) && trainer.partyOrder.length
    ? trainer.partyOrder
    : Object.keys(mons)
  const seen = new Set()
  const out = []
  for (const id of order) {
    const mon = mons[id]
    if (!mon || seen.has(mon.id)) continue
    seen.add(mon.id)
    out.push(mon)
  }
  for (const mon of Object.values(mons)) {
    if (seen.has(mon.id)) continue
    seen.add(mon.id)
    out.push(mon)
  }
  return out
}

export function worldMonStyle(mon) {
  const sid = String(Number(mon?.speciesId) || 0)
  const mid = String(mon?.id || '')
  const seed = hashSeed(`mon-style:${sid}:${mid || sid}`)
  const rigRoll = seed % 100
  const rig = rigRoll < 34 ? 'small' : rigRoll < 73 ? 'mid' : 'heavy'
  const temperaments = ['playful', 'shy', 'proud', 'sleepy']
  const temperament = temperaments[(seed >>> 8) % temperaments.length]
  return { rig, temperament }
}

const SLEEP_NESTS = {
  nest: [12, 16, 17, 18, 176, 249, 250, 334],
  pond: [7, 8, 9, 54, 55, 129, 130, 131, 134, 158, 159, 160, 393, 394, 395, 658],
  hearth: [4, 5, 6, 37, 38, 58, 59, 77, 78, 136, 155, 156, 157],
  leaf: [1, 2, 3, 43, 44, 45, 152, 153, 154, 724],
  cushion: [25, 26, 39, 40, 81, 113, 133, 135, 172, 175, 179, 180, 181, 280, 281, 282, 303, 310, 700],
  cave: [27, 74, 95, 104, 105, 147, 148, 149, 248, 306, 373, 376, 445],
  silk: [10, 11, 212],
  shadow: [92, 94, 197, 359],
  pillow: [143],
  rag: [778],
  star: [63, 150, 151, 196, 380, 381, 384],
}

export function worldSleepNest(speciesId) {
  const id = Number(speciesId)
  if (!Number.isFinite(id) || id < 1) return 'futon'
  for (const [kind, ids] of Object.entries(SLEEP_NESTS)) {
    if (ids.includes(id)) return kind
  }
  return 'futon'
}

export function coolLeftMs(mon, action, now = Date.now()) {
  const coolMs = WORLD_COOL_MS[action] || WORLD_DUO_COOL_MS[action] || 0
  if (coolMs <= 0) return 0
  const last = Date.parse(mon?.cool?.[action] || '') || 0
  if (!last) return 0
  return Math.max(0, last + coolMs - now)
}

export function formatCoolLeft(ms) {
  if (ms <= 0) return ''
  const totalSec = Math.max(1, Math.ceil(ms / 1000))
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (m && s) return `${h}時間${m}分${s}秒`
    if (m) return `${h}時間${m}分`
    return `${h}時間`
  }
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return s ? `${m}分${s}秒` : `${m}分`
  }
  return `${totalSec}秒`
}

export function worldGestureAction(placeId, kind, suggested = '') {
  const place = String(placeId || 'home')
  const want = String(suggested || '')
  if (place === 'home') {
    if (kind === 'stroke') return 'pet'
    if (kind === 'hold') return 'nap'
    if (want === 'feed') return 'feed'
    if (want === 'nap') return 'nap'
    return 'pet'
  }
  if (place === 'park') {
    if (kind === 'tap') return want === 'walk' ? 'walk' : 'find'
    return 'walk'
  }
  if (place === 'cafe') return 'cafe'
  if (place === 'gym') return 'train'
  return ''
}

export function worldGuide(mon, placeId, now = Date.now()) {
  if (!mon) return null
  const place = String(placeId || 'home')
  const ready = (id) => {
    if (WORLD_ACTIONS[id]?.place !== place) return false
    if (id === 'nap' && !worldMonIsSleeping(mon, now)) return true
    return coolLeftMs(mon, id, now) <= 0
  }
  let action = ''
  if (place === 'home') {
    if (mon.hunger < 36 && ready('feed')) action = 'feed'
    else if (mon.energy < 32 && ready('nap')) action = 'nap'
    else if (ready('pet')) action = 'pet'
    else if (ready('feed')) action = 'feed'
    else if (ready('nap')) action = 'nap'
  } else if (place === 'park') {
    if (mon.mood < 48 && ready('walk')) action = 'walk'
    else if (ready('find')) action = 'find'
    else if (ready('walk')) action = 'walk'
  } else if (place === 'cafe' && ready('cafe')) action = 'cafe'
  else if (place === 'gym' && ready('train')) action = 'train'

  if (!action) {
    let soon = null
    for (const [id, spec] of Object.entries(WORLD_ACTIONS)) {
      if (spec.place !== place) continue
      const wait = coolLeftMs(mon, id, now)
      if (!soon || wait < soon.wait) soon = { id, wait }
    }
    if (!soon) return null
    const g = WORLD_GUIDE[soon.id] || WORLD_GUIDE.pet
    const actionLabel = WORLD_ACTIONS[soon.id]?.label || soon.id
    return {
      action: soon.id,
      wait: soon.wait,
      gesture: g.gesture,
      line: soon.wait > 0 ? `「${actionLabel}」` : g.line,
      how: g.how,
    }
  }

  const g = WORLD_GUIDE[action] || WORLD_GUIDE.pet
  return { action, wait: 0, gesture: g.gesture, line: g.line, how: g.how }
}

export function worldEvoHint(mon, place) {
  if (!mon) return ''
  const evo = evoFor(mon, place)
  if (!evo) return 'これ以上はしんかしない'
  if (Number(mon.speciesId) === 133) {
    return `Lv.${evo.level}・今の場所だと${pokeNameJa(evo.into)}`
  }
  if (evo.needBond && mon.bond < evo.needBond) {
    return `なかよし${evo.needBond}とLv.${evo.level}で${pokeNameJa(evo.into)}`
  }
  return `Lv.${evo.level}で${pokeNameJa(evo.into)}にしんか`
}

function togetherNow(world, place, who) {
  const mine = who === 'hana' ? world.hanaPlace : world.guestPlace
  const theirs = who === 'hana' ? world.guestPlace : world.hanaPlace
  return mine === place && theirs === place
}

export function worldPlace(id) {
  return WORLD_PLACES.find((p) => p.id === id) || WORLD_PLACES[0]
}

export function worldLogLine(entry, names = { hana: 'はな', guest: 'ガブさん' }) {
  if (!entry) return ''
  const verb = WORLD_LOG_LABEL[entry.action] || entry.action
  const stamp = formatTokyoStamp(entry.at)
  let detail = ''
  if (entry.action === 'wake' && entry.note) {
    detail = entry.note
  } else if (entry.action === 'nap' && entry.note) {
    const [kind, clock] = String(entry.note).split(':')
    const tag = kind === 'early' ? '早寝' : kind === 'late' ? '夜ふかし' : kind === 'day' ? 'ひるね' : ''
    detail = [clock, tag].filter(Boolean).join('・')
  } else if ((entry.action === 'cafe' || entry.action === 'cafeGift' || entry.action === 'cafeClaim') && entry.note) {
    detail = entry.note
  } else if (entry.action === 'adopt' && entry.note) {
    detail = pokeNameJa(entry.note, 'ポケモン')
  } else if (entry.action === 'evolve' && entry.note) {
    detail = `→${pokeNameJa(entry.note)}`
  }
  const parts = [stamp, verb, detail].filter(Boolean)
  return parts.join(' ')
}

export { WORLD_LOG_ICON }

export function worldPendingFor(world, role, ymd = tokyoZukanYmd()) {
  const w = applyPokeWorldDecay(world)
  const trainer = w.trainers[worldRole(role)]
  const mon = trainer.mons[trainer.activeId]
  if (!mon) return true
  return trainer.lastActYmd !== ymd || mon.hunger < 36 || mon.mood < 36
}

export function worldDuoCared(world, ymd = tokyoZukanYmd()) {
  const w = serializePokeWorld(world)
  return w.trainers.hana.lastActYmd === ymd && w.trainers.guest.lastActYmd === ymd
}

function wakeTrainerMon(trainer) {
  const mon = trainer?.mons?.[trainer.activeId]
  if (!mon) return trainer
  const sleeping = Boolean(String(mon.sleepingUntilIso || '').trim())
  const hadNapCool = Boolean(String(mon.cool?.nap || '').trim())
  if (!sleeping && !hadNapCool) return trainer
  return {
    ...trainer,
    mons: {
      ...trainer.mons,
      [mon.id]: { ...mon, sleepingUntilIso: '', cool: { ...(mon.cool || {}), nap: '' } },
    },
  }
}

export function applyPokeWorldWake(world, { role, now } = {}) {
  const who = worldRole(role)
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const next = serializePokeWorld(world)
  const trainer = next.trainers[who]
  const mon = trainer?.mons?.[trainer.activeId]
  const wasSleeping = Boolean(String(mon?.sleepingUntilIso || '').trim()) || worldMonIsSleeping(mon, t.getTime())
  const woken = wakeTrainerMon(trainer)
  if (woken === trainer && !wasSleeping) return next
  const span = formatSleepSpan(sleepDurationMs(mon, t))
  const place = next[who === 'hana' ? 'hanaPlace' : 'guestPlace']
  const entry = {
    at: t.toISOString(),
    by: who,
    action: 'wake',
    place,
    note: span,
  }
  const wokenMon = logOnMon(woken.mons[mon.id], entry)
  return serializePokeWorld({
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...woken,
        mons: { ...woken.mons, [mon.id]: wokenMon },
      },
    },
    log: pushWorldLog(next, entry),
  })
}

export function applyPokeWorldVisit(world, { role, place, now } = {}) {
  const who = worldRole(role)
  const loc = worldPlace(place).id
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const next = serializePokeWorld(world)
  const key = who === 'hana' ? 'hanaPlace' : 'guestPlace'
  const atKey = who === 'hana' ? 'hanaPlaceAt' : 'guestPlaceAt'
  const trainer = next.trainers[who]
  const mon = trainer?.mons?.[trainer.activeId]
  const wasSleeping = Boolean(String(mon?.sleepingUntilIso || '').trim()) || worldMonIsSleeping(mon, t.getTime())
  const woken = wakeTrainerMon(trainer)
  let log = next.log
  let logMon = woken.mons[woken.activeId] || woken.mons[mon?.id]
  if (wasSleeping && logMon) {
    const wakeEntry = {
      at: t.toISOString(),
      by: who,
      action: 'wake',
      place: next[key],
      note: formatSleepSpan(sleepDurationMs(mon, t)),
    }
    log = pushWorldLog({ ...next, log }, wakeEntry)
    logMon = logOnMon(logMon, wakeEntry)
  }
  const visitEntry = {
    at: t.toISOString(),
    by: who,
    action: 'visit',
    place: loc,
    note: loc,
  }
  log = pushWorldLog({ ...next, log }, visitEntry)
  if (logMon) logMon = logOnMon(logMon, visitEntry)
  const moved = {
    ...next,
    [key]: loc,
    [atKey]: t.toISOString(),
    trainers: {
      ...next.trainers,
      [who]: {
        ...woken,
        mons: logMon ? { ...woken.mons, [logMon.id]: logMon } : woken.mons,
      },
    },
    log,
  }
  return { world: serializePokeWorld(moved), together: togetherNow(moved, loc, who) }
}

export function applyPokeWorldAdopt(world, { role, speciesId, now } = {}) {
  const who = worldRole(role)
  const sid = String(Number(speciesId) || '').trim()
  if (!sid) throw new Error('ポケモンを選んでください。')
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const base = applyPokeWorldDecay(world, t)
  const trainer = base.trainers[who]
  if (Object.keys(trainer.mons).length >= WORLD_PARTY_MAX) {
    throw new Error('なかまは3匹まで。')
  }
  if (trainerOwnsFamily(trainer, sid)) {
    throw new Error('同じポケモンはすでにいるよ。')
  }
  const id = `m${t.getTime().toString(36)}`
  const adoptEntry = { at: t.toISOString(), by: who, action: 'adopt', place: 'home', note: sid }
  const mon = logOnMon({
    ...emptyMon(id, sid),
    lastTickIso: t.toISOString(),
  }, adoptEntry)
  return serializePokeWorld({
    ...base,
    trainers: {
      ...base.trainers,
      [who]: {
        ...trainer,
        activeId: id,
        mons: { ...trainer.mons, [id]: mon },
        partyOrder: [...(trainer.partyOrder || Object.keys(trainer.mons)), id]
          .filter((monId, i, arr) => arr.indexOf(monId) === i)
          .slice(0, WORLD_PARTY_MAX),
      },
    },
    log: pushWorldLog(base, adoptEntry),
  })
}

export function applyPokeWorldSelect(world, { role, monId } = {}) {
  const who = worldRole(role)
  const next = serializePokeWorld(world)
  const trainer = next.trainers[who]
  const id = String(monId || '').trim()
  if (!trainer.mons[id]) throw new Error('そのポケモンはいない。')
  return serializePokeWorld({
    ...next,
    trainers: {
      ...next.trainers,
      [who]: { ...trainer, activeId: id },
    },
  })
}

export function applyPokeWorldNickname(world, { role, nickname } = {}) {
  const who = worldRole(role)
  const next = serializePokeWorld(world)
  const trainer = next.trainers[who]
  const mon = trainer.mons[trainer.activeId]
  if (!mon) return next
  return serializePokeWorld({
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...trainer,
        mons: {
          ...trainer.mons,
          [mon.id]: { ...mon, nickname: String(nickname || '').trim().slice(0, 16) },
        },
      },
    },
  })
}

export function applyPokeWorldAction(world, { role, action, now, findId } = {}) {
  const who = worldRole(role)
  const spec = WORLD_ACTIONS[action]
  if (!spec) throw new Error('その行動はできません。')
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const day = tokyoZukanYmd(t)
  let next = applyPokeWorldDecay(world, t)
  const trainer = next.trainers[who]
  let mon = trainer.mons[trainer.activeId]
  if (!mon) throw new Error('先にポケモンを迎えてください。')
  if (next[who === 'hana' ? 'hanaPlace' : 'guestPlace'] !== spec.place) {
    throw new Error(`${worldPlace(spec.place).label}へ行ってから。`)
  }
  const wait = (action === 'nap' && !worldMonIsSleeping(mon, t.getTime()))
    ? 0
    : coolLeftMs(mon, action, t.getTime())
  if (wait > 0) throw new Error(`まだ早い。あと${formatCoolLeft(wait)}`)
  if (spec.coins < 0 && trainer.coins + spec.coins < 0) throw new Error('コインが足りない。')
  if (action === 'train' && mon.energy < 12) throw new Error('げんきが足りない。おやすみしよう。')
  const together = togetherNow(next, spec.place, who)
  let sleepPatch = { sleepingUntilIso: '' }
  let extraMood = 0
  let extraHealth = 0
  let napNote = together ? 'together' : ''
  if (action === 'nap') {
    const timing = sleepTimingFor(t)
    const nightYmd = sleepNightYmd(t)
    const scoredAlready = mon.sleepYmd === nightYmd
    extraMood = scoredAlready ? 0 : timing.mood
    extraHealth = scoredAlready ? 0 : timing.health
    sleepPatch = {
      health: clampStat((mon.health ?? 82) + extraHealth),
      sleepAtIso: t.toISOString(),
      sleepYmd: nightYmd,
      sleepKind: timing.kind,
      sleepingUntilIso: new Date(t.getTime() + WORLD_SLEEP_MS).toISOString(),
    }
    napNote = `${timing.kind}:${formatTokyoHm(t)}`
  }
  const xpGate = grantCareXp(mon, action, day, spec.xp)
  mon = applyXp({
    ...xpGate.mon,
    hunger: clampStat(mon.hunger + spec.hunger),
    mood: clampStat(mon.mood + spec.mood + extraMood + (together ? 8 : 0)),
    energy: clampStat(mon.energy + spec.energy),
    health: action === 'nap' ? sleepPatch.health : (mon.health ?? 82),
    bond: clampStat(mon.bond + spec.bond + (together ? 7 : 0)),
    cool: { ...mon.cool, [action]: t.toISOString() },
    ...sleepPatch,
  }, xpGate.gain)
  const evo = maybeEvolveMon(mon, spec.place)
  mon = evo.mon
  const actEntry = {
    at: t.toISOString(),
    by: who,
    action: evo.evolvedTo ? 'evolve' : action,
    place: spec.place,
    note: evo.evolvedTo || napNote,
  }
  mon = logOnMon(mon, actEntry)
  next = {
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...trainer,
        coins: Math.max(0, trainer.coins + spec.coins + (together && spec.coins > 0 ? 2 : 0)),
        lastActYmd: day,
        mons: { ...trainer.mons, [mon.id]: mon },
      },
    },
    log: pushWorldLog(next, actEntry),
  }
  return {
    world: serializePokeWorld(next),
    together,
    foundId: action === 'find' ? String(Number(findId) || '').trim() : '',
    evolvedTo: evo.evolvedTo || '',
  }
}

export function applyPokeWorldDuoAction(world, { role, action, now } = {}) {
  const who = worldRole(role)
  const mate = who === 'hana' ? 'guest' : 'hana'
  const spec = WORLD_DUO_ACTIONS[action]
  if (!spec) throw new Error('その協力アクションはできません。')
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const day = tokyoZukanYmd(t)
  let next = applyPokeWorldDecay(world, t)
  const myTrainer = next.trainers[who]
  const mateTrainer = next.trainers[mate]
  const myMon = myTrainer.mons[myTrainer.activeId]
  const mateMon = mateTrainer.mons[mateTrainer.activeId]
  if (!myMon || !mateMon) throw new Error('ふたりともポケモンを連れてきて。')
  const myPlace = next[who === 'hana' ? 'hanaPlace' : 'guestPlace']
  const matePlace = next[mate === 'hana' ? 'hanaPlace' : 'guestPlace']
  if (myPlace !== matePlace) throw new Error('同じ場所で合流してから。')
  if (spec.place !== 'any' && myPlace !== spec.place) {
    throw new Error(`${worldPlace(spec.place).label}へ行ってから。`)
  }
  const wait = coolLeftMs(myMon, action, t.getTime())
  if (wait > 0) throw new Error(`まだ早い。あと${formatCoolLeft(wait)}`)
  if (spec.coins < 0 && myTrainer.coins + spec.coins < 0) throw new Error('コインが足りない。')

  const applyDelta = (mon, delta = {}, bonusXp = 0) => applyXp({
    ...mon,
    hunger: clampStat(mon.hunger + (Number(delta.hunger) || 0)),
    mood: clampStat(mon.mood + (Number(delta.mood) || 0)),
    energy: clampStat(mon.energy + (Number(delta.energy) || 0)),
    bond: clampStat(mon.bond + (Number(delta.bond) || 0)),
    cool: { ...mon.cool, [action]: t.toISOString() },
    sleepingUntilIso: '',
  }, Math.max(0, (Number(delta.xp) || 0) + bonusXp))

  const duoEntry = {
    at: t.toISOString(),
    by: who,
    action,
    place: myPlace,
    note: 'duo',
  }
  const nextMyMon = logOnMon(applyDelta(myMon, spec.self, 0), duoEntry)
  const nextMateMon = logOnMon(applyDelta(mateMon, spec.mate, 0), duoEntry)
  next = {
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...myTrainer,
        coins: Math.max(0, myTrainer.coins + (Number(spec.coins) || 0)),
        lastActYmd: day,
        mons: { ...myTrainer.mons, [nextMyMon.id]: nextMyMon },
      },
      [mate]: {
        ...mateTrainer,
        lastActYmd: day,
        mons: { ...mateTrainer.mons, [nextMateMon.id]: nextMateMon },
      },
    },
    log: pushWorldLog(next, duoEntry),
  }
  return { world: serializePokeWorld(next), place: myPlace }
}

function sipCafeItem(mon, item, extra = {}) {
  return applyXp({
    ...mon,
    hunger: clampStat(mon.hunger + (Number(item.hunger) || 0)),
    mood: clampStat(mon.mood + (Number(item.mood) || 0) + (Number(extra.mood) || 0)),
    energy: clampStat(mon.energy + (Number(item.energy) || 0)),
    health: clampStat((mon.health ?? 82) + (Number(item.health) || 0)),
    bond: clampStat(mon.bond + (Number(item.bond) || 0) + (Number(extra.bond) || 0)),
    sleepingUntilIso: '',
    cool: { ...mon.cool, ...(extra.cool || {}) },
  }, Math.max(0, Number(item.xp) || 0) + (Number(extra.xp) || 0))
}

export function applyPokeWorldCafeOrder(world, { role, itemId, target = 'self', now } = {}) {
  const who = worldRole(role)
  const mate = who === 'hana' ? 'guest' : 'hana'
  const item = cafeMenuItem(itemId)
  if (!item) throw new Error('そのメニューはないよ。')
  const send = String(target || 'self') === 'mate'
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const day = tokyoZukanYmd(t)
  let next = applyPokeWorldDecay(world, t)
  const myPlace = next[who === 'hana' ? 'hanaPlace' : 'guestPlace']
  if (myPlace !== 'cafe') throw new Error('カフェへ行ってから。')
  const myTrainer = next.trainers[who]
  const myMon = myTrainer.mons[myTrainer.activeId]
  if (!myMon) throw new Error('先にポケモンを迎えてください。')
  const coolKey = send ? 'cafeGift' : 'cafe'
  const wait = coolLeftMs(myMon, coolKey, t.getTime())
  if (wait > 0) throw new Error(`まだ早い。あと${formatCoolLeft(wait)}`)
  if (myTrainer.coins < item.coins) throw new Error('コインが足りない。')

  if (!send) {
    const xpGate = grantCareXp(myMon, 'cafe', day, 1)
    let mon = sipCafeItem(xpGate.mon, { ...item, xp: 0 }, { cool: { cafe: t.toISOString() } })
    mon = applyXp(mon, xpGate.gain)
    const evo = maybeEvolveMon(mon, 'cafe')
    mon = evo.mon
    const cafeEntry = {
      at: t.toISOString(),
      by: who,
      action: 'cafe',
      place: 'cafe',
      note: item.name,
    }
    mon = logOnMon(mon, cafeEntry)
    next = {
      ...next,
      trainers: {
        ...next.trainers,
        [who]: {
          ...myTrainer,
          coins: Math.max(0, myTrainer.coins - item.coins),
          lastActYmd: day,
          mons: { ...myTrainer.mons, [mon.id]: mon },
        },
      },
      log: pushWorldLog(next, cafeEntry),
    }
    return { world: serializePokeWorld(next), evolvedTo: evo.evolvedTo || '', item }
  }

  const mateTrainer = next.trainers[mate]
  const mateMon = mateTrainer.mons[mateTrainer.activeId]
  if (!mateMon) throw new Error('相手のポケモンがまだいないよ。')
  const gifts = serializeCafeGifts(mateTrainer.gifts)
  if (gifts.length >= 4) throw new Error('相手の贈り物がいっぱい。')
  const gift = {
    id: `${t.getTime().toString(36)}${item.id}`.slice(0, 24),
    itemId: item.id,
    from: who,
    atIso: t.toISOString(),
  }
  const nextMyMon = logOnMon({
    ...myMon,
    mood: clampStat(myMon.mood + 4),
    bond: clampStat(myMon.bond + 3),
    cool: { ...myMon.cool, cafeGift: t.toISOString() },
  }, {
    at: t.toISOString(),
    by: who,
    action: 'cafeGift',
    place: 'cafe',
    note: item.name,
  })
  next = {
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...myTrainer,
        coins: Math.max(0, myTrainer.coins - item.coins),
        lastActYmd: day,
        mons: { ...myTrainer.mons, [nextMyMon.id]: nextMyMon },
      },
      [mate]: {
        ...mateTrainer,
        gifts: [...gifts, gift],
      },
    },
    log: pushWorldLog(next, {
      at: t.toISOString(),
      by: who,
      action: 'cafeGift',
      place: 'cafe',
      note: item.name,
    }),
  }
  return { world: serializePokeWorld(next), evolvedTo: '', item, gift }
}

export function applyPokeWorldCafeClaim(world, { role, giftId, now } = {}) {
  const who = worldRole(role)
  const t = now instanceof Date ? now : new Date(now || Date.now())
  const day = tokyoZukanYmd(t)
  let next = applyPokeWorldDecay(world, t)
  const trainer = next.trainers[who]
  const mon = trainer.mons[trainer.activeId]
  if (!mon) throw new Error('先にポケモンを迎えてください。')
  const gifts = serializeCafeGifts(trainer.gifts)
  const idx = gifts.findIndex((row) => row.id === String(giftId || '').trim())
  if (idx < 0) throw new Error('その贈り物はないよ。')
  const gift = gifts[idx]
  const item = cafeMenuItem(gift.itemId)
  if (!item) throw new Error('そのメニューはないよ。')
  const claimEntry = {
    at: t.toISOString(),
    by: who,
    action: 'cafeClaim',
    place: next[who === 'hana' ? 'hanaPlace' : 'guestPlace'],
    note: item.name,
  }
  const nextMon = logOnMon(sipCafeItem(mon, { ...item, xp: 0 }, { mood: 4, bond: 4 }), claimEntry)
  const rest = gifts.filter((_, i) => i !== idx)
  next = {
    ...next,
    trainers: {
      ...next.trainers,
      [who]: {
        ...trainer,
        lastActYmd: day,
        mons: { ...trainer.mons, [nextMon.id]: nextMon },
        gifts: rest,
      },
    },
    log: pushWorldLog(next, claimEntry),
  }
  return { world: serializePokeWorld(next), item, gift }
}

export function pickWorldFindId(entries, ymd = tokyoZukanYmd()) {
  const owned = new Set(Object.keys(entries || {}))
  const pool = POKE_POOL.filter((id) => !owned.has(String(id)))
  const list = pool.length ? pool : POKE_POOL
  return String(list[hashSeed(`world-find:${ymd}:${owned.size}`) % list.length])
}
