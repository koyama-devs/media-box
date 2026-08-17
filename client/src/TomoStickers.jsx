/**
 * Original chubby friends pack (ともだち). LINE-sheet vibe, not LINE IP.
 * Flat fills only — no <defs> / gradients (ids would collide in the picker).
 */

const INK = '#2a1814'
const BLUSH = '#f4a89a'
const MOUTH = '#c45c4a'
const HEART = '#e8556f'
const PETAL = '#e89aaa'
const GOLD = '#fcd34d'
const TEAR = '#7cc4f0'

const PALETTE = {
  kuri: { fur: '#c8895a', dark: '#9a5e38', cream: '#ffe8d2', leaf: '#7cb86a', nose: '#3a2420' },
  usa: { fur: '#f7eadf', dark: '#e8c4b4', inner: '#f4a8b8', nose: '#e07a8a' },
  keru: { fur: '#8fd6a6', dark: '#5aaa78', belly: '#f6fbea', eye: '#fffdf6' },
  mochi: { fur: '#f5d15b', dark: '#e8b44a', petal: '#e89aaa' },
  tsuki: { fur: '#ffe9b8', dark: '#f0c878', night: '#7aa0d8' },
  dango: { pink: '#f4b3c4', cream: '#fff6ea', matcha: '#b5d48a', stick: '#c89a6a' },
}

/** Shared LINE-style reaction sheet. Everyone sees this tab. */
export const TOMO_SET = [
  { id: 'tomo-kuri-love', character: 'kuri', mood: 'love', pose: 'hug', label: 'だいすき', burst: 'hearts', aliases: ['だいすき', '好き', 'love', 'iloveyou', 'yêutoo', 'ハート'] },
  { id: 'tomo-kuri-laugh', character: 'kuri', mood: 'laugh', pose: 'jump', label: 'あはは', aliases: ['あはは', 'わーい', 'haha', 'lol', 'cườilớn'] },
  { id: 'tomo-kuri-angry', character: 'kuri', mood: 'angry', pose: 'stomp', label: 'むっ', aliases: ['むっ', 'ぷんぷん', 'angry', 'giận', 'おこ'] },
  { id: 'tomo-kuri-hug', character: 'kuri', mood: 'smile', pose: 'hug', label: 'ぎゅっ', burst: 'hearts', aliases: ['ぎゅっ', 'hug', 'ôm'] },
  { id: 'tomo-usa-shy', character: 'usa', mood: 'shy', pose: 'fidget', label: 'てれてれ', aliases: ['てれてれ', 'てれる', 'shy', 'ngại'] },
  { id: 'tomo-usa-wink', character: 'usa', mood: 'wink', pose: 'wave', label: 'ウィンク', aliases: ['ウィンク', 'wink'] },
  { id: 'tomo-usa-cry', character: 'usa', mood: 'cry', pose: 'sad', label: 'ぐすん', aliases: ['ぐすん', '泣', 'cry', 'khóc'] },
  { id: 'tomo-usa-sparkle', character: 'usa', mood: 'sparkle', pose: 'jump', label: 'きらきら', burst: 'sparkle', aliases: ['きらきら', 'すごい', 'sparkle', 'lấplánh'] },
  { id: 'tomo-keru-peace', character: 'keru', mood: 'smile', pose: 'peace', label: 'ぴーす', aliases: ['ぴーす', 'ピース', 'peace', 'victory'] },
  { id: 'tomo-keru-ok', character: 'keru', mood: 'smile', pose: 'ok', label: 'オッケー', aliases: ['オッケー', 'ok', 'okay', 'いいよ'] },
  { id: 'tomo-keru-sorry', character: 'keru', mood: 'sorry', pose: 'bow', label: 'ごめんね', aliases: ['ごめんね', 'ごめん', 'sorry', 'xinlỗi'] },
  { id: 'tomo-keru-jump', character: 'keru', mood: 'laugh', pose: 'jump', label: 'やったー', burst: 'sparkle', aliases: ['やった', 'やったー', 'yay', 'tuyệtvời'] },
  { id: 'tomo-mochi-laugh', character: 'mochi', mood: 'laugh', pose: 'jump', label: 'わーい', aliases: ['わーい', 'yahoo', 'vui'] },
  { id: 'tomo-mochi-sleep', character: 'mochi', mood: 'sleep', pose: 'sleep', label: 'おやすみ', aliases: ['おやすみ', 'ねむい', 'sleep', 'ngủ'] },
  { id: 'tomo-mochi-clap', character: 'mochi', mood: 'smile', pose: 'clap', label: 'ぱちぱち', aliases: ['ぱちぱち', 'clap', 'vỗtay'] },
  { id: 'tomo-mochi-sweat', character: 'mochi', mood: 'sweat', pose: 'worry', label: 'えーん', aliases: ['えーん', 'たいへん', 'stress', 'toátmồhôi'] },
  { id: 'tomo-tsuki-wave', character: 'tsuki', mood: 'smile', pose: 'wave', label: 'やっほー', aliases: ['やっほー', 'こんにちは', 'hello', 'xin chào', 'hi'] },
  { id: 'tomo-tsuki-think', character: 'tsuki', mood: 'think', pose: 'think', label: 'うーん', aliases: ['うーん', '考える', 'think', 'nghĩ'] },
  { id: 'tomo-dango-heart', character: 'dango', mood: 'love', pose: 'heart', label: 'ハート', burst: 'hearts', aliases: ['ハート', 'heart', '❤', '♡'] },
  { id: 'tomo-dango-sparkle', character: 'dango', mood: 'sparkle', pose: 'sparkle', label: 'すき', burst: 'sparkle', aliases: ['すき', '好き', 'dango', 'さくら'] },
]

function Sparkle({ x, y, s = 1, fill = GOLD }) {
  return (
    <path
      d="M0-6c1 3.4 1.6 4 5 5-3.4 1-4 1.6-5 5-1-3.4-1.6-4-5-5 3.4-1 4-1.6 5-5z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
    />
  )
}

function Drop({ x, y, s = 1, fill = TEAR }) {
  return (
    <path
      d="M0-6c2.6 4 4.4 6 4.4 8.4C4.4 5 2.4 6.6 0 6.6S-4.4 5-4.4 2.4C-4.4 0-2.6-2 0-6z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
    />
  )
}

function Heart({ x, y, s = 1, fill = HEART }) {
  return (
    <path
      d="M0 6c-4.6-4-7.4-6.6-7.4-9.6 0-2.4 1.9-4 4-4 1.5 0 2.7.8 3.4 2 .7-1.2 1.9-2 3.4-2 2.1 0 4 1.6 4 4C7.4-.6 4.6 2 0 6z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
    />
  )
}

function Shadow() {
  return <ellipse cx="60" cy="110" rx="26" ry="5.5" fill={INK} opacity="0.12" />
}

function Paw({ x, y, fill, r = 6.2 }) {
  return <circle cx={x} cy={y} r={r} fill={fill} />
}

function PeaceHand({ x, y, fill, flip = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx="0" cy="5" rx="7.2" ry="7.6" fill={fill} />
      <rect x="-4.2" y="-12" width="3.8" height="15" rx="1.9" fill={fill} />
      <rect x="0.6" y="-14" width="3.8" height="17" rx="1.9" fill={fill} />
    </g>
  )
}

function ThumbHand({ x, y, fill }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="1" cy="5" rx="8" ry="7.2" fill={fill} />
      <rect x="-2.2" y="-13" width="5.6" height="15" rx="2.7" fill={fill} />
    </g>
  )
}

function TomoFace({ mood = 'smile', x = 60, y = 46, nose }) {
  const blush = (
    <>
      <circle cx={x - 16} cy={y + 11} r="5.4" fill={BLUSH} opacity="0.48" />
      <circle cx={x + 16} cy={y + 11} r="5.4" fill={BLUSH} opacity="0.48" />
    </>
  )
  if (mood === 'laugh') {
    return (
      <>
        <path d={`M${x - 17} ${y + 1}c2-5 8-5 10 0`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d={`M${x + 7} ${y + 1}c2-5 8-5 10 0`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {blush}
        <path d={`M${x - 8} ${y + 10}c2 8 14 8 16 0-4 2-12 2-16 0z`} fill={MOUTH} />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'love') {
    return (
      <>
        <Heart x={x - 12} y={y} s={0.78} />
        <Heart x={x + 12} y={y} s={0.78} />
        {blush}
        <path d={`M${x - 6} ${y + 13}c2 4 10 4 12 0`} stroke={MOUTH} strokeWidth="2" strokeLinecap="round" fill="none" />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'shy') {
    return (
      <>
        <path d={`M${x - 17} ${y + 2}c2-5 8-5 10 0`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d={`M${x + 7} ${y + 2}c2-5 8-5 10 0`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx={x - 16} cy={y + 12} r="7.4" fill={BLUSH} opacity="0.78" />
        <circle cx={x + 16} cy={y + 12} r="7.4" fill={BLUSH} opacity="0.78" />
        <g stroke={BLUSH} strokeWidth="1.5" strokeLinecap="round">
          <path d={`M${x - 23} ${y + 9}h11`} />
          <path d={`M${x - 23} ${y + 13}h11`} />
          <path d={`M${x + 12} ${y + 9}h11`} />
          <path d={`M${x + 12} ${y + 13}h11`} />
        </g>
        <path d={`M${x - 8} ${y + 10}c2 7 14 7 16 0-4 2-12 2-16 0z`} fill={MOUTH} />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'wink') {
    return (
      <>
        <ellipse cx={x - 12} cy={y} rx="3.6" ry="4.4" fill={INK} />
        <circle cx={x - 11} cy={y - 1.6} r="1.1" fill="#fff" />
        <path d={`M${x + 7} ${y + 1}c2-5 8-5 10 0`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {blush}
        <path d={`M${x - 6} ${y + 13}c2 4 10 4 12 0`} stroke={MOUTH} strokeWidth="2" strokeLinecap="round" fill="none" />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'cry' || mood === 'sorry') {
    return (
      <>
        <path d={`M${x - 17} ${y - 2}c2 6 8 6 10 0`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d={`M${x + 7} ${y - 2}c2 6 8 6 10 0`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {blush}
        <path d={`M${x - 5} ${y + 16}c1.6-3.2 8.4-3.2 10 0`} stroke={MOUTH} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Drop x={x - 16} y={y + 16} s={0.72} />
        <Drop x={x + 16} y={y + 18} s={0.58} />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'angry') {
    return (
      <>
        <path d={`M${x - 18} ${y - 10}l10 4`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <path d={`M${x + 18} ${y - 10}l-10 4`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx={x - 12} cy={y} rx="3.4" ry="4.2" fill={INK} />
        <ellipse cx={x + 12} cy={y} rx="3.4" ry="4.2" fill={INK} />
        <path d={`M${x - 5} ${y + 15}c1.8-3 8.4-3 10 0`} stroke={MOUTH} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d={`M${x + 22} ${y - 16}l4-7 4 7-8 0z`} fill="#e05b4e" />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'sleep') {
    return (
      <>
        <path d={`M${x - 17} ${y + 1}c2 5 8 5 10 0`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d={`M${x + 7} ${y + 1}c2 5 8 5 10 0`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {blush}
        <ellipse cx={x} cy={y + 14} rx="2.8" ry="3.2" fill={MOUTH} opacity="0.85" />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'think' || mood === 'sweat') {
    return (
      <>
        <path d={`M${x - 17} ${y}h10`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx={x + 12} cy={y} rx="3.6" ry="4.2" fill={INK} />
        <circle cx={x + 13.2} cy={y - 1.4} r="1.1" fill="#fff" />
        {blush}
        <ellipse cx={x} cy={y + 14} rx="3.2" ry="3.6" fill={MOUTH} />
        {mood === 'sweat' ? <Drop x={x + 24} y={y - 8} s={0.85} fill="#9ad4ef" /> : null}
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
      </>
    )
  }
  if (mood === 'sparkle') {
    return (
      <>
        <ellipse cx={x - 12} cy={y} rx="3.8" ry="4.6" fill={INK} />
        <ellipse cx={x + 12} cy={y} rx="3.8" ry="4.6" fill={INK} />
        <circle cx={x - 10.8} cy={y - 1.6} r="1.2" fill="#fff" />
        <circle cx={x + 13.2} cy={y - 1.6} r="1.2" fill="#fff" />
        {blush}
        <path d={`M${x - 8} ${y + 10}c2 8 14 8 16 0-4 2-12 2-16 0z`} fill={MOUTH} />
        {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
        <Sparkle x={x - 28} y={y - 14} s={0.55} fill={PETAL} />
        <Sparkle x={x + 28} y={y - 10} s={0.48} />
      </>
    )
  }
  return (
    <>
      <ellipse cx={x - 12} cy={y} rx="3.6" ry="4.4" fill={INK} />
      <ellipse cx={x + 12} cy={y} rx="3.6" ry="4.4" fill={INK} />
      <circle cx={x - 10.8} cy={y - 1.6} r="1.1" fill="#fff" />
      <circle cx={x + 13.2} cy={y - 1.6} r="1.1" fill="#fff" />
      {blush}
      <path d={`M${x - 6} ${y + 13}c2 4 10 4 12 0`} stroke={MOUTH} strokeWidth="2" strokeLinecap="round" fill="none" />
      {nose ? <ellipse cx={x} cy={y + 7} rx="3" ry="2.2" fill={nose} /> : null}
    </>
  )
}

function LimbSet({ fill, pose }) {
  if (pose === 'jump') {
    return (
      <>
        <path d="M38 78L24 62" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 78l14-16" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={22} y={60} fill={fill} />
        <Paw x={98} y={60} fill={fill} />
        <path d="M46 102L36 112" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M74 102l10 10" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
      </>
    )
  }
  if (pose === 'wave') {
    return (
      <>
        <path d="M38 80L28 92" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 78c10-8 12-20 8-28" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={26} y={94} fill={fill} />
        <Paw x={88} y={48} fill={fill} />
      </>
    )
  }
  if (pose === 'hug') {
    return (
      <>
        <path d="M38 80c-10 10-6 20 16 18" stroke={fill} strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M82 80c10 10 6 20-16 18" stroke={fill} strokeWidth="9" strokeLinecap="round" fill="none" />
        <Heart x={60} y={92} s={0.82} />
      </>
    )
  }
  if (pose === 'peace') {
    return (
      <>
        <path d="M38 80L28 94" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 76c8-4 12-14 10-22" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={26} y={96} fill={fill} />
        <PeaceHand x={94} y={50} fill={fill} />
      </>
    )
  }
  if (pose === 'ok') {
    return (
      <>
        <path d="M38 80L28 94" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 76c9-6 12-16 8-24" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={26} y={96} fill={fill} />
        <ThumbHand x={92} y={50} fill={fill} />
      </>
    )
  }
  if (pose === 'bow') {
    return (
      <>
        <path d="M40 84L30 100" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M80 84l10 16" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={28} y={102} fill={fill} />
        <Paw x={92} y={102} fill={fill} />
      </>
    )
  }
  if (pose === 'clap') {
    return (
      <>
        <path d="M42 78c-2 8 6 14 14 12" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M78 78c2 8-6 14-14 12" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={52} y={92} fill={fill} r={5.4} />
        <Paw x={68} y={92} fill={fill} r={5.4} />
      </>
    )
  }
  if (pose === 'think') {
    return (
      <>
        <path d="M38 82L30 96" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 78c6 4 8 12 2 16" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={28} y={98} fill={fill} />
        <Paw x={80} y={96} fill={fill} />
      </>
    )
  }
  if (pose === 'stomp') {
    return (
      <>
        <path d="M38 80L26 88" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M82 80l12 8" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Paw x={24} y={90} fill={fill} />
        <Paw x={96} y={90} fill={fill} />
      </>
    )
  }
  return (
    <>
      <path d="M38 82L28 96" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M82 82l10 14" stroke={fill} strokeWidth="8" strokeLinecap="round" fill="none" />
      <Paw x={26} y={98} fill={fill} />
      <Paw x={94} y={98} fill={fill} />
    </>
  )
}

function KuriArt({ mood, pose }) {
  const p = PALETTE.kuri
  return (
    <g>
      <Shadow />
      <circle cx="36" cy="30" r="12.5" fill={p.fur} />
      <circle cx="84" cy="30" r="12.5" fill={p.fur} />
      <circle cx="36" cy="30" r="6.2" fill={p.dark} opacity="0.55" />
      <circle cx="84" cy="30" r="6.2" fill={p.dark} opacity="0.55" />
      <path d="M22 22c8-12 18-4 13 5-7 2-11-1-13-5z" fill={p.leaf} />
      <ellipse cx="60" cy="82" rx="28" ry="24" fill={p.fur} />
      <ellipse cx="60" cy="88" rx="15" ry="11" fill={p.cream} />
      <LimbSet fill={p.fur} pose={pose} />
      <circle cx="60" cy="48" r="26" fill={p.fur} />
      <ellipse cx="60" cy="58" rx="16" ry="12" fill={p.cream} />
      <TomoFace mood={mood} x={60} y={48} nose={p.nose} />
    </g>
  )
}

function UsaArt({ mood, pose }) {
  const p = PALETTE.usa
  return (
    <g>
      <Shadow />
      <ellipse cx="42" cy="26" rx="8" ry="20" fill={p.fur} />
      <ellipse cx="78" cy="24" rx="8" ry="22" fill={p.fur} />
      <ellipse cx="42" cy="28" rx="3.6" ry="13" fill={p.inner} />
      <ellipse cx="78" cy="26" rx="3.6" ry="14" fill={p.inner} />
      <path d="M84 12c6-2 10 4 6 8-5 0-8-4-6-8z" fill={PETAL} />
      <ellipse cx="60" cy="84" rx="26" ry="22" fill={p.fur} />
      <ellipse cx="60" cy="90" rx="14" ry="10" fill="#fff8f2" />
      <LimbSet fill={p.fur} pose={pose} />
      <circle cx="60" cy="50" r="24" fill={p.fur} />
      <TomoFace mood={mood} x={60} y={50} nose={p.nose} />
    </g>
  )
}

function KeruEyes({ mood }) {
  const left = { x: 47, y: 36 }
  const right = { x: 73, y: 36 }
  const bump = (x, y) => (
    <>
      <circle cx={x} cy={y} r="13.5" fill={PALETTE.keru.fur} />
      <circle cx={x} cy={y} r="10.4" fill={PALETTE.keru.eye} />
    </>
  )
  if (mood === 'laugh') {
    return (
      <>
        {bump(left.x, left.y)}
        {bump(right.x, right.y)}
        <path d="M42 37c1.6-4 7.2-4 8.8 0" stroke={INK} strokeWidth="2.3" strokeLinecap="round" fill="none" />
        <path d="M68 37c1.6-4 7.2-4 8.8 0" stroke={INK} strokeWidth="2.3" strokeLinecap="round" fill="none" />
      </>
    )
  }
  if (mood === 'sorry') {
    return (
      <>
        {bump(left.x, left.y)}
        {bump(right.x, right.y)}
        <path d="M42 35c1.6 4 7.2 4 8.8 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M68 35c1.6 4 7.2 4 8.8 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <Drop x={34} y={48} s={0.5} />
      </>
    )
  }
  return (
    <>
      {bump(left.x, left.y)}
      {bump(right.x, right.y)}
      <circle cx={left.x} cy={left.y + 1.4} r="4.6" fill={INK} />
      <circle cx={right.x} cy={right.y + 1.4} r="4.6" fill={INK} />
      <circle cx={left.x + 1.6} cy={left.y - 0.6} r="1.5" fill="#fff" />
      <circle cx={right.x + 1.6} cy={right.y - 0.6} r="1.5" fill="#fff" />
    </>
  )
}

function KeruArt({ mood, pose }) {
  const p = PALETTE.keru
  const tilt = pose === 'bow' ? 'rotate(10 60 64)' : undefined
  return (
    <g transform={tilt}>
      <Shadow />
      <ellipse cx="40" cy="100" rx="10" ry="6.5" fill={p.fur} />
      <ellipse cx="80" cy="100" rx="10" ry="6.5" fill={p.fur} />
      <ellipse cx="60" cy="88" rx="26" ry="18" fill={p.fur} />
      <ellipse cx="60" cy="92" rx="14" ry="10" fill={p.belly} />
      {pose === 'peace' ? (
        <>
          <path d="M38 78L28 90" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M82 74c8-5 12-16 9-24" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <Paw x={26} y={92} fill={p.fur} />
          <PeaceHand x={96} y={48} fill={p.fur} />
        </>
      ) : pose === 'ok' ? (
        <>
          <path d="M38 78L28 90" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M82 74c9-6 12-16 8-24" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <Paw x={26} y={92} fill={p.fur} />
          <ThumbHand x={94} y={48} fill={p.fur} />
        </>
      ) : pose === 'jump' ? (
        <>
          <path d="M38 76L26 60" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M82 76l12-16" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <Paw x={24} y={58} fill={p.fur} />
          <Paw x={96} y={58} fill={p.fur} />
        </>
      ) : (
        <>
          <path d="M38 80L30 90" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <path d="M82 80l8 10" stroke={p.fur} strokeWidth="8" strokeLinecap="round" fill="none" />
          <Paw x={28} y={92} fill={p.fur} />
          <Paw x={92} y={92} fill={p.fur} />
        </>
      )}
      <circle cx="60" cy="52" r="30" fill={p.fur} />
      <ellipse cx="48" cy="42" rx="8" ry="5" fill="#fff" opacity="0.22" />
      <KeruEyes mood={mood} />
      <circle cx="46" cy="52" r="5.2" fill={BLUSH} opacity="0.55" />
      <circle cx="74" cy="52" r="5.2" fill={BLUSH} opacity="0.55" />
      {mood === 'laugh' ? (
        <ellipse cx="60" cy="52" rx="5.2" ry="4.2" fill={MOUTH} />
      ) : mood === 'sorry' ? (
        <path d="M56 53c1.2-2.2 6.8-2.2 8 0" stroke={MOUTH} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M56 51c1.6 3.2 6.4 3.2 8 0" stroke={MOUTH} strokeWidth="2" strokeLinecap="round" fill="none" />
      )}
    </g>
  )
}

function MochiArt({ mood, pose }) {
  const p = PALETTE.mochi
  const sleep = pose === 'sleep'
  return (
    <g transform={sleep ? 'rotate(-22 60 64)' : undefined}>
      <Shadow />
      <circle cx="60" cy="64" r="34" fill={p.fur} />
      <path d="M60 30c-8-14 8-18 12-8 6-8 16 0 8 8-8-2-14 2-20 0z" fill={p.petal} />
      <LimbSet fill={p.dark} pose={sleep ? 'idle' : pose} />
      <TomoFace mood={mood} x={60} y={60} />
      {sleep ? (
        <g fill={p.dark} fontFamily="'M PLUS Rounded 1c','Noto Sans JP',sans-serif" fontWeight="800" fontSize="14">
          <text x="92" y="28">z</text>
          <text x="102" y="18" fontSize="11">z</text>
        </g>
      ) : null}
    </g>
  )
}

function TsukiArt({ mood, pose }) {
  const p = PALETTE.tsuki
  return (
    <g>
      <Shadow />
      <circle cx="60" cy="62" r="32" fill={p.fur} />
      <path d="M78 40c10 8 14 24 6 36-18 4-32-8-34-22 10 2 20-4 28-14z" fill={p.dark} opacity="0.35" />
      <LimbSet fill={p.dark} pose={pose} />
      <TomoFace mood={mood} x={60} y={58} />
      <Sparkle x={88} y={28} s={0.7} fill={p.night} />
      <Sparkle x={28} y={34} s={0.42} fill={GOLD} />
    </g>
  )
}

function DangoBall({ cx, cy, r, fill, face = false, wink = false }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <ellipse cx={cx - r * 0.28} cy={cy - r * 0.28} rx={r * 0.28} ry={r * 0.18} fill="#fff" opacity="0.35" />
      {face ? (
        <>
          {wink ? (
            <path d={`M${cx - 5.5} ${cy - 1}c1.4-3 4.4-3 5.8 0`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          ) : (
            <circle cx={cx - 4.6} cy={cy - 1.2} r="1.7" fill={INK} />
          )}
          <circle cx={cx + 4.6} cy={cy - 1.2} r="1.7" fill={INK} />
          <path d={`M${cx - 3.2} ${cy + 5.2}c1.4 2.6 5 2.6 6.4 0`} stroke={MOUTH} strokeWidth="1.7" strokeLinecap="round" fill="none" />
          <circle cx={cx - 8.2} cy={cy + 4} r="2.4" fill={BLUSH} opacity="0.55" />
          <circle cx={cx + 8.2} cy={cy + 4} r="2.4" fill={BLUSH} opacity="0.55" />
        </>
      ) : null}
    </g>
  )
}

function DangoArt({ pose }) {
  const p = PALETTE.dango
  const heart = pose === 'heart'
  return (
    <g>
      <Shadow />
      <rect x="57.5" y="88" width="5" height="22" rx="2.5" fill={p.stick} />
      <DangoBall cx={60} cy={84} r={15} fill={p.matcha} />
      <DangoBall cx={60} cy={56} r={16} fill={p.cream} face wink={heart} />
      <DangoBall cx={60} cy={28} r={15} fill={p.pink} />
      <path d="M74 16c7-9 14-2 9 6-6-1-10-3-9-6z" fill={PETAL} />
      {heart ? (
        <>
          <Heart x={26} y={52} s={0.95} />
          <Heart x={96} y={44} s={0.62} fill={PETAL} />
        </>
      ) : (
        <>
          <Sparkle x={24} y={34} s={0.62} fill={PETAL} />
          <Sparkle x={96} y={52} s={0.5} />
          <Sparkle x={90} y={20} s={0.38} />
        </>
      )}
    </g>
  )
}

const ART = {
  kuri: KuriArt,
  usa: UsaArt,
  keru: KeruArt,
  mochi: MochiArt,
  tsuki: TsukiArt,
  dango: DangoArt,
}

export function TomoStickerArt({ sticker, portrait = false }) {
  const Art = ART[sticker?.character] || KuriArt
  return (
    <>
      {portrait ? null : (
        <g opacity="0.14" fill={PETAL}>
          <circle cx="16" cy="88" r="9" />
          <circle cx="106" cy="22" r="7" />
        </g>
      )}
      <Art mood={sticker?.mood || 'smile'} pose={sticker?.pose || 'idle'} />
    </>
  )
}
