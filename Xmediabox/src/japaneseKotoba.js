import { getLocalDateKey } from './todayPick'

/**
 * Curated encouraging Japanese phrases — a tiny daily “podcast” moment.
 * Keep tones warm, grounded, and suitable for a shared listening space.
 */
export const JAPANESE_KOTOBA = [
  {
    id: 'ichigo',
    ja: '一期一会',
    reading: 'いちごいちえ',
    note: '今この時間は、二度と戻ってこない出会い。',
  },
  {
    id: 'nanakorobi',
    ja: '七転び八起き',
    reading: 'ななころびやおき',
    note: '転んでも、また立ち上がればいい。',
  },
  {
    id: 'chiri',
    ja: 'ちりも積もれば山となる',
    reading: 'ちりもつもればやまとなる',
    note: '小さな積み重ねが、やがて大きな力になる。',
  },
  {
    id: 'isshin',
    ja: '一心',
    reading: 'いっしん',
    note: '心をひとつにすれば、道は開ける。',
  },
  {
    id: 'houjou',
    ja: '初心忘るべからず',
    reading: 'しょしんわするべからず',
    note: 'はじめの気持ちを、ときどき思い出す。',
  },
  {
    id: 'kanbashii',
    ja: '花は桜木、人は武士',
    reading: 'はなはさくらぎ、ひとはぶし',
    note: '美しさも潔さも、その人らしさにある。',
  },
  {
    id: 'yuuki',
    ja: '雨降って地固まる',
    reading: 'あめふってじかたまる',
    note: 'つらいあとのほうが、土台は強くなる。',
  },
  {
    id: 'ashita',
    ja: '明日は明日の風が吹く',
    reading: 'あしたはあしたのかぜがふく',
    note: '今日を終えたら、あとは風にまかせて。',
  },
  {
    id: 'mirai',
    ja: '継続は力なり',
    reading: 'けいぞくはちからなり',
    note: '派手じゃなくても、続けることが力。',
  },
  {
    id: 'kokoro',
    ja: '情けは人の為ならず',
    reading: 'なさけはひとのためならず',
    note: 'やさしい行いは、やがて自分にも還る。',
  },
  {
    id: 'suki',
    ja: '好きこそものの上手なれ',
    reading: 'すきこそもののじょうずなれ',
    note: '好きな気持ちが、上達を連れてくる。',
  },
  {
    id: 'heiwa',
    ja: '今日も息をしている',
    reading: 'きょうもいきをしている',
    note: 'それだけで、十分よくやっている。',
  },
  {
    id: 'yuttari',
    ja: '急がば回れ',
    reading: 'いそがばまわれ',
    note: '遠回りに見えても、確かな道がある。',
  },
  {
    id: 'hikari',
    ja: '明けない夜はない',
    reading: 'あけないよるはない',
    note: 'どんな夜も、朝には届く。',
  },
  {
    id: 'yasashi',
    ja: '思いやり',
    reading: 'おもいやり',
    note: '小さな気づかいが、心をあたためる。',
  },
  {
    id: 'nagai',
    ja: '千里の道も一歩から',
    reading: 'せんりのみちもいっぽから',
    note: '大きな夢も、最初の一歩で始まる。',
  },
  {
    id: 'shizuka',
    ja: '静かに、前へ',
    reading: 'しずかに、まえへ',
    note: '焦らなくていい。ゆっくり進めばいい。',
  },
  {
    id: 'uta',
    ja: '音楽は心の友人',
    reading: 'おんがくはこころのゆうじん',
    note: '聴けば、ひとりじゃない気がする。',
  },
  {
    id: 'hon',
    ja: '本はもうひとりの自分',
    reading: 'ほんはもうひとりのじぶん',
    note: 'ページをめくるたび、世界がひろがる。',
  },
  {
    id: 'hana',
    ja: '花鳥風月',
    reading: 'かちょうふうげつ',
    note: '美しいものに触れる時間を、大切に。',
  },
  {
    id: 'kizuna',
    ja: '縁を結ぶ',
    reading: 'えんをむすぶ',
    note: 'つながりの中に、あたたかさがある。',
  },
  {
    id: 'genki',
    ja: '今日もよく頑張った',
    reading: 'きょうもよくがんばった',
    note: '自分に、やさしい一言を。',
  },
  {
    id: 'mamoru',
    ja: '小さな幸せを拾う',
    reading: 'ちいさなしあわせをひろう',
    note: '日常のなかに、宝物は落ちている。',
  },
  {
    id: 'yume',
    ja: '夢は逃げない。逃げるのはいつも自分だ',
    reading: 'ゆめはにげない。にげるのはいつもじぶんだ',
    note: '戻る場所は、まだここにある。',
  },
  {
    id: 'nukumori',
    ja: 'ありがとうは魔法の言葉',
    reading: 'ありがとうはまほうのことば',
    note: '言うほど、関係はあたたかくなる。',
  },
  {
    id: 'kaze',
    ja: '風と共にゆこう',
    reading: 'かぜとともにゆこう',
    note: '力まなくても、流れに乗れる日がある。',
  },
  {
    id: 'michi',
    ja: '道は開ける',
    reading: 'みちはひらける',
    note: 'いま行き止まりでも、角を曲がれば光がある。',
  },
  {
    id: 'yasumu',
    ja: '休むのも勇気',
    reading: 'やすむのもゆうき',
    note: '立ち止まることも、前進のうち。',
  },
  {
    id: 'kibou',
    ja: '希望は捨てない',
    reading: 'きぼうはすてない',
    note: '細い光でも、夜道を照らせる。',
  },
  {
    id: 'oto',
    ja: '聴くことは愛すること',
    reading: 'きくことはあいすること',
    note: '耳をすませば、心が近づく。',
  },
]

function hashDateKey(dateKey) {
  let hash = 0
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0
  }
  return hash
}

export function getTodayKotoba(date = new Date()) {
  const dateKey = getLocalDateKey(date)
  const index = hashDateKey(dateKey) % JAPANESE_KOTOBA.length
  return {
    ...JAPANESE_KOTOBA[index],
    dateKey,
    index,
  }
}

export function getNextKotoba(currentId) {
  const currentIndex = JAPANESE_KOTOBA.findIndex((item) => item.id === currentId)
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % JAPANESE_KOTOBA.length
  return {
    ...JAPANESE_KOTOBA[nextIndex],
    dateKey: getLocalDateKey(),
    index: nextIndex,
  }
}

/**
 * Speak a Japanese phrase with the browser voice (mini podcast moment).
 * @returns {() => void} cancel function
 */
export function speakKotoba(text, { rate = 0.92, onStart, onEnd, onError } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onError?.(new Error('このブラウザでは音声読み上げに対応していません。'))
    return () => {}
  }

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  utterance.rate = rate
  utterance.pitch = 1.02

  const voices = window.speechSynthesis.getVoices()
  const japaneseVoice =
    voices.find((voice) => /ja(-JP)?/i.test(voice.lang) && /google|kyoko|otoya|haruka|ichiro/i.test(voice.name))
    || voices.find((voice) => /ja(-JP)?/i.test(voice.lang))
  if (japaneseVoice) utterance.voice = japaneseVoice

  utterance.onstart = () => onStart?.()
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onError?.(new Error('読み上げに失敗しました。'))

  // Some browsers need a tick after getVoices().
  window.setTimeout(() => {
    window.speechSynthesis.speak(utterance)
  }, 40)

  return () => {
    window.speechSynthesis.cancel()
  }
}
