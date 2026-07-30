/**
 * Chat sticker sets: はな (feminine) and かいと (masculine).
 *
 * Geometry is intentionally borrowed from `assets/hanachan.svg` (same 120x140
 * coordinate space, cropped to the head via viewBox) so every sticker reads as
 * the same character. Flat fills only — no gradients or <defs> — because these
 * render many times per screen and duplicated element ids would collide.
 */

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

/** Picker groups. `label` is the tab caption. */
export const HANA_STICKER_SETS = [
  { id: 'hana', label: 'はな', items: HANA_SET.map((item) => ({ ...item, set: 'hana' })) },
  { id: 'kaito', label: 'かいと', items: KAITO_SET.map((item) => ({ ...item, set: 'kaito' })) },
]

/** Every sticker across both sets. `label` doubles as the message text fallback. */
export const HANA_STICKERS = HANA_STICKER_SETS.flatMap((set) => set.items)

const STICKER_BY_ID = Object.fromEntries(HANA_STICKERS.map((item) => [item.id, item]))

export function isHanaSticker(id) {
  return Boolean(STICKER_BY_ID[String(id || '')])
}

export function hanaStickerLabel(id) {
  return STICKER_BY_ID[String(id || '')]?.label || ''
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

function Sparkle({ x, y, s = 1, fill = GOLD, opacity = 1 }) {
  return (
    <path
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
      <CalmEyes />
      <Cheeks r="8.5" opacity="0.7" />
      <g stroke={BLUSH} strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M35 64h10" />
        <path d="M35 68h10" />
        <path d="M75 64h10" />
        <path d="M75 68h10" />
      </g>
      <path d="M55 70c1.6 2.6 3.2-2.6 5 0s3.4 2.6 5 0" stroke={LIP} strokeWidth="2" strokeLinecap="round" fill="none" />
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
}

/**
 * One sticker as inline SVG. Works for both sets — the id decides the character.
 * @param {{ id: string, size?: number, title?: string, className?: string }} props
 */
export default function HanaSticker({ id, size = 64, title, className = '' }) {
  const key = String(id || '')
  const isKaito = STICKER_BY_ID[key]?.set === 'kaito'
  const Face = isKaito ? KAITO_FACES[key] : FACES[key]
  if (!Face) return null
  const Head = isKaito ? KaitoHead : HanaHead
  const label = title || hanaStickerLabel(id)
  return (
    <svg
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      className={`hana-sticker ${className}`.trim()}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      <Head />
      <Face />
    </svg>
  )
}
