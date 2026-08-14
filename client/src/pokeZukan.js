/** Daily card expedition — Tokyo-seeded hunt, TCG-style cards, duo matchup. */

export const POKE_ZUKAN_GUEST = 'zen'
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
  39, 43, 52, 54, 58, 59, 63, 66, 74, 77, 81, 92, 94, 95, 104, 113, 129, 130,
  131, 133, 134, 135, 136, 143, 147, 148, 149, 150, 151, 152, 155, 158, 172,
  175, 179, 196, 197, 212, 248, 249, 250, 280, 282, 303, 306, 310, 334, 359,
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
