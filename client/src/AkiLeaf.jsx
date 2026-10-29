import { useId } from 'react'

/** Momiji + ichō SVG for autumn theme (site + chat). */

const TONES = {
  crimson: { light: '#ef4444', mid: '#b91c1c', dark: '#7f1d1d' },
  scarlet: { light: '#fb923c', mid: '#ea580c', dark: '#9a3412' },
  gold: { light: '#fde047', mid: '#eab308', dark: '#a16207' },
  amber: { light: '#fcd34d', mid: '#f59e0b', dark: '#b45309' },
}

/** Stylized Japanese maple (palmatum) — deep lobes, not a star/triangle. */
function MomijiShape({ tone, gid }) {
  const c = TONES[tone] || TONES.crimson
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="30%" y1="5%" x2="70%" y2="95%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gid})`}
        d="M32 5
           C31 11 27 13 23 15
           C26 17 27 20 26 23
           C23 21 20 22 17 25
           C19 25 21 28 21 31
           C18 30 16 33 15 37
           C18 36 20 38 22 41
           C19 42 18 45 19 48
           C22 45 25 44 28 46
           C27 43 28 40 30 38
           L32 34
           L34 38
           C36 40 37 43 36 46
           C39 44 42 45 45 48
           C46 45 45 42 42 41
           C44 38 46 36 49 37
           C48 33 46 30 43 31
           C43 28 45 25 47 25
           C44 22 41 21 38 23
           C37 20 38 17 41 15
           C37 13 33 11 32 5 Z"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
        d="M32 16 V46"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.45"
        d="M32 22 L26 28 M32 24 L38 29 M32 30 L24 34 M32 32 L40 35"
      />
    </>
  )
}

/** Ichō (ginkgo) — wide fan, central slit, soft waves at the top edge. */
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
        d="M32 5
           L27 11
           C17 16 13 26 14 36
           C15 44 19 49 25 51
           C28 52 30 52 32 52
           C34 52 36 52 39 51
           C45 49 49 44 50 36
           C51 26 47 16 37 11
           L32 5 Z"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
        d="M32 10 V48"
      />
      <path
        fill="none"
        stroke={c.dark}
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.35"
        d="M32 14 C26 20 24 28 25 36 M32 14 C38 20 40 28 39 36"
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
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={style}
      aria-hidden="true"
    >
      {variant === 'ginkgo' ? <GinkgoShape tone={tone} gid={gid} /> : <MomijiShape tone={tone} gid={gid} />}
    </svg>
  )
}

/** Bright golden tsukimi moon — no crater spots, soft luminous halo. */
export function AkiTsukimiMoon({ className = '', size = 72, uid: uidProp = 'aki' }) {
  const reactUid = useId().replace(/:/g, '')
  const uid = `${uidProp}-${reactUid}`
  return (
    <svg
      className={`aki-tsukimi-moon ${className}`.trim()}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255, 248, 210, 0.55)" />
          <stop offset="70%" stopColor="rgba(255, 220, 120, 0.12)" />
          <stop offset="100%" stopColor="rgba(255, 200, 80, 0)" />
        </radialGradient>
        <radialGradient id={`${uid}-disc`} cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#fffef5" />
          <stop offset="28%" stopColor="#fff3b0" />
          <stop offset="62%" stopColor="#ffd54a" />
          <stop offset="100%" stopColor="#f5b820" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="44" fill={`url(#${uid}-glow)`} />
      <circle cx="48" cy="48" r="36" fill={`url(#${uid}-disc)`} />
      <circle
        cx="48"
        cy="48"
        r="37"
        fill="none"
        stroke="rgba(255, 250, 220, 0.55)"
        strokeWidth="1.5"
      />
      <ellipse cx="40" cy="36" rx="10" ry="7" fill="rgba(255, 255, 250, 0.35)" />
    </svg>
  )
}
