/**
 * Chat sticker sets: はな (feminine), かいと (masculine), and shared packs
 * (毎日 / ともだち). Flat fills only — no gradients or <defs> — because these
 * render many times per screen and duplicated element ids would collide.
 */

import { TOMO_SET, TomoStickerArt } from './TomoStickers'

const VIEW_BOX = '20 14 80 80'

const INK = '#2a1814'
const HAIR = '#3a2420'
const SKIN = '#ffe8dc'
const BLUSH = '#f4a89a'
const MOUTH = '#c45c4a'
const LIP = '#c47a6e'
const PETAL = '#e89aaa'
const PETAL_LIGHT = '#f2b8c4'
const TEAR = '#7cc4f0'
const HEART = '#e8556f'
const GOLD = '#fcd34d'

// かいと palette — cooler and lower-contrast so both sets sit together well.
const HAIR_M = '#2c3548'
const HAIR_M_HI = '#55678a'
const SKIN_M = '#ffdcc6'
const GEAR = '#3d4a63'
const GEAR_HI = '#61729a'
const GEAR_DARK = '#1e2634'
const STEEL = '#5b8def'
const STEEL_LIGHT = '#9dc0ff'
const MOUTH_M = '#b8544a'
const LIP_M = '#a9645a'
const BLUSH_M = '#ef9280'
const FLAME = '#f97316'

const HANA_SET = [
  { id: 'smile', label: 'にこにこ' },
  { id: 'laugh', label: 'わーい' },
  { id: 'love', label: 'だいすき' },
  { id: 'shy', label: 'てれてれ' },
  { id: 'tereru', label: 'てれるよ' },
  { id: 'hazukashii', label: 'はずかしい' },
  { id: 'mojimoji', label: 'もじもじ' },
  { id: 'wink', label: 'ウィンク' },
  { id: 'music', label: 'ごきげん' },
  { id: 'sparkle', label: 'きらきら' },
  { id: 'surprised', label: 'びっくり' },
  { id: 'thinking', label: 'うーん' },
  { id: 'sleepy', label: 'おやすみ' },
  { id: 'cry', label: 'ぐすん' },
  { id: 'sorry', label: 'ごめんね' },
  { id: 'angry', label: 'ぷんぷん' },
]

const KAITO_SET = [
  { id: 'k-smile', label: 'にっこり' },
  { id: 'k-grin', label: 'にやり' },
  { id: 'k-laugh', label: 'あはは' },
  { id: 'k-cool', label: 'キメ顔' },
  { id: 'k-wink', label: 'ウィンク' },
  { id: 'k-shy', label: 'てれる' },
  { id: 'k-bashful', label: 'はずかしい' },
  { id: 'k-mojimoji', label: 'もじもじ' },
  { id: 'k-good', label: 'いいね' },
  { id: 'k-fight', label: 'ファイト' },
  { id: 'k-ok', label: 'オッケー' },
  { id: 'k-think', label: 'なるほど' },
  { id: 'k-surprised', label: 'まじで' },
  { id: 'k-sleepy', label: 'ねむい' },
  { id: 'k-sad', label: 'しょんぼり' },
  { id: 'k-sorry', label: 'すまん' },
  { id: 'k-angry', label: 'むっ' },
]

/** Full-body animated stamps (not just a swapped face). */
const HANA_LIVE_SET = [
  { id: 'h-kiss', label: 'ちゅっ♡', motion: 'kiss', burst: 'kiss' },
  { id: 'h-hearts', label: 'ハート飛ばし', motion: 'hearts', burst: 'hearts' },
  { id: 'h-hug', label: 'ぎゅっ', motion: 'hug', burst: 'hearts' },
  { id: 'h-peek', label: 'ちらっ', motion: 'peek' },
  { id: 'h-jump', label: 'きゃー', motion: 'jump', burst: 'sparkle' },
  { id: 'h-peace', label: 'ぴーす', motion: 'peace' },
  { id: 'h-winklove', label: 'ウィンク♡', motion: 'wink', burst: 'hearts' },
]

const KAITO_LIVE_SET = [
  { id: 'k-kiss', label: 'ちゅっ', motion: 'kiss', burst: 'kiss' },
  { id: 'k-hearts', label: 'ハート砲', motion: 'hearts', burst: 'hearts' },
  { id: 'k-hug', label: 'だきしめ', motion: 'hug', burst: 'hearts' },
  { id: 'k-peek', label: 'ちらっ', motion: 'peek' },
  { id: 'k-jump', label: 'よっしゃ', motion: 'jump', burst: 'sparkle' },
  { id: 'k-peace', label: 'ピース', motion: 'peace' },
  { id: 'k-winklove', label: 'ウィンク', motion: 'wink', burst: 'hearts' },
]

const DAILY_SET = [
  {
    id: 'daily-ohayou',
    label: 'おはよう！',
    phrase: 'おはよう！',
    face: 'smile',
    accent: '#f6b84a',
    aliases: ['おはよう', 'ohayou', 'ohayo', 'goodmorning', 'morning', 'chàobuổi sáng'],
    related: ['smile', 'music', 'sparkle'],
  },
  {
    id: 'daily-konnichiwa',
    label: 'こんにちは',
    phrase: 'こんにちは',
    face: 'wink',
    accent: '#f59e8b',
    aliases: ['こんにちは', 'konnichiwa', 'hello', 'xin chào'],
    related: ['smile', 'wink', 'laugh'],
  },
  {
    id: 'daily-konbanwa',
    label: 'こんばんは',
    phrase: 'こんばんは',
    face: 'smile',
    accent: '#8b82d8',
    aliases: ['こんばんは', 'konbanwa', 'goodevening', 'chào buổi tối'],
    related: ['smile', 'music', 'shy'],
  },
  {
    id: 'daily-arigatou',
    label: 'ありがとう♡',
    phrase: 'ありがとう♡',
    face: 'love',
    accent: '#ed7e99',
    aliases: ['ありがとう', 'ありがと', 'arigatou', 'arigato', 'thankyou', 'thanks', 'cảmơn'],
    related: ['love', 'shy', 'sparkle'],
  },
  {
    id: 'daily-gomenne',
    label: 'ごめんね…',
    phrase: 'ごめんね…',
    face: 'sorry',
    accent: '#79a9d8',
    aliases: ['ごめんね', 'ごめん', 'すみません', 'gomennne', 'gomenne', 'gomen', 'sorry', 'xinlỗi'],
    related: ['sorry', 'cry', 'shy'],
  },
  {
    id: 'daily-otsukare',
    label: 'おつかれ！',
    phrase: 'おつかれ！',
    face: 'wink',
    accent: '#e5a04d',
    aliases: ['おつかれ', 'otsukare', 'mệtrồi', 'vấtvả'],
    related: ['wink', 'smile', 'music'],
  },
  {
    id: 'daily-otsukaresama',
    label: 'おつかれさま!!',
    phrase: 'おつかれさま!!',
    face: 'laugh',
    accent: '#e98a62',
    aliases: ['おつかれさま', 'otsukaresama', 'otsukaresama!!', 'goodjob', 'làmtốt'],
    related: ['laugh', 'sparkle', 'love'],
  },
  {
    id: 'daily-oyasumi',
    label: 'おやすみなさい',
    phrase: 'おやすみなさい',
    face: 'sleepy',
    accent: '#8176c8',
    aliases: ['おやすみ', 'おやすみなさい', 'oyasumi', 'oyasuminasai', 'goodnight', 'ngủngon'],
    related: ['sleepy', 'shy', 'smile'],
  },
  {
    id: 'daily-itterasshai',
    label: 'いってらっしゃい',
    phrase: 'いってらっしゃい',
    face: 'wink',
    accent: '#54b89a',
    aliases: ['いってらっしゃい', 'itterasshai', 'đi nhé', 'thượnglộ'],
    related: ['wink', 'smile', 'sparkle'],
  },
  {
    id: 'daily-okaeri',
    label: 'おかえり〜',
    phrase: 'おかえり〜',
    face: 'love',
    accent: '#e883a0',
    aliases: ['おかえり', 'okaeri', 'welcomeback', 'mừngvề'],
    related: ['love', 'laugh', 'smile'],
  },
  {
    id: 'daily-tadaima',
    label: 'ただいま！',
    phrase: 'ただいま！',
    face: 'laugh',
    accent: '#ef8c6a',
    aliases: ['ただいま', 'tadaima', 'imhome', 'vềrồi'],
    related: ['laugh', 'smile', 'music'],
  },
  {
    id: 'daily-ganbatte',
    label: 'がんばって！',
    phrase: 'がんばって！',
    face: 'sparkle',
    accent: '#e96658',
    aliases: ['がんばって', 'がんばれ', '頑張って', 'ganbatte', 'ganbare', 'cốlên', 'fight'],
    related: ['sparkle', 'laugh', 'k-fight'],
  },
  {
    id: 'daily-daijoubu',
    label: 'だいじょうぶ？',
    phrase: 'だいじょうぶ？',
    face: 'thinking',
    accent: '#6ba6cf',
    aliases: ['だいじょうぶ', '大丈夫', 'daijoubu', 'daijobu', 'ổnkhông', 'areyouok'],
    related: ['thinking', 'sorry', 'smile'],
  },
  {
    id: 'daily-wakatta',
    label: 'わかった！',
    phrase: 'わかった！',
    face: 'smile',
    accent: '#61b792',
    aliases: ['わかった', '了解', 'りょうかい', 'wakatta', 'ryoukai', 'okay', 'okk', 'okie', 'hiểurồi'],
    related: ['smile', 'wink', 'k-ok'],
  },
  {
    id: 'daily-yoroshiku',
    label: 'よろしくね',
    phrase: 'よろしくね',
    face: 'shy',
    accent: '#df86a3',
    aliases: ['よろしく', 'よろしくね', 'yoroshiku', 'monggiúpđỡ', 'nicetomeetyou'],
    related: ['shy', 'smile', 'love'],
  },
  {
    id: 'daily-omedetou',
    label: 'おめでとう!!',
    phrase: 'おめでとう!!',
    face: 'laugh',
    accent: '#e96483',
    aliases: ['おめでとう', 'omedetou', 'omedeto', 'congratulations', 'chúcmừng'],
    related: ['laugh', 'sparkle', 'love'],
  },
  {
    id: 'daily-matane',
    label: 'またね〜！',
    phrase: 'またね〜！',
    face: 'wink',
    accent: '#6cb9b3',
    aliases: ['またね', 'じゃあね', 'matane', 'jaane', 'seeyou', 'hẹngặp lại'],
    related: ['wink', 'music', 'smile'],
  },
  {
    id: 'daily-ohisashiburi',
    label: 'おひさしぶり！',
    phrase: 'おひさしぶり！',
    face: 'surprised',
    accent: '#e29a55',
    aliases: ['おひさしぶり', '久しぶり', 'ohisashiburi', 'lâurồikhônggặp', 'longtimenosee'],
    related: ['surprised', 'laugh', 'love'],
  },
]

const EXTRA_DAILY_SET = [
  { id: 'onegaishimasu', label: 'お願いします！', phrase: 'お願いします！', face: 'shy', accent: '#d878a0', aliases: ['お願いします', 'おねがい', 'onegaishimasu', 'please', 'làmơn'] },
  { id: 'itadakimasu', label: 'いただきます♪', phrase: 'いただきます♪', face: 'sparkle', accent: '#ef8c4d', aliases: ['いただきます', 'itadakimasu', 'mờiăn', 'letseat'] },
  { id: 'gochisousama', label: 'ごちそうさま！', phrase: 'ごちそうさま！', face: 'love', accent: '#d97755', aliases: ['ごちそうさま', 'gochisousama', 'ngonquá', 'thanksforthemeal'] },
  { id: 'kiwotsukete', label: '気をつけてね', phrase: '気をつけてね', face: 'thinking', accent: '#49a69a', aliases: ['気をつけて', 'きをつけて', 'kiwotsukete', 'cẩnthận', 'takecare'] },
  { id: 'chottomatte', label: 'ちょっと待って！', phrase: 'ちょっと待って！', face: 'surprised', accent: '#e66b62', aliases: ['ちょっと待って', 'まって', 'chottomatte', 'matte', 'đợichút', 'wait'] },
  { id: 'wakaranai', label: 'わからない…', phrase: 'わからない…', face: 'thinking', accent: '#7189bf', aliases: ['わからない', 'わかんない', 'wakaranai', 'khônghiểu', 'idontknow'] },
  { id: 'iiyo', label: 'いいよ〜！', phrase: 'いいよ〜！', face: 'wink', accent: '#52b58b', aliases: ['いいよ', 'iiyo', 'đượcchứ', 'sure', 'noproblem'] },
  { id: 'muri', label: 'むり〜〜！', phrase: 'むり〜〜！', face: 'cry', accent: '#8577c8', aliases: ['むり', '無理', 'muri', 'khôngnổ', 'impossible'] },
  { id: 'yatta', label: 'やったー!!', phrase: 'やったー!!', face: 'laugh', accent: '#ef6f78', aliases: ['やった', 'やったー', 'yatta', 'tuyệtvời', 'yay'] },
  { id: 'nani', label: 'なに!?', phrase: 'なに!?', face: 'surprised', accent: '#e29048', aliases: ['なに', '何', 'nani', 'gìcơ', 'what'] },
  { id: 'sugoi', label: 'すごーい！', phrase: 'すごーい！', face: 'sparkle', accent: '#d66ca3', aliases: ['すごい', 'sugoi', 'đỉnhquá', 'amazing'] },
  { id: 'tasukatta', label: '助かった〜！', phrase: '助かった〜！', face: 'love', accent: '#4ca69c', aliases: ['助かった', 'たすかった', 'tasukatta', 'cứutôi', 'lifesaver'] },
]

/** Sillier one-liners; these lean on the goofier moods (silly, dizzy, proud). */
const FUNNY_DAILY_SET = [
  { id: 'doya', label: 'ドヤァ…', phrase: 'ドヤァ…', face: 'proud', accent: '#d9873f', aliases: ['どや', 'ドヤ', 'doya', 'tựhào', 'smug'] },
  { id: 'pien', label: 'ぴえん…', phrase: 'ぴえん…', face: 'cry', accent: '#7f8ed0', aliases: ['ぴえん', 'pien', 'khócnhè', 'crying'] },
  { id: 'ukeru', label: 'うける〜！', phrase: 'うける〜！', face: 'laugh', accent: '#e8703f', aliases: ['うける', 'ukeru', 'wwww', 'lol', 'haha', 'buồncười'] },
  { id: 'yurushite', label: 'ゆるして…', phrase: 'ゆるして…', face: 'sorry', accent: '#6f8cc4', aliases: ['ゆるして', 'yurushite', 'thatha', 'forgiveme'] },
  { id: 'haraheta', label: 'はらへった', phrase: 'はらへった', face: 'silly', accent: '#e2913c', aliases: ['はらへった', 'おなかすいた', 'haraheta', 'onakasuita', 'đóibụng', 'hungry'] },
  { id: 'nemusugi', label: 'ねむすぎ…', phrase: 'ねむすぎ…', face: 'sleepy', accent: '#8b7fd0', aliases: ['ねむい', 'ねむすぎ', 'nemui', 'nemusugi', 'buồnngủ', 'sleepy'] },
  { id: 'majika', label: 'まじか…', phrase: 'まじか…', face: 'dizzy', accent: '#c9754f', aliases: ['まじか', 'まじ', 'majika', 'maji', 'thậtsao', 'seriously'] },
  { id: 'gorogoro', label: 'ゴロゴロ…', phrase: 'ゴロゴロ…', face: 'shy', accent: '#9a8cc8', aliases: ['ごろごろ', 'gorogoro', 'lănlộn', 'lazy'] },
  { id: 'tehepero', label: 'てへぺろ♪', phrase: 'てへぺろ♪', face: 'silly', accent: '#e57fa8', aliases: ['てへぺろ', 'tehepero', 'tehe', 'nghịchngợm'] },
  { id: 'mukii', label: 'むきー！！', phrase: 'むきー！！', face: 'angry', accent: '#e05b4e', aliases: ['むきー', 'mukii', 'おこ', 'giậnrồi', 'angry'] },
  { id: 'nadenade', label: 'なでなで', phrase: 'なでなで', face: 'love', accent: '#e07fa0', aliases: ['なでなで', 'nadenade', 'xoađầu', 'headpat'] },
  { id: 'wasureta', label: 'わすれた！', phrase: 'わすれた！', face: 'surprised', accent: '#cf8a4a', aliases: ['わすれた', '忘れた', 'wasureta', 'quênmất', 'iforgot'] },
]

/** Embarrassed / bashful one-liners — tereru, hazukashii, and friends. */
const SHY_DAILY_SET = [
  {
    id: 'tereruyo',
    label: 'てれるよ♡',
    phrase: 'てれるよ♡',
    face: 'tereru',
    pose: 'hug',
    typeStyle: 'soft',
    accent: '#e88aaa',
    aliases: ['てれるよ', 'てれる', '照れる', 'tereruyo', 'tereru', 'ngạiquá', 'embarrassed'],
    related: ['shy', 'tereru', 'hazukashii', 'mojimoji', 'k-shy', 'k-bashful'],
  },
  {
    id: 'hazukashii',
    label: 'はずかしいっ',
    phrase: 'はずかしいっ',
    face: 'hazukashii',
    pose: 'hug',
    typeStyle: 'hand',
    accent: '#df7fa0',
    aliases: ['はずかしい', '恥ずかしい', 'hazukashii', 'hazukashi', 'xấuhổ', 'ngạingùng', 'shy'],
    related: ['hazukashii', 'shy', 'tereru', 'mojimoji', 'k-bashful', 'k-shy'],
  },
  {
    id: 'mojimoji',
    label: 'もじもじ♪',
    phrase: 'もじもじ♪',
    face: 'mojimoji',
    pose: 'dance',
    typeStyle: 'round',
    accent: '#d890b0',
    aliases: ['もじもじ', 'mojimoji', 'ngượngngùng', 'fidgeting'],
    related: ['mojimoji', 'shy', 'tereru', 'hazukashii', 'k-mojimoji'],
  },
  {
    id: 'terechau',
    label: '照れちゃう♡',
    phrase: '照れちゃう♡',
    face: 'tereru',
    pose: 'wave',
    typeStyle: 'soft',
    accent: '#eb7ca4',
    aliases: ['照れちゃう', 'てれちゃう', 'terechau', 'ngạiquáđi'],
    related: ['tereru', 'love', 'shy', 'hazukashii'],
  },
  {
    id: 'ehehe',
    label: 'えへへ♪',
    phrase: 'えへへ♪',
    face: 'shy',
    pose: 'jump',
    typeStyle: 'hand',
    accent: '#e9a0b4',
    aliases: ['えへへ', 'ehehe', 'hehe', 'cườingại'],
    related: ['shy', 'silly', 'tereru', 'love'],
  },
  {
    id: 'mitedenaide',
    label: 'みないで…',
    phrase: 'みないで…',
    face: 'hazukashii',
    pose: 'peek',
    typeStyle: 'bold',
    accent: '#c98bb8',
    aliases: ['みないで', '見ないで', 'mitedenaide', 'minaidenaide', 'đừngnhìn'],
    related: ['hazukashii', 'mojimoji', 'shy', 'k-bashful'],
  },
]

const DAILY_FONTS = ['round', 'hand', 'bold', 'soft']
const HUMAN_POSES = ['wave', 'big', 'side', 'bow', 'jump', 'sleep', 'hug', 'run', 'eat', 'point', 'shrug', 'peek']
const ANIMAL_POSES = ['wave', 'big', 'banzai', 'dance', 'roll', 'dogeza', 'sleep', 'hug', 'run', 'eat', 'point', 'flop', 'peek', 'side', 'sit']

/** Every phrase, character-agnostic. `face` is a mood name resolved per character. */
const MAINICHI_BASE = [...DAILY_SET, ...EXTRA_DAILY_SET, ...FUNNY_DAILY_SET, ...SHY_DAILY_SET].map((item) => ({
  ...item,
  baseId: item.id.replace(/^daily-/, ''),
  related: item.related || [],
}))

/**
 * Characters that share the phrase list. `prefix` is baked into sticker ids, so
 * はな and かいと keep their original ids and previously sent stamps still render.
 * Pose/font shifts make each set feel drawn on its own instead of recolored.
 */
const MAINICHI_CHARACTERS = [
  { key: 'hana', prefix: 'daily', tabId: 'daily', tabLabel: 'はな毎日', poses: HUMAN_POSES, poseShift: 0, fontShift: 0 },
  { key: 'kaito', prefix: 'k-daily', tabId: 'daily-kaito', tabLabel: 'かいと毎日', poses: HUMAN_POSES, poseShift: 4, fontShift: 2 },
  { key: 'inu', prefix: 'inu', tabId: 'daily-inu', tabLabel: 'いぬ毎日', poses: ANIMAL_POSES, poseShift: 0, fontShift: 1 },
  { key: 'neko', prefix: 'neko', tabId: 'daily-neko', tabLabel: 'ねこ毎日', poses: ANIMAL_POSES, poseShift: 5, fontShift: 3 },
  { key: 'kuma', prefix: 'kuma', tabId: 'daily-kuma', tabLabel: 'くま毎日', poses: ANIMAL_POSES, poseShift: 9, fontShift: 2 },
  { key: 'usagi', prefix: 'usagi', tabId: 'daily-usagi', tabLabel: 'うさぎ毎日', poses: ANIMAL_POSES, poseShift: 12, fontShift: 0 },
]

const MAINICHI_SETS = MAINICHI_CHARACTERS.map((character) => ({
  ...character,
  setId: `daily-${character.key}`,
  items: MAINICHI_BASE.map((item, index) => ({
    ...item,
    id: `${character.prefix}-${item.baseId}`,
    set: `daily-${character.key}`,
    character: character.key,
    mood: item.face,
    pose: item.pose || character.poses[(index + character.poseShift) % character.poses.length],
    typeStyle: item.typeStyle || DAILY_FONTS[(index + character.fontShift) % DAILY_FONTS.length],
  })),
}))

/** baseId → the same phrase drawn by every character, in picker order. */
const MAINICHI_VARIANTS = Object.fromEntries(MAINICHI_BASE.map((item) => [
  item.baseId,
  MAINICHI_CHARACTERS.map((character) => `${character.prefix}-${item.baseId}`),
]))

/** Picker groups. Face sets first, then daily/mainichi character packs. */
export const HANA_STICKER_SETS = [
  { id: 'hana', label: 'はな', items: HANA_SET.map((item) => ({ ...item, set: 'hana' })) },
  { id: 'hana-live', label: 'はな♡', items: HANA_LIVE_SET.map((item) => ({ ...item, set: 'hana-live' })) },
  { id: 'kaito', label: 'かいと', items: KAITO_SET.map((item) => ({ ...item, set: 'kaito' })) },
  { id: 'kaito-live', label: 'かいと♡', items: KAITO_LIVE_SET.map((item) => ({ ...item, set: 'kaito-live' })) },
  { id: 'tomo', label: 'ともだち', items: TOMO_SET.map((item) => ({ ...item, set: 'tomo' })) },
  ...MAINICHI_SETS.map((set) => ({ id: set.tabId, label: set.tabLabel, items: set.items })),
]

/**
 * Hana (owner / feminine) does not need Kaito packs; male guests do not need Hana packs.
 * Animal daily packs and ともだち stay for everyone.
 * @param {{ feminine?: boolean }} [opts]
 */
export function stickerSetsForViewer({ feminine = false } = {}) {
  return HANA_STICKER_SETS.filter((set) => {
    if (feminine) return set.id !== 'kaito' && set.id !== 'daily-kaito' && set.id !== 'kaito-live'
    return set.id !== 'hana' && set.id !== 'daily' && set.id !== 'hana-live'
  })
}

function stickerAllowedForViewer(sticker, { feminine = false } = {}) {
  if (!sticker) return false
  const setId = String(sticker.set || '')
  const character = String(sticker.character || '')
  if (feminine) {
    return !(setId === 'kaito' || setId === 'daily-kaito' || setId === 'kaito-live' || character === 'kaito')
  }
  return !(setId === 'hana' || setId === 'daily' || setId === 'daily-hana' || setId === 'hana-live' || character === 'hana')
}

/** Every sticker across both sets. `label` doubles as the message text fallback. */
export const HANA_STICKERS = HANA_STICKER_SETS.flatMap((set) => set.items)

const STICKER_BY_ID = Object.fromEntries(HANA_STICKERS.map((item) => [item.id, item]))

export function isHanaSticker(id) {
  return Boolean(STICKER_BY_ID[String(id || '')])
}

const FACE_BURST = {
  love: 'hearts',
  sparkle: 'sparkle',
  'k-shy': 'hearts',
}

/** Overlay to play when this stamp is sent (both sides). */
export function stickerBurst(id) {
  const sticker = STICKER_BY_ID[String(id || '')]
  const burst = sticker?.burst || FACE_BURST[String(id || '')]
  if (burst === 'kiss') return { kind: 'moment', momentId: 'kiss' }
  if (burst === 'hearts') return { kind: 'moment', momentId: 'hearts' }
  if (burst === 'sparkle') return { kind: 'moment', momentId: 'sparkle' }
  return null
}

export function hanaStickerLabel(id) {
  return STICKER_BY_ID[String(id || '')]?.label || ''
}

function normalizeStickerQuery(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[!！?？。、,.〜~♡♥❤'’"“”\s_-]+/g, '')
}

/**
 * LINE-style contextual sticker suggestions from Japanese, romaji, English or
 * Vietnamese composer text. A match offers the same phrase drawn by every
 * character (はな, かいと, いぬ, ねこ, くま, うさぎ) before related expressions,
 * so the row reads like a real choice of stamps.
 *
 * Only fires for short single-token drafts (stamp search). Once the user keeps
 * typing a longer message or hits newline, suggestions hide.
 */
export function suggestHanaStickers(value, limit = 8, { feminine = false } = {}) {
  const raw = String(value || '')
  // Newline / multi-line = composing a message, not searching stamps.
  if (/[\r\n]/.test(raw)) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  // Past a short keyword length = no longer stamp-search intent.
  if (trimmed.length > 14) return []

  const query = normalizeStickerQuery(value)
  if (query.length < 2 || query.length > 18) return []

  const matched = MAINICHI_BASE
    .map((item) => {
      const aliases = item.aliases.map(normalizeStickerQuery)
      const score = aliases.reduce((best, alias) => {
        if (!alias || alias.length < 3) return best
        if (query === alias) return Math.max(best, 4)
        if (query.startsWith(alias) || alias.startsWith(query)) {
          if (Math.abs(query.length - alias.length) <= 2) return Math.max(best, 3)
          if (alias.startsWith(query) && query.length >= 2) return Math.max(best, 1)
          return best
        }
        return best
      }, 0)
      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const tomoHits = TOMO_SET
    .map((item) => {
      const aliases = (item.aliases || [item.label]).map(normalizeStickerQuery)
      const score = aliases.reduce((best, alias) => {
        if (!alias || alias.length < 2) return best
        if (query === alias) return Math.max(best, 4)
        if (alias.startsWith(query) && query.length >= 2) return Math.max(best, 2)
        if (query.startsWith(alias) && alias.length >= 3) return Math.max(best, 3)
        return best
      }, 0)
      return { id: item.id, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id)

  if (!matched.length && !tomoHits.length) return []
  const ids = []
  matched.forEach(({ item }) => {
    ids.push(...(MAINICHI_VARIANTS[item.baseId] || []))
  })
  ids.push(...tomoHits)
  matched.forEach(({ item }) => {
    const related = item.related || []
    if (feminine) {
      ids.push(...related)
      return
    }
    // Male guests: map はな mood ids (smile) to かいと face ids (k-smile).
    related.forEach((id) => {
      const key = String(id || '')
      if (!key) return
      if (STICKER_BY_ID[`k-${key}`]) ids.push(`k-${key}`)
      else if (STICKER_BY_ID[key]?.set === 'kaito') ids.push(key)
    })
  })
  return [...new Set(ids)]
    .map((id) => STICKER_BY_ID[id])
    .filter((sticker) => stickerAllowedForViewer(sticker, { feminine }))
    .slice(0, Math.max(1, limit))
}

/** Hair, face and the signature petal — shared by every はな expression. */
function HanaHead() {
  return (
    <>
      <circle cx="60" cy="58" r="32" fill={SKIN} />
      <path d="M28 58c2-28 18-42 32-42s30 14 32 42c-4-10-12-16-32-16S32 48 28 58z" fill={HAIR} />
      <path d="M32 48c8-18 20-24 28-24 8 0 20 6 28 24-10-8-18-10-28-10s-18 2-28 10z" fill={HAIR} />
      <path d="M44 34c4 8 8 12 10 18 2-8 4-14 8-20-6-2-12-2-18 2z" fill={INK} />
      <path d="M86 36c6-2 12 2 10 8-6 2-12-2-10-8z" fill={PETAL} />
      <circle cx="88" cy="34" r="3.5" fill={PETAL_LIGHT} />
    </>
  )
}

function Cheeks({ r = 6, opacity = 0.5 }) {
  return (
    <>
      <circle cx="40" cy="66" r={r} fill={BLUSH} opacity={opacity} />
      <circle cx="80" cy="66" r={r} fill={BLUSH} opacity={opacity} />
    </>
  )
}

/** Default round eyes with a catch-light. */
function OpenEyes({ rx = 4.2, ry = 5 }) {
  return (
    <>
      <ellipse cx="48" cy="58" rx={rx} ry={ry} fill={INK} />
      <ellipse cx="72" cy="58" rx={rx} ry={ry} fill={INK} />
      <circle cx="49.5" cy="56.2" r="1.3" fill="#fff" />
      <circle cx="73.5" cy="56.2" r="1.3" fill="#fff" />
    </>
  )
}

/** Smiling (closed, arched up) eyes. */
function HappyEyes() {
  return (
    <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
      <path d="M43 59c2-5 8-5 10 0" />
      <path d="M67 59c2-5 8-5 10 0" />
    </g>
  )
}

/** Gently closed (arched down) eyes. */
function CalmEyes() {
  return (
    <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
      <path d="M43 57c2 5 8 5 10 0" />
      <path d="M67 57c2 5 8 5 10 0" />
    </g>
  )
}

function Smile() {
  return <path d="M54 70c2 4 10 4 12 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
}

function OpenMouth() {
  return <path d="M52 67c2 8 14 8 16 0-4 2-12 2-16 0z" fill={MOUTH} />
}

function Sparkle({ x, y, s = 1, fill = GOLD, opacity = 1, className }) {
  return (
    <path
      className={className}
      d="M0-6c1 3.4 1.6 4 5 5-3.4 1-4 1.6-5 5-1-3.4-1.6-4-5-5 3.4-1 4-1.6 5-5z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
      opacity={opacity}
    />
  )
}

function Note({ x, y, s = 1, rotate = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`} fill={PETAL}>
      <ellipse cx="-2.6" cy="4.4" rx="3.4" ry="2.6" transform="rotate(-20 -2.6 4.4)" />
      <path d="M0.4 4.4V-6l6 2v2.6l-4.4-1.6v7.4z" />
    </g>
  )
}

function Drop({ x, y, s = 1, fill = TEAR }) {
  return (
    <path
      d="M0-6c2.6 4 4.4 6 4.4 8.4C4.4 5 2.4 6.6 0 6.6S-4.4 5-4.4 2.4C-4.4 0-2.6-2 0-6z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
      opacity="0.88"
    />
  )
}

function HeartShape({ x, y, s = 1, fill = HEART }) {
  return (
    <path
      d="M0 6c-4.6-4-7.4-6.6-7.4-9.6 0-2.4 1.9-4 4-4 1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2 2.1 0 4 1.6 4 4C7.4-.6 4.6 2 0 6z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
    />
  )
}

const FACES = {
  smile: () => (
    <>
      <OpenEyes />
      <Cheeks />
      <Smile />
    </>
  ),

  laugh: () => (
    <>
      <HappyEyes />
      <Cheeks r="7" opacity="0.6" />
      <OpenMouth />
      <Sparkle x={32} y={40} s={0.8} opacity={0.85} />
      <Sparkle x={90} y={54} s={0.7} opacity={0.75} />
    </>
  ),

  love: () => (
    <>
      <HeartShape x={48} y={57} s={0.95} />
      <HeartShape x={72} y={57} s={0.95} />
      <Cheeks r="7" opacity="0.62" />
      <Smile />
      <HeartShape x={31} y={38} s={0.7} fill={PETAL} />
      <HeartShape x={91} y={48} s={0.55} fill={PETAL} />
    </>
  ),

  shy: () => (
    <>
      <HappyEyes />
      <Cheeks r="8.8" opacity="0.78" />
      <g stroke={BLUSH} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        <path d="M35 64h10" />
        <path d="M35 68h10" />
        <path d="M75 64h10" />
        <path d="M75 68h10" />
      </g>
      <path d="M54 69c2 5 10 5 12 0-3 1.6-9 1.6-12 0z" fill={MOUTH} opacity="0.92" />
      <Sparkle x={90} y={44} s={0.65} fill={PETAL} />
    </>
  ),

  /** Happy blush when praised — “てれるよ”. */
  tereru: () => (
    <>
      <HappyEyes />
      <Cheeks r="9.8" opacity="0.82" />
      <g stroke={BLUSH} strokeWidth="1.5" strokeLinecap="round" opacity="0.95">
        <path d="M33 63h12" />
        <path d="M33 67h12" />
        <path d="M33 71h10" />
        <path d="M75 63h12" />
        <path d="M75 67h12" />
        <path d="M77 71h10" />
      </g>
      <path d="M53 68c2.2 6.4 11.6 6.4 14 0-3.6 2-10.4 2-14 0z" fill={MOUTH} />
      <HeartShape x={30} y={40} s={0.55} fill={PETAL} />
      <HeartShape x={91} y={46} s={0.62} fill={HEART} />
      <Sparkle x={88} y={34} s={0.55} />
    </>
  ),

  /** Cute cover-face after a compliment — “はずかしい”. */
  hazukashii: () => (
    <>
      <HappyEyes />
      <Cheeks r="10" opacity="0.88" />
      <g stroke={BLUSH} strokeWidth="1.6" strokeLinecap="round" opacity="0.95">
        <path d="M32 62h13" />
        <path d="M32 66h13" />
        <path d="M32 70h11" />
        <path d="M75 62h13" />
        <path d="M75 66h13" />
        <path d="M77 70h11" />
      </g>
      <path d="M54 69c2 4.8 10 4.8 12 0-3 1.5-9 1.5-12 0z" fill={MOUTH} opacity="0.94" />
      <g fill={SKIN} stroke={INK} strokeWidth="1.4" strokeLinejoin="round">
        <path d="M34 78c2-8 8-12 14-10l2 8c-6 2-12 4-16 2z" />
        <path d="M86 78c-2-8-8-12-14-10l-2 8c6 2 12 4 16 2z" />
      </g>
      <HeartShape x={92} y={42} s={0.58} fill={PETAL} />
      <Sparkle x={28} y={42} s={0.55} />
    </>
  ),

  /** Bashful wink fidget — “もじもじ”. */
  mojimoji: () => (
    <>
      <ellipse cx="48" cy="58" rx="4" ry="4.6" fill={INK} />
      <path d="M67 59c2-5 8-5 10 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle cx="49.4" cy="56.4" r="1.2" fill="#fff" />
      <Cheeks r="9.2" opacity="0.8" />
      <g stroke={BLUSH} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        <path d="M34 65h11" />
        <path d="M34 69h11" />
        <path d="M75 65h11" />
        <path d="M75 69h11" />
      </g>
      <path d="M54 69c1.8 5 10 5 12 0-3 1.6-9 1.6-12 0z" fill={MOUTH} opacity="0.9" />
      <g fill="none" stroke={PETAL} strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <path d="M28 78c4 2 8 1 10-2" />
        <path d="M92 76c-4 3-8 3-11 0" />
      </g>
      <Sparkle x={90} y={40} s={0.6} fill={PETAL} />
    </>
  ),

  wink: () => (
    <>
      <ellipse cx="48" cy="58" rx="4.2" ry="5" fill={INK} />
      <circle cx="49.5" cy="56.2" r="1.3" fill="#fff" />
      <path d="M67 59c2-5 8-5 10 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <Cheeks r="6.6" opacity="0.58" />
      <Smile />
      <Sparkle x={88} y={50} s={0.85} />
    </>
  ),

  music: () => (
    <>
      <HappyEyes />
      <Cheeks r="6.6" opacity="0.55" />
      <path d="M55 68c1.6 5 8 5 10 0-2.6 1.6-7.4 1.6-10 0z" fill={MOUTH} />
      <Note x={30} y={42} s={1} rotate={-12} />
      <Note x={91} y={52} s={0.85} rotate={14} />
    </>
  ),

  sparkle: () => (
    <>
      <OpenEyes rx="4.6" ry="5.4" />
      <circle cx="46.6" cy="60.4" r="1.5" fill="#fff" opacity="0.9" />
      <circle cx="70.6" cy="60.4" r="1.5" fill="#fff" opacity="0.9" />
      <Cheeks r="6.6" opacity="0.55" />
      <Smile />
      <Sparkle x={30} y={38} s={1.05} />
      <Sparkle x={92} y={46} s={0.8} />
      <Sparkle x={36} y={82} s={0.65} opacity={0.8} />
      <Sparkle x={86} y={80} s={0.55} opacity={0.7} />
    </>
  ),

  surprised: () => (
    <>
      <g stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M42 48c2.6-2.6 8-2.6 10.6 0" />
        <path d="M67.4 48c2.6-2.6 8-2.6 10.6 0" />
      </g>
      <circle cx="48" cy="59" r="5.6" fill={INK} />
      <circle cx="72" cy="59" r="5.6" fill={INK} />
      <circle cx="49.8" cy="57" r="2" fill="#fff" />
      <circle cx="73.8" cy="57" r="2" fill="#fff" />
      <ellipse cx="60" cy="72" rx="3.6" ry="4.2" fill={MOUTH} />
      <g stroke={GOLD} strokeWidth="2.2" strokeLinecap="round">
        <path d="M30 40l-3-4" />
        <path d="M92 48l3.4-3.6" />
      </g>
    </>
  ),

  thinking: () => (
    <>
      <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M43 58h10" />
      </g>
      <ellipse cx="72" cy="58" rx="4" ry="4.6" fill={INK} />
      <circle cx="73.4" cy="56.4" r="1.2" fill="#fff" />
      <Cheeks r="5.4" opacity="0.42" />
      <path d="M55 71c1.8 2.4 3.4-2.4 5.2 0s3.2 2.2 4.8 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
      <g stroke={PETAL} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M85 32c0-3 2.4-5 5.2-5s5 2 5 4.6c0 2.4-1.8 3.2-3.4 4.2-1.2.8-1.8 1.6-1.8 3" />
      </g>
      <circle cx="90.2" cy="42.4" r="1.8" fill={PETAL} />
    </>
  ),

  sleepy: () => (
    <>
      <CalmEyes />
      <Cheeks r="6" opacity="0.42" />
      <ellipse cx="60" cy="71" rx="3" ry="3.6" fill={MOUTH} opacity="0.85" />
      <g stroke={PETAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M84 40h7l-7 7h7" />
        <path d="M92 26h5l-5 5h5" />
      </g>
    </>
  ),

  cry: () => (
    <>
      <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M43 56c2 6 8 6 10 0" />
        <path d="M67 56c2 6 8 6 10 0" />
      </g>
      <Cheeks r="6.6" opacity="0.6" />
      <path d="M55 73c1.8-3.4 8.4-3.4 10 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
      <Drop x={45} y={70} s={0.9} />
      <Drop x={75} y={72} s={0.75} />
    </>
  ),

  sorry: () => (
    <>
      <CalmEyes />
      <Cheeks r="6" opacity="0.5" />
      <path d="M55 71h10" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
      <Drop x={86} y={48} s={0.85} />
      <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M42 48c2.4-2 7.2-2 9.6 0" />
        <path d="M68.4 48c2.4-2 7.2-2 9.6 0" />
      </g>
    </>
  ),

  angry: () => (
    <>
      <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M42 47l10 4" />
        <path d="M78 47l-10 4" />
      </g>
      <ellipse cx="48" cy="59" rx="4" ry="4.6" fill={INK} />
      <ellipse cx="72" cy="59" rx="4" ry="4.6" fill={INK} />
      <Cheeks r="7" opacity="0.68" />
      <path d="M55 72c1.8-3 8.4-3 10 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
      <g stroke={MOUTH} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M30 44c-2-2-2-5 0-7" />
        <path d="M34 40c-2-1.6-2-4 0-5.6" />
      </g>
    </>
  ),

  silly: () => (
    <>
      <ellipse cx="48" cy="58" rx="4.2" ry="5" fill={INK} />
      <circle cx="49.5" cy="56.2" r="1.3" fill="#fff" />
      <path d="M67 59c2-5 8-5 10 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <Cheeks r="7.5" opacity="0.62" />
      <path d="M54 68c3 7 14 7 16 0-4 3-12 3-16 0z" fill={MOUTH} />
      <path d="M70 74c2 4 0 7-3 8" stroke={LIP} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <Sparkle x={90} y={46} s={0.7} />
    </>
  ),

  proud: () => (
    <>
      <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M42 49l10 3" />
        <path d="M78 49l-10 3" />
      </g>
      <ellipse cx="48" cy="59" rx="3.8" ry="3.2" fill={INK} />
      <ellipse cx="72" cy="59" rx="3.8" ry="3.2" fill={INK} />
      <circle cx="49.4" cy="57.6" r="1.1" fill="#fff" />
      <circle cx="73.4" cy="57.6" r="1.1" fill="#fff" />
      <Cheeks r="5.5" opacity="0.4" />
      <path d="M54 70c4 5 12 2 14-3" stroke={LIP} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <Sparkle x={91} y={40} s={0.85} />
    </>
  ),

  dizzy: () => (
    <>
      <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M44 56c2-4 8-4 10 0s-2 5-5 5-5-1-5-5z" />
        <path d="M66 56c2-4 8-4 10 0s-2 5-5 5-5-1-5-5z" />
      </g>
      <Cheeks r="6.5" opacity="0.5" />
      <ellipse cx="60" cy="72" rx="4" ry="4.6" fill={MOUTH} />
      <g stroke={GOLD} strokeWidth="2" strokeLinecap="round">
        <path d="M28 42l4-5" />
        <path d="M90 40l5-4" />
        <path d="M32 80l-4 4" />
      </g>
    </>
  ),
}

/* ---------------------------------------------------------------- かいと --- */

/** Squarer jaw, short spiky hair and the signature headphones. */
function KaitoHead() {
  return (
    <>
      <path d="M31 54c0-17 13-28 29-28s29 11 29 28c0 8-1 15-4 21-4 9-14 15-25 15s-21-6-25-15c-3-6-4-13-4-21z" fill={SKIN_M} />
      <path d="M27 54c0-20 14-34 33-34s33 14 33 34c-2-9-6-14-11-18l-4 5-5-6-5 6-5-6-5 6-5-6-4 5c-7 0-13 4-22 14z" fill={HAIR_M} />
      <path d="M49 23l3-8 5 7z" fill={HAIR_M} />
      <path d="M63 22l5-7 3 8z" fill={HAIR_M} />
      <path d="M38 40c4-9 11-15 19-15-8 5-13 9-15 17z" fill={HAIR_M_HI} opacity="0.55" />
      <path d="M28 60a32 32 0 0 1 64 0" fill="none" stroke={GEAR_HI} strokeWidth="4.6" strokeLinecap="round" />
      <rect x="22" y="54" width="12" height="18" rx="6" fill={GEAR} />
      <rect x="86" y="54" width="12" height="18" rx="6" fill={GEAR} />
      <rect x="25.5" y="58" width="5" height="10" rx="2.5" fill={STEEL} opacity="0.9" />
      <rect x="89.5" y="58" width="5" height="10" rx="2.5" fill={STEEL} opacity="0.9" />
    </>
  )
}

/** Thicker, straighter brows carry most of かいと's expression. */
function Brows({ variant = 'flat' }) {
  const shapes = {
    flat: ['M41 49.5h12', 'M67 49.5h12'],
    raised: ['M41 47.5c3-3 9-3 12 0', 'M67 47.5c3-3 9-3 12 0'],
    angry: ['M41 46l12 5', 'M79 46l-12 5'],
    sad: ['M41 51.5l12-4', 'M79 51.5l-12-4'],
    one: ['M41 46.5l12 3', 'M67 50.5h12'],
  }
  const [left, right] = shapes[variant] || shapes.flat
  return (
    <g stroke={INK} strokeWidth="2.9" strokeLinecap="round" fill="none">
      <path d={left} />
      <path d={right} />
    </g>
  )
}

function EyesM({ rx = 3.6, ry = 4.5, cy = 58.5 }) {
  return (
    <>
      <ellipse cx="48" cy={cy} rx={rx} ry={ry} fill={INK} />
      <ellipse cx="72" cy={cy} rx={rx} ry={ry} fill={INK} />
      <circle cx="49.3" cy={cy - 1.8} r="1.15" fill="#fff" />
      <circle cx="73.3" cy={cy - 1.8} r="1.15" fill="#fff" />
    </>
  )
}

/** Closed, arched-up (laughing) eyes. */
function HappyEyesM() {
  return (
    <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M43 59.5c2.4-5 8.6-5 11 0" />
      <path d="M67 59.5c2.4-5 8.6-5 11 0" />
    </g>
  )
}

/** Closed, arched-down (resting) eyes. */
function CalmEyesM() {
  return (
    <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M43 57c2.4 5 8.6 5 11 0" />
      <path d="M67 57c2.4 5 8.6 5 11 0" />
    </g>
  )
}

function SmileM() {
  return <path d="M52 69c3.4 5 12.6 5 16 0" stroke={LIP_M} strokeWidth="2.2" strokeLinecap="round" fill="none" />
}

function SmirkM() {
  return <path d="M51.5 69.5c4 4.6 12 3 16-2.5" stroke={LIP_M} strokeWidth="2.2" strokeLinecap="round" fill="none" />
}

function FrownM() {
  return <path d="M52 72c3.4-4.6 12.6-4.6 16 0" stroke={LIP_M} strokeWidth="2.2" strokeLinecap="round" fill="none" />
}

function OpenMouthM() {
  return <path d="M50 66c3 9.6 17 9.6 20 0-5.4 2.2-14.6 2.2-20 0z" fill={MOUTH_M} />
}

function Shades() {
  return (
    <>
      <path d="M37 52h20l-1.6 9.6c-.4 2-1.8 3.2-4 3.2h-6.4c-2.8 0-5-1.6-5.6-4.2z" fill={GEAR_DARK} />
      <path d="M83 52H63l1.6 9.6c.4 2 1.8 3.2 4 3.2h6.4c2.8 0 5-1.6 5.6-4.2z" fill={GEAR_DARK} />
      <path d="M56 54h8v2.8h-8z" fill={GEAR_DARK} />
      <path d="M41.5 55l5 7" stroke={STEEL_LIGHT} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <path d="M67.5 55l5 7" stroke={STEEL_LIGHT} strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
    </>
  )
}

function ThumbUp({ x, y, s = 1 }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      stroke={INK}
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M-8-1h5.4v11.4H-8A2.6 2.6 0 0 1-10.6 7.8V1.6A2.6 2.6 0 0 1-8-1z" fill={SKIN_M} />
      <path d="M-2.6-1.4c.8-1.8 1.6-3.6 2-5.6.4-2 3.2-1.8 3.4.4.1 1.4-.2 2.8-.6 4.2h4.4c2 0 3.4 1.9 2.8 3.8l-1.8 5.8a3.2 3.2 0 0 1-3 2.2h-7.2z" fill={SKIN_M} />
    </g>
  )
}

function Flame({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0-10c4 5 6 8 6 12 0 4-2.8 6.6-6 6.6S-6 6-6 2c0-4 2-7 6-12z" fill={FLAME} />
      <path d="M0-3c2 2.6 3 4.2 3 6 0 2.2-1.4 3.4-3 3.4s-3-1.2-3-3.4c0-1.8 1-3.4 3-6z" fill={GOLD} />
    </g>
  )
}

function Steam({ x, y, s = 1 }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      stroke={MOUTH_M}
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
      opacity="0.85"
    >
      <path d="M0 0c-2-2-2-5 0-7" />
      <path d="M4.4-4c-2-1.6-2-4 0-5.6" />
    </g>
  )
}

const KAITO_FACES = {
  'k-smile': () => (
    <>
      <Brows />
      <EyesM />
      <SmileM />
    </>
  ),

  'k-grin': () => (
    <>
      <Brows variant="one" />
      <EyesM />
      <SmirkM />
      <Sparkle x={89} y={46} s={0.75} fill={STEEL_LIGHT} />
    </>
  ),

  'k-laugh': () => (
    <>
      <Brows variant="raised" />
      <HappyEyesM />
      <OpenMouthM />
      <Sparkle x={31} y={42} s={0.85} fill={STEEL_LIGHT} />
      <Sparkle x={91} y={50} s={0.7} fill={STEEL_LIGHT} opacity={0.8} />
    </>
  ),

  'k-cool': () => (
    <>
      <Brows variant="one" />
      <Shades />
      <SmirkM />
      <Sparkle x={90} y={42} s={1} fill={STEEL_LIGHT} />
      <Sparkle x={32} y={80} s={0.6} fill={STEEL_LIGHT} opacity={0.8} />
    </>
  ),

  'k-wink': () => (
    <>
      <Brows variant="one" />
      <ellipse cx="48" cy="58.5" rx="3.6" ry="4.5" fill={INK} />
      <circle cx="49.3" cy="56.7" r="1.15" fill="#fff" />
      <path d="M67 59.5c2.4-5 8.6-5 11 0" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <SmileM />
      <Sparkle x={89} y={48} s={0.85} fill={STEEL_LIGHT} />
    </>
  ),

  'k-good': () => (
    <>
      <Brows variant="raised" />
      <HappyEyesM />
      <SmileM />
      <ThumbUp x={32} y={79} s={1.15} />
      <Sparkle x={90} y={46} s={0.7} fill={STEEL_LIGHT} opacity={0.85} />
    </>
  ),

  'k-fight': () => (
    <>
      <Brows variant="angry" />
      <EyesM rx={3.8} ry={4.2} cy={59} />
      <OpenMouthM />
      <Flame x={90} y={38} s={0.95} />
      <Flame x={31} y={44} s={0.7} />
    </>
  ),

  'k-ok': () => (
    <>
      <Brows variant="raised" />
      <EyesM />
      <SmileM />
      <circle cx="90" cy="36" r="7.5" fill="none" stroke={STEEL} strokeWidth="3.4" />
    </>
  ),

  'k-think': () => (
    <>
      <Brows variant="one" />
      <path d="M43 58.5h10" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <ellipse cx="72" cy="58.5" rx="3.4" ry="4.2" fill={INK} />
      <circle cx="73.2" cy="56.9" r="1.1" fill="#fff" />
      <path d="M53 70.5h10" stroke={LIP_M} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <g fill={STEEL} opacity="0.85">
        <circle cx="85" cy="47" r="1.9" />
        <circle cx="90" cy="39" r="2.5" />
        <circle cx="94.5" cy="30" r="3.1" />
      </g>
    </>
  ),

  'k-surprised': () => (
    <>
      <Brows variant="raised" />
      <circle cx="48" cy="59" r="5.4" fill={INK} />
      <circle cx="72" cy="59" r="5.4" fill={INK} />
      <circle cx="49.8" cy="57" r="1.9" fill="#fff" />
      <circle cx="73.8" cy="57" r="1.9" fill="#fff" />
      <ellipse cx="60" cy="72" rx="3.4" ry="4" fill={MOUTH_M} />
      <g stroke={STEEL} strokeWidth="2.2" strokeLinecap="round">
        <path d="M30 40l-3.4-4" />
        <path d="M92 46l3.6-3.6" />
      </g>
    </>
  ),

  'k-sleepy': () => (
    <>
      <Brows variant="sad" />
      <CalmEyesM />
      <ellipse cx="60" cy="71" rx="3" ry="3.6" fill={MOUTH_M} opacity="0.85" />
      <g stroke={STEEL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M84 40h7l-7 7h7" />
        <path d="M92 26h5l-5 5h5" />
      </g>
    </>
  ),

  'k-sad': () => (
    <>
      <Brows variant="sad" />
      <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M43 56.5c2.4 5.6 8.6 5.6 11 0" />
        <path d="M67 56.5c2.4 5.6 8.6 5.6 11 0" />
      </g>
      <FrownM />
      <g stroke={STEEL} strokeWidth="1.6" strokeLinecap="round" opacity="0.6">
        <path d="M35 64v6" />
        <path d="M39 66v5" />
        <path d="M81 64v6" />
        <path d="M85 66v5" />
      </g>
    </>
  ),

  'k-sorry': () => (
    <>
      <Brows variant="sad" />
      <CalmEyesM />
      <path d="M53 71h14" stroke={LIP_M} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="40" cy="66" r="5.4" fill={BLUSH_M} opacity="0.32" />
      <circle cx="80" cy="66" r="5.4" fill={BLUSH_M} opacity="0.32" />
      <Drop x={88} y={46} s={0.9} fill={STEEL_LIGHT} />
    </>
  ),

  'k-angry': () => (
    <>
      <Brows variant="angry" />
      <ellipse cx="48" cy="59.5" rx="3.6" ry="4" fill={INK} />
      <ellipse cx="72" cy="59.5" rx="3.6" ry="4" fill={INK} />
      <FrownM />
      <circle cx="40" cy="67" r="6" fill={BLUSH_M} opacity="0.42" />
      <circle cx="80" cy="67" r="6" fill={BLUSH_M} opacity="0.42" />
      <Steam x={31} y={44} s={1} />
      <Steam x={88} y={40} s={0.85} />
    </>
  ),

  'k-shy': () => (
    <>
      <Brows variant="raised" />
      <HappyEyesM />
      <circle cx="40" cy="66" r="7.5" fill={BLUSH_M} opacity="0.58" />
      <circle cx="80" cy="66" r="7.5" fill={BLUSH_M} opacity="0.58" />
      <g stroke={BLUSH_M} strokeWidth="1.5" strokeLinecap="round" opacity="0.9">
        <path d="M34 64h11" />
        <path d="M34 68h11" />
        <path d="M75 64h11" />
        <path d="M75 68h11" />
      </g>
      <OpenMouthM />
      <Sparkle x={90} y={42} s={0.7} fill={STEEL_LIGHT} />
    </>
  ),

  'k-bashful': () => (
    <>
      <Brows variant="raised" />
      <HappyEyesM />
      <circle cx="40" cy="66" r="8.2" fill={BLUSH_M} opacity="0.66" />
      <circle cx="80" cy="66" r="8.2" fill={BLUSH_M} opacity="0.66" />
      <g stroke={BLUSH_M} strokeWidth="1.6" strokeLinecap="round" opacity="0.95">
        <path d="M33 63h12" />
        <path d="M33 67h12" />
        <path d="M33 71h10" />
        <path d="M75 63h12" />
        <path d="M75 67h12" />
        <path d="M77 71h10" />
      </g>
      <path d="M51 68c2.4 6.2 15.6 6.2 18 0-4.4 2-13.6 2-18 0z" fill={MOUTH_M} />
      <g fill={SKIN_M} stroke={INK} strokeWidth="1.4" strokeLinejoin="round">
        <path d="M32 80c2-8 8-12 14-10l2 8c-6 2-12 4-16 2z" />
        <path d="M88 80c-2-8-8-12-14-10l-2 8c6 2 12 4 16 2z" />
      </g>
      <Sparkle x={28} y={42} s={0.55} fill={STEEL_LIGHT} />
    </>
  ),

  'k-mojimoji': () => (
    <>
      <Brows variant="raised" />
      <ellipse cx="48" cy="58.5" rx="3.4" ry="4.2" fill={INK} />
      <path d="M67 59.5c2.4-5 8.6-5 11 0" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="49.3" cy="56.9" r="1.1" fill="#fff" />
      <circle cx="40" cy="66" r="7" fill={BLUSH_M} opacity="0.55" />
      <circle cx="80" cy="66" r="7" fill={BLUSH_M} opacity="0.55" />
      <g stroke={BLUSH_M} strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M34 64h11" />
        <path d="M34 68h11" />
        <path d="M75 64h11" />
        <path d="M75 68h11" />
      </g>
      <SmileM />
      <g fill="none" stroke={STEEL} strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M28 78c4 2 8 1 10-2" />
        <path d="M92 76c-4 3-8 3-11 0" />
      </g>
      <Sparkle x={90} y={40} s={0.6} fill={STEEL_LIGHT} />
    </>
  ),

  'k-silly': () => (
    <>
      <Brows variant="one" />
      <ellipse cx="48" cy="58.5" rx="3.6" ry="4.5" fill={INK} />
      <circle cx="49.3" cy="56.7" r="1.15" fill="#fff" />
      <path d="M67 59.5c2.4-5 8.6-5 11 0" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <OpenMouthM />
      <path d="M72 76c2 4 0 7-3 8" stroke={LIP_M} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),

  'k-proud': () => (
    <>
      <Brows variant="one" />
      <EyesM ry={3.4} />
      <SmirkM />
      <Sparkle x={90} y={40} s={0.9} fill={STEEL_LIGHT} />
    </>
  ),

  'k-dizzy': () => (
    <>
      <Brows variant="raised" />
      <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M44 56.5c2-4 8-4 10 0s-2 5-5 5-5-1-5-5z" />
        <path d="M66 56.5c2-4 8-4 10 0s-2 5-5 5-5-1-5-5z" />
      </g>
      <ellipse cx="60" cy="72" rx="3.8" ry="4.2" fill={MOUTH_M} />
      <g stroke={STEEL} strokeWidth="2.2" strokeLinecap="round">
        <path d="M30 40l-3.4-4" />
        <path d="M92 46l3.6-3.6" />
      </g>
    </>
  ),
}

const ANIMAL_PALETTE = {
  inu: { fur: '#f0c48a', furDark: '#d39a55', ear: '#ef9a8a', nose: '#3a2420', shirt: '#7eb8ef', shirtHi: '#c8e2ff' },
  neko: { fur: '#f4b47a', furDark: '#d8894c', ear: '#f2a0b4', nose: '#e07a8a', shirt: '#ef9aaa', shirtHi: '#ffd0d9' },
  kuma: { fur: '#c79a6a', furDark: '#9a7147', ear: '#ef9a8a', nose: '#2a1814', shirt: '#8fbc8f', shirtHi: '#d6efd0' },
  usagi: { fur: '#f6e4d8', furDark: '#e0b9a8', ear: '#f2a0b4', nose: '#e07a8a', shirt: '#c9b4ef', shirtHi: '#ebe0ff' },
}

const MOOD_TO_HANA = {
  smile: 'smile', laugh: 'laugh', love: 'love', shy: 'shy', wink: 'wink',
  music: 'music', sparkle: 'sparkle', surprised: 'surprised', thinking: 'thinking',
  sleepy: 'sleepy', cry: 'cry', sorry: 'sorry', angry: 'angry',
  silly: 'silly', proud: 'proud', dizzy: 'dizzy',
  tereru: 'tereru', hazukashii: 'hazukashii', mojimoji: 'mojimoji',
}

const MOOD_TO_KAITO = {
  smile: 'k-smile', laugh: 'k-laugh', love: 'k-grin', shy: 'k-shy', wink: 'k-wink',
  music: 'k-good', sparkle: 'k-cool', surprised: 'k-surprised', thinking: 'k-think',
  sleepy: 'k-sleepy', cry: 'k-sad', sorry: 'k-sorry', angry: 'k-angry',
  silly: 'k-silly', proud: 'k-proud', dizzy: 'k-dizzy',
  tereru: 'k-shy', hazukashii: 'k-bashful', mojimoji: 'k-mojimoji',
}

function AnimalFace({ mood = 'smile', nose = '#3a2420' }) {
  const blush = (
    <>
      <circle cx="40" cy="66" r="6" fill={BLUSH} opacity="0.45" />
      <circle cx="80" cy="66" r="6" fill={BLUSH} opacity="0.45" />
    </>
  )
  if (mood === 'laugh' || mood === 'silly') {
    return (
      <>
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M43 59c2-5 8-5 10 0" />
          <path d="M67 59c2-5 8-5 10 0" />
        </g>
        {blush}
        <path d="M52 67c2 8 14 8 16 0-4 2-12 2-16 0z" fill={MOUTH} />
        {mood === 'silly' ? <path d="M70 74c2 4 0 7-3 8" stroke={LIP} strokeWidth="2.4" strokeLinecap="round" fill="none" /> : null}
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'cry' || mood === 'sorry') {
    return (
      <>
        <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M43 56c2 6 8 6 10 0" />
          <path d="M67 56c2 6 8 6 10 0" />
        </g>
        {blush}
        <path d="M55 73c1.8-3.4 8.4-3.4 10 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Drop x={45} y={70} s={0.8} />
        <Drop x={75} y={72} s={0.65} />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'angry' || mood === 'proud') {
    return (
      <>
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M42 48l10 4" />
          <path d="M78 48l-10 4" />
        </g>
        <ellipse cx="48" cy="59" rx="3.8" ry={mood === 'proud' ? 3.2 : 4.4} fill={INK} />
        <ellipse cx="72" cy="59" rx="3.8" ry={mood === 'proud' ? 3.2 : 4.4} fill={INK} />
        {blush}
        <path d={mood === 'proud' ? 'M54 71c4 5 12 2 14-3' : 'M55 72c1.8-3 8.4-3 10 0'} stroke={LIP} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'sleepy') {
    return (
      <>
        <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M43 57c2 5 8 5 10 0" />
          <path d="M67 57c2 5 8 5 10 0" />
        </g>
        {blush}
        <ellipse cx="60" cy="71" rx="3" ry="3.4" fill={MOUTH} opacity="0.85" />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'surprised' || mood === 'dizzy') {
    return (
      <>
        <circle cx="48" cy="59" r="5.4" fill={INK} />
        <circle cx="72" cy="59" r="5.4" fill={INK} />
        <circle cx="49.8" cy="57" r="1.9" fill="#fff" />
        <circle cx="73.8" cy="57" r="1.9" fill="#fff" />
        <ellipse cx="60" cy="72" rx="3.6" ry="4.2" fill={MOUTH} />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'love') {
    return (
      <>
        <HeartShape x={48} y={57} s={0.9} />
        <HeartShape x={72} y={57} s={0.9} />
        {blush}
        <path d="M54 70c2 4 10 4 12 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
      </>
    )
  }
  if (mood === 'shy' || mood === 'tereru' || mood === 'hazukashii' || mood === 'mojimoji') {
    return (
      <>
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M43 59c2-5 8-5 10 0" />
          <path d="M67 59c2-5 8-5 10 0" />
        </g>
        <circle cx="40" cy="66" r="8.2" fill={BLUSH} opacity="0.78" />
        <circle cx="80" cy="66" r="8.2" fill={BLUSH} opacity="0.78" />
        <g stroke={BLUSH} strokeWidth="1.5" strokeLinecap="round" opacity="0.95">
          <path d="M33 63h12" />
          <path d="M33 67h12" />
          <path d="M75 63h12" />
          <path d="M75 67h12" />
        </g>
        <path d="M52 67c2 8 14 8 16 0-4 2-12 2-16 0z" fill={MOUTH} />
        <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
        <HeartShape x={90} y={42} s={0.52} fill={PETAL} />
        <Sparkle x={28} y={42} s={0.5} />
      </>
    )
  }
  // smile / wink / sparkle / thinking default
  return (
    <>
      {mood === 'wink' ? (
        <>
          <ellipse cx="48" cy="58" rx="4" ry="4.8" fill={INK} />
          <circle cx="49.4" cy="56.2" r="1.2" fill="#fff" />
          <path d="M67 59c2-5 8-5 10 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </>
      ) : mood === 'thinking' ? (
        <>
          <path d="M43 58h10" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <ellipse cx="72" cy="58" rx="4" ry="4.6" fill={INK} />
          <circle cx="73.4" cy="56.4" r="1.2" fill="#fff" />
        </>
      ) : (
        <>
          <ellipse cx="48" cy="58" rx="4" ry="4.8" fill={INK} />
          <ellipse cx="72" cy="58" rx="4" ry="4.8" fill={INK} />
          <circle cx="49.4" cy="56.2" r="1.2" fill="#fff" />
          <circle cx="73.4" cy="56.2" r="1.2" fill="#fff" />
        </>
      )}
      {blush}
      <path d="M54 70c2 4 10 4 12 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="64" rx="3.2" ry="2.4" fill={nose} />
    </>
  )
}

function AnimalHead({ character, mood }) {
  const palette = ANIMAL_PALETTE[character] || ANIMAL_PALETTE.inu
  if (character === 'neko') {
    return (
      <>
        <path d="M34 42l-8-22 22 12z" fill={palette.fur} />
        <path d="M86 42l8-22-22 12z" fill={palette.fur} />
        <path d="M32 40l-4-14 14 8z" fill={palette.ear} />
        <path d="M88 40l4-14-14 8z" fill={palette.ear} />
        <circle cx="60" cy="58" r="32" fill={palette.fur} />
        <path d="M42 78c6 6 12 8 18 8s12-2 18-8c-6 3-12 4-18 4s-12-1-18-4z" fill={palette.furDark} opacity="0.35" />
        <AnimalFace mood={mood} nose={palette.nose} />
        <path d="M60 66v8M54 72c4 4 8 4 12 0" fill="none" stroke={palette.nose} strokeWidth="1.6" strokeLinecap="round" />
        <g stroke={palette.furDark} strokeWidth="1.8" strokeLinecap="round" opacity="0.7">
          <path d="M28 62h10M28 68h9" />
          <path d="M82 62h10M83 68h9" />
        </g>
      </>
    )
  }
  if (character === 'kuma') {
    return (
      <>
        <circle cx="34" cy="34" r="12" fill={palette.fur} />
        <circle cx="86" cy="34" r="12" fill={palette.fur} />
        <circle cx="34" cy="34" r="6" fill={palette.ear} />
        <circle cx="86" cy="34" r="6" fill={palette.ear} />
        <circle cx="60" cy="58" r="33" fill={palette.fur} />
        <ellipse cx="60" cy="68" rx="18" ry="14" fill="#fff3e8" />
        <AnimalFace mood={mood} nose={palette.nose} />
      </>
    )
  }
  if (character === 'usagi') {
    return (
      <>
        <path d="M42 40c-4-28 4-36 10-36 5 0 8 12 6 34z" fill={palette.fur} />
        <path d="M78 40c4-28-4-36-10-36-5 0-8 12-6 34z" fill={palette.fur} />
        <path d="M44 38c-2-20 2-26 7-26 3 0 5 10 4 24z" fill={palette.ear} />
        <path d="M76 38c2-20-2-26-7-26-3 0-5 10-4 24z" fill={palette.ear} />
        <circle cx="60" cy="58" r="30" fill={palette.fur} />
        <AnimalFace mood={mood} nose={palette.nose} />
      </>
    )
  }
  // inu (dog)
  return (
    <>
      <path d="M30 48c-10-4-14-16-8-24 8 4 12 12 12 22z" fill={palette.fur} />
      <path d="M90 48c10-4 14-16 8-24-8 4-12 12-12 22z" fill={palette.fur} />
      <path d="M32 46c-6-2-8-10-4-16 5 3 8 8 8 15z" fill={palette.ear} />
      <path d="M88 46c6-2 8-10 4-16-5 3-8 8-8 15z" fill={palette.ear} />
      <circle cx="60" cy="58" r="32" fill={palette.fur} />
      <ellipse cx="60" cy="70" rx="14" ry="11" fill="#fff6ea" />
      <AnimalFace mood={mood} nose={palette.nose} />
    </>
  )
}

function DailyBody({ character, pose }) {
  const isAnimal = Boolean(ANIMAL_PALETTE[character])
  const isKaito = character === 'kaito'
  const palette = ANIMAL_PALETTE[character]
  const skin = isAnimal ? palette.fur : (isKaito ? SKIN_M : SKIN)
  const shirt = isAnimal ? palette.shirt : (isKaito ? '#526b9d' : '#ef9aaa')
  const shirtHi = isAnimal ? palette.shirtHi : (isKaito ? STEEL_LIGHT : '#ffd0d9')
  const stroke = isKaito ? GEAR_DARK : INK
  const arm = (d) => <path d={d} fill="none" stroke={skin} strokeWidth="8" strokeLinecap="round" />
  const paw = (x, y) => <circle cx={x} cy={y} r="5" fill={skin} />

  return (
    <g stroke={stroke} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M43 84c4-7 10-10 17-10s13 3 17 10l5 28H38z" fill={shirt} />
      <path d="M48 82c7 5 17 5 24 0" fill="none" stroke={shirtHi} strokeWidth="2.4" strokeLinecap="round" />
      {isAnimal ? <path d="M58 112c4 10 10 14 14 10" fill="none" stroke={skin} strokeWidth="6" strokeLinecap="round" /> : null}
      {pose === 'wave' ? (
        <>
          {arm('M76 87c9-5 12-14 11-23')}
          <g fill={skin}><circle cx="87" cy="61" r="5" /><path d="M84 59l-4-6M87 58v-7M90 59l4-6" fill="none" stroke={skin} strokeWidth="3" strokeLinecap="round" /></g>
        </>
      ) : null}
      {pose === 'bow' || pose === 'dogeza' ? (
        <>
          {arm('M45 88l-10 14')}{arm('M75 88l10 14')}
          <path d="M46 102c9 5 19 5 28 0" fill="none" stroke={skin} strokeWidth="7" strokeLinecap="round" />
          {pose === 'dogeza' ? <ellipse cx="60" cy="116" rx="28" ry="5" fill={shirtHi} opacity="0.7" stroke="none" /> : null}
        </>
      ) : null}
      {pose === 'jump' || pose === 'banzai' ? (
        <>
          {arm('M46 87L31 70')}{arm('M74 87l15-17')}
          <path d="M47 111l-7 8M72 111l8 8" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          {paw(31, 68)}{paw(89, 68)}
        </>
      ) : null}
      {pose === 'dance' ? (
        <>
          {arm('M46 88c-10-8-8-20 0-22')}{arm('M74 88c10-8 8-20 0-22')}
          <path d="M48 110l-6 10M72 110l10 6" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          {paw(42, 64)}{paw(78, 64)}
          <Sparkle x={28} y={78} s={0.55} fill={shirtHi} />
          <Sparkle x={94} y={80} s={0.5} fill={shirtHi} />
        </>
      ) : null}
      {pose === 'roll' || pose === 'flop' ? (
        <>
          <ellipse cx="60" cy="104" rx="34" ry="16" fill={shirt} opacity="0.85" stroke="none" />
          {paw(34, 98)}{paw(86, 98)}{paw(42, 112)}{paw(78, 112)}
        </>
      ) : null}
      {pose === 'sleep' ? (
        <>
          <path d="M36 94c16-9 34-9 50 0v18H36z" fill="#9d91d4" stroke="none" />
          <path d="M37 96c16 7 32 7 48 0" fill="none" stroke="#c9c1ef" strokeWidth="3" />
        </>
      ) : null}
      {pose === 'hug' ? (
        <>
          {arm('M45 87c-11 8-9 19 15 18')}{arm('M75 87c11 8 9 19-15 18')}
          <HeartShape x={60} y={99} s={0.75} fill={isKaito ? STEEL : HEART} />
        </>
      ) : null}
      {pose === 'run' ? (
        <>
          {arm('M47 87L31 78')}{arm('M73 87l15 7')}
          <path d="M49 110l-13 7M70 110l14 3" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        </>
      ) : null}
      {pose === 'eat' ? (
        <>
          {arm('M46 90l10 8')}{arm('M74 90l-10 8')}
          <ellipse cx="60" cy="100" rx="15" ry="5" fill="#fff8ef" />
          <path d="M52 98h16" stroke={isKaito ? STEEL : PETAL} />
        </>
      ) : null}
      {pose === 'point' ? (
        <>
          {arm('M75 88l14-12')}
          <path d="M89 76l9-4" fill="none" stroke={skin} strokeWidth="4" strokeLinecap="round" />
          {paw(98, 72)}
        </>
      ) : null}
      {pose === 'shrug' ? (
        <>
          {arm('M46 88L31 84')}{arm('M74 88l15-4')}
          {paw(29, 83)}{paw(91, 83)}
        </>
      ) : null}
      {pose === 'peek' ? (
        <>
          <rect x="31" y="89" width="58" height="24" rx="6" fill={shirtHi} />
          {paw(44, 89)}{paw(76, 89)}
        </>
      ) : null}
      {pose === 'sit' ? (
        <>
          {arm('M46 90l-8 10')}{arm('M74 90l8 10')}
          <ellipse cx="60" cy="114" rx="22" ry="7" fill={shirt} opacity="0.9" stroke="none" />
        </>
      ) : null}
    </g>
  )
}

function DailyCharacter({ sticker }) {
  const mood = sticker.mood || sticker.face || 'smile'
  if (ANIMAL_PALETTE[sticker.character]) {
    return (
      <>
        <DailyBody character={sticker.character} pose={sticker.pose} />
        <AnimalHead character={sticker.character} mood={mood} />
      </>
    )
  }
  const isKaito = sticker.character === 'kaito'
  const Head = isKaito ? KaitoHead : HanaHead
  const faces = isKaito ? KAITO_FACES : FACES
  const faceKey = isKaito
    ? (MOOD_TO_KAITO[mood] || sticker.face || 'k-smile')
    : (MOOD_TO_HANA[mood] || sticker.face || 'smile')
  const Face = faces[faceKey] || (isKaito ? KAITO_FACES['k-smile'] : FACES.smile)
  return (
    <>
      <DailyBody character={sticker.character} pose={sticker.pose} />
      <Head />
      <Face />
    </>
  )
}

const DAILY_TYPE = {
  round: { family: "'M PLUS Rounded 1c','Noto Sans JP','Yu Gothic',sans-serif", weight: 900 },
  hand: { family: "'Klee One','Yu Kyokasho','Noto Sans JP',cursive", weight: 700 },
  bold: { family: "'Arial Black','Noto Sans JP','Yu Gothic',sans-serif", weight: 900 },
  soft: { family: "'Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif", weight: 700 },
}

function DailyStickerArt({ sticker }) {
  const phrase = String(sticker.phrase || sticker.label || '')
  // Wrap earlier so 6–8 char phrases (おやすみなさい) never overflow the 150px viewBox.
  const splitAt = phrase.length > 5 ? Math.ceil(phrase.length / 2) : 0
  const lines = splitAt ? [phrase.slice(0, splitAt), phrase.slice(splitAt)] : [phrase]
  const isSide = ['side', 'point', 'run'].includes(sticker.pose)
  const isBig = ['big', 'jump', 'banzai', 'dance'].includes(sticker.pose)
  const type = DAILY_TYPE[sticker.typeStyle] || DAILY_TYPE.round
  const textX = isSide ? 112 : 75
  const textY = isSide ? (lines.length > 1 ? 28 : 38) : (lines.length > 1 ? 19 : 27)
  const baseFont = isBig ? (lines.length > 1 ? 20 : 25) : (lines.length > 1 ? 16 : 19)
  const maxChars = Math.max(1, ...lines.map((line) => Array.from(line).length))
  const textBudget = isSide ? 72 : 132
  const fontSize = Math.max(11, Math.min(baseFont, textBudget / maxChars))
  const strokeWidth = Math.max(3.5, Math.min(isBig ? 7 : 5.5, fontSize * 0.32))
  const characterTransform = isSide
    ? 'translate(1 32) scale(.72)'
    : isBig
      ? 'translate(35 35) scale(.72)'
      : sticker.pose === 'peek' || sticker.pose === 'flop' || sticker.pose === 'roll'
        ? 'translate(34 38) scale(.68)'
        : 'translate(30 31) scale(.74)'

  return (
    <>
      <g opacity="0.16" fill={sticker.accent}>
        <circle cx="14" cy="73" r="10" />
        <circle cx="139" cy="38" r="8" />
        <path d="M119 104c14-18 25-14 29 3-12 8-22 7-29-3z" />
      </g>
      <g transform={characterTransform}>
        <DailyCharacter sticker={sticker} />
      </g>
      <g
        textAnchor="middle"
        fontFamily={type.family}
        fontWeight={type.weight}
        fontSize={fontSize}
        stroke="#fffaf5"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        paintOrder="stroke"
        transform={sticker.typeStyle === 'hand' ? `rotate(-3 ${textX} ${textY})` : undefined}
      >
        {lines.map((line, index) => (
          <text key={`${line}-${index}`} x={textX} y={textY + index * (fontSize + 2)} fill={sticker.accent}>
            {line}
          </text>
        ))}
      </g>
      <g fill={sticker.accent}>
        <Sparkle x={16} y={32} s={0.8} fill={sticker.accent} />
        <Sparkle x={140} y={70} s={0.62} fill={sticker.accent} opacity={0.8} />
        {isBig ? <><path d="M18 90l-8 5M132 91l9 4" fill="none" stroke={sticker.accent} strokeWidth="3" strokeLinecap="round" /></> : null}
      </g>
    </>
  )
}

function LiveStickerArt({ sticker, kaito }) {
  const motion = String(sticker?.motion || 'kiss')
  const Head = kaito ? KaitoHead : HanaHead
  const Face = kaito
    ? (motion === 'wink' ? KAITO_FACES['k-wink'] : motion === 'jump' ? KAITO_FACES['k-grin'] || KAITO_FACES['k-smile'] : KAITO_FACES['k-shy'] || KAITO_FACES['k-smile'])
    : (motion === 'wink' ? FACES.wink : motion === 'jump' ? FACES.laugh : FACES.love)
  const heart = kaito ? STEEL : HEART
  const ink = kaito ? GEAR_DARK : INK
  const skin = kaito ? SKIN_M : SKIN
  return (
    <g className={`hana-live-stage is-${motion}`}>
      {motion === 'peek' ? (
        <g className="hana-live-peek">
          <rect x="14" y="18" width="38" height="78" rx="4" fill="rgba(255,248,240,0.16)" />
          <g transform="translate(-22 6)">
            <Head />
            {Face ? <Face /> : null}
          </g>
        </g>
      ) : (
        <>
          {motion === 'jump' ? <ellipse className="hana-live-shadow" cx="60" cy="96" rx="20" ry="5" fill={ink} opacity="0.16" /> : null}
          <g className="hana-live-body">
            <Head />
            {Face ? <Face /> : null}
          </g>
        </>
      )}
      {motion === 'kiss' ? (
        <g className="hana-live-fx">
          <g className="hana-live-heart is-a"><HeartShape x={86} y={58} s={0.72} fill={heart} /></g>
          <g className="hana-live-heart is-b"><HeartShape x={98} y={46} s={0.48} fill={PETAL} /></g>
          <Sparkle x={78} y={40} s={0.42} fill={GOLD} />
        </g>
      ) : null}
      {motion === 'wink' ? (
        <g className="hana-live-fx">
          <g className="hana-live-heart is-a"><HeartShape x={90} y={44} s={0.58} fill={heart} /></g>
          <Sparkle x={38} y={36} s={0.45} fill={GOLD} />
        </g>
      ) : null}
      {motion === 'hearts' ? (
        <g className="hana-live-fx">
          <g className="hana-live-heart is-a"><HeartShape x={90} y={50} s={0.82} fill={heart} /></g>
          <g className="hana-live-heart is-b"><HeartShape x={104} y={62} s={0.55} fill={PETAL} /></g>
          <g className="hana-live-heart is-c"><HeartShape x={96} y={34} s={0.42} fill={heart} /></g>
        </g>
      ) : null}
      {motion === 'hug' ? (
        <g className="hana-live-hug">
          <path d="M30 68c-6 16 8 30 30 28" fill="none" stroke={skin} strokeWidth="15" strokeLinecap="round" />
          <path d="M90 68c6 16-8 30-30 28" fill="none" stroke={skin} strokeWidth="15" strokeLinecap="round" />
          <circle cx="56" cy="94" r="8" fill={skin} />
          <circle cx="64" cy="94" r="8" fill={skin} />
          <HeartShape x={60} y={86} s={0.62} fill={heart} />
        </g>
      ) : null}
      {motion === 'peace' ? (
        <g className="hana-live-peace">
          <g transform="translate(88 58)">
            <ellipse cx="0" cy="16" rx="12.5" ry="13.5" fill={skin} />
            <rect x="-6.4" y="-10" width="6.6" height="22" rx="3.3" fill={skin} />
            <rect x="1.4" y="-14" width="6.6" height="24" rx="3.3" fill={skin} />
            <ellipse cx="-12" cy="12" rx="4.4" ry="6.2" fill={skin} />
          </g>
        </g>
      ) : null}
      {motion === 'jump' ? (
        <g className="hana-live-spark">
          <Sparkle className="hana-live-twinkle is-a" x={26} y={34} s={0.62} />
          <Sparkle className="hana-live-twinkle is-b" x={94} y={28} s={0.5} />
          <Sparkle className="hana-live-twinkle is-c" x={88} y={52} s={0.38} fill={PETAL} />
        </g>
      ) : null}
    </g>
  )
}

/**
 * One sticker as inline SVG. Works for both sets — the id decides the character.
 * @param {{ id: string, size?: number, title?: string, className?: string, characterOnly?: boolean }} props
 */
export default function HanaSticker({
  id,
  size = 64,
  title,
  className = '',
  characterOnly = false,
}) {
  const key = String(id || '')
  const sticker = STICKER_BY_ID[key]
  const isDaily = String(sticker?.set || '').startsWith('daily-')
  const isLive = String(sticker?.set || '').endsWith('-live')
  const isTomo = sticker?.set === 'tomo'
  const isKaito = sticker?.set === 'kaito' || sticker?.set === 'kaito-live'
  const Face = isKaito ? KAITO_FACES[key] : FACES[key]
  if (!isDaily && !isLive && !isTomo && !Face) return null
  const Head = isKaito ? KaitoHead : HanaHead
  const label = title || hanaStickerLabel(id)
  const motion = String(sticker?.motion || '')

  if (characterOnly && isTomo) {
    return (
      <svg
        viewBox="12 8 96 104"
        width={size}
        height={size}
        className={`hana-sticker is-portrait is-tomo ${className}`.trim()}
        role={label ? 'img' : 'presentation'}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : 'true'}
        focusable="false"
      >
        <TomoStickerArt sticker={sticker} portrait />
      </svg>
    )
  }

  // Pack tabs for mainichi: full chibi body (no phrase) so they differ from
  // the close-up face tabs for はな / かいと expression packs.
  if (characterOnly && (isDaily || sticker?.character)) {
    const character = sticker.character || (isKaito ? 'kaito' : 'hana')
    const portrait = {
      ...sticker,
      character,
      pose: 'idle',
      mood: 'smile',
      face: 'smile',
    }
    return (
      <svg
        viewBox="22 16 76 112"
        width={size}
        height={size}
        className={`hana-sticker is-portrait ${className}`.trim()}
        role={label ? 'img' : 'presentation'}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : 'true'}
        focusable="false"
      >
        <DailyCharacter sticker={portrait} />
      </svg>
    )
  }

  return (
    <svg
      viewBox={isTomo ? '0 0 120 120' : (isLive ? '12 8 108 100' : (isDaily ? '0 0 150 125' : VIEW_BOX))}
      width={isTomo ? size : (isDaily || isLive ? Math.round(size * 1.2) : size)}
      height={size}
      className={`hana-sticker${isDaily ? ' is-daily' : ''}${isTomo ? ' is-tomo' : ''}${isLive ? ` is-live is-${motion}` : ''} ${className}`.trim()}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {isDaily ? (
        <DailyStickerArt sticker={sticker} />
      ) : isLive ? (
        <LiveStickerArt sticker={sticker} kaito={isKaito} />
      ) : isTomo ? (
        <TomoStickerArt sticker={sticker} />
      ) : (
        <>
          <Head />
          <Face />
        </>
      )}
    </svg>
  )
}
