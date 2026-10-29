import { useId } from 'react'
import './aki-moon.css'

/** Momiji + ichō SVG for autumn theme (site + chat). */

const TONES = {
  crimson: { light: '#ef4444', mid: '#b91c1c', dark: '#7f1d1d' },
  scarlet: { light: '#fb923c', mid: '#ea580c', dark: '#9a3412' },
  gold: { light: '#fde047', mid: '#eab308', dark: '#a16207' },
  amber: { light: '#fcd34d', mid: '#f59e0b', dark: '#b45309' },
}

/** Japanese maple (momiji) — palmate lobes with serrated silhouette. */
function MomijiShape({ tone, gid }) {
  const c = TONES[tone] || TONES.crimson
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="35%" y1="0%" x2="65%" y2="100%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="50%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gid})`}
        d="M50 4
           C46 14 38 16 32 22
           C38 20 42 26 41 32
           C36 28 30 30 24 36
           C30 34 34 40 33 46
           C28 42 22 44 18 50
           C24 48 30 52 34 58
           C30 54 26 58 24 64
           C30 60 38 60 44 66
           C42 60 44 54 50 50
           C56 54 58 60 56 66
           C62 60 70 60 76 64
           C74 58 70 54 66 58
           C70 52 76 48 82 50
           C78 44 72 42 67 46
           C66 40 70 34 76 36
           C70 30 64 28 59 32
           C58 26 62 20 68 22
           C62 16 54 14 50 4 Z"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.8"
        d="M50 18 V66"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity="0.5"
        d="M50 24 L42 30 M50 26 L58 31 M50 34 L38 38 M50 36 L62 40 M50 44 L40 48 M50 46 L60 50"
      />
    </>
  )
}

/** Ichō (ginkgo) — fan leaf with central cleft at the top. */
function GinkgoShape({ tone, gid }) {
  const c = TONES[tone] || TONES.gold
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gid})`}
        d="M50 6
           L46 12
           C34 18 28 30 28 42
           C28 52 32 62 38 68
           C42 72 46 74 50 74
           C54 74 58 72 62 68
           C68 62 72 52 72 42
           C72 30 66 18 54 12
           L50 6 Z"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
        d="M50 10 V70"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.4"
        d="M50 16 C42 24 38 34 38 44 M50 16 C58 24 62 34 62 44"
      />
    </>
  )
}

export default function AkiLeaf({
  variant = 'momiji',
  tone = 'crimson',
  className = '',
  style,
  size = 22,
}) {
  const uid = useId().replace(/:/g, '')
  const gid = `aki-leaf-${uid}`
  return (
    <svg
      className={`aki-leaf-svg ${className}`.trim()}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={style}
      aria-hidden="true"
    >
      {variant === 'ginkgo' ? <GinkgoShape tone={tone} gid={gid} /> : <MomijiShape tone={tone} gid={gid} />}
    </svg>
  )
}

/** Luminous tsukimi moon (CSS halos — soft 月見, not cartoon SVG). */
export function AkiTsukimiMoon({ className = '', size = 96 }) {
  return (
    <div
      className={`aki-tsukimi-moon-stack ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="aki-moon-aura is-outer" />
      <span className="aki-moon-aura is-mid" />
      <span className="aki-moon-aura is-inner" />
      <span className="aki-moon-disc" />
      <span className="aki-moon-shimmer" />
    </div>
  )
}
