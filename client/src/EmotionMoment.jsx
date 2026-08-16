import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const listeners = new Set()
let seq = 0

/** Special cinematic emotion shortcuts (menu). */
export const EMOTION_MOMENTS = [
  {
    id: 'highfive',
    emoji: '🙌',
    label: 'ハイタッチ',
    caption: 'ハイタッチ！',
    theme: 'gold',
    reaction: '🙌',
  },
  {
    id: 'wave',
    emoji: '👋',
    label: '手を振る',
    caption: 'はーい！',
    theme: 'sky',
    reaction: '👋',
  },
  {
    id: 'kiss',
    emoji: '💋',
    label: 'ちゅっ',
    caption: 'ちゅっ♡',
    theme: 'kiss',
    reaction: '💋',
  },
  {
    id: 'cheer',
    emoji: '🔥',
    label: 'ファイト',
    caption: 'がんばれ！',
    theme: 'ember',
    reaction: '🔥',
  },
  {
    id: 'sparkle',
    emoji: '✨',
    label: 'キラキラ',
    caption: 'すてき！',
    theme: 'spark',
    reaction: '✨',
  },
]

const MOMENT_BY_ID = Object.fromEntries(EMOTION_MOMENTS.map((m) => [m.id, m]))

function emit(payload) {
  listeners.forEach((fn) => {
    try {
      fn(payload)
    } catch {
      /* ignore */
    }
  })
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Play a full-screen emotion moment overlay.
 * @param {string | { id: string }} momentOrId
 */
export function triggerEmotionMoment(momentOrId) {
  const id = typeof momentOrId === 'string' ? momentOrId : momentOrId?.id
  const def = MOMENT_BY_ID[id]
  if (!def) return
  emit({
    uid: ++seq,
    ...def,
    at: Date.now(),
  })
}

function subscribeEmotionMoment(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function BurstBits({ count = 8, glyph = '♥' }) {
  return (
    <div className="hana-emotion-motif is-burst" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="hana-emotion-burst-bit"
          style={{
            '--deg': `${Math.round((360 / count) * i)}deg`,
            animationDelay: `${(i % 6) * 0.05}s`,
          }}
        >
          {glyph}
        </span>
      ))}
    </div>
  )
}

function MotifField({ theme }) {
  if (theme === 'kiss' || theme === 'rose') return <BurstBits count={10} glyph="♥" />
  if (theme === 'sky') return <BurstBits count={8} glyph="●" />
  if (theme === 'ember') return <BurstBits count={9} glyph="●" />
  return <BurstBits count={12} glyph="✦" />
}

/**
 * Portal overlay for cinematic emotion moments.
 */
export default function EmotionMomentLayer() {
  const [active, setActive] = useState(null)

  useEffect(() => {
    let clearTimer = null
    const unsub = subscribeEmotionMoment((moment) => {
      if (clearTimer) window.clearTimeout(clearTimer)
      const ttl = prefersReducedMotion() ? 900 : 1500
      setActive(moment)
      clearTimer = window.setTimeout(() => {
        setActive((cur) => (cur?.uid === moment.uid ? null : cur))
        clearTimer = null
      }, ttl)
    })
    return () => {
      unsub()
      if (clearTimer) window.clearTimeout(clearTimer)
    }
  }, [])

  if (!active || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`hana-emotion-moment is-${active.theme}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="hana-emotion-moment-veil" />
      <div className="hana-emotion-moment-pattern" />
      <MotifField theme={active.theme} />
      <div className="hana-emotion-moment-stage">
        <span className="hana-emotion-moment-glow" />
        <span className="hana-emotion-moment-icon">{active.emoji}</span>
        <p className="hana-emotion-moment-caption">{active.caption}</p>
      </div>
    </div>,
    document.body,
  )
}
