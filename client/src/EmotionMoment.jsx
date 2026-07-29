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
    id: 'hearts',
    emoji: '💖',
    label: 'ハート雨',
    caption: '大好き',
    theme: 'rose',
    reaction: '❤️',
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

function MotifField({ theme }) {
  if (theme === 'rose') {
    return (
      <div className="hana-emotion-motif is-hearts" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="hana-emotion-motif-bit"
            style={{
              left: `${(i * 17 + 7) % 100}%`,
              animationDelay: `${(i % 7) * 0.12}s`,
              animationDuration: `${2.2 + (i % 5) * 0.25}s`,
              fontSize: `${0.7 + (i % 4) * 0.25}rem`,
            }}
          >
            {i % 3 === 0 ? '💖' : i % 3 === 1 ? '❤️' : '💕'}
          </span>
        ))}
      </div>
    )
  }
  if (theme === 'sky') {
    return (
      <div className="hana-emotion-motif is-wave" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="hana-emotion-motif-bit"
            style={{
              left: `${8 + i * 9}%`,
              top: `${18 + (i % 4) * 16}%`,
              animationDelay: `${i * 0.08}s`,
            }}
          >
            👋
          </span>
        ))}
      </div>
    )
  }
  if (theme === 'gold') {
    return (
      <div className="hana-emotion-motif is-sparkles" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="hana-emotion-motif-bit"
            style={{
              left: `${(i * 13 + 5) % 96}%`,
              top: `${12 + (i % 6) * 12}%`,
              animationDelay: `${i * 0.06}s`,
            }}
          >
            {i % 2 ? '✨' : '⭐'}
          </span>
        ))}
      </div>
    )
  }
  if (theme === 'ember') {
    return (
      <div className="hana-emotion-motif is-ember" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="hana-emotion-motif-bit"
            style={{
              left: `${10 + (i * 7) % 80}%`,
              bottom: `${8 + (i % 5) * 10}%`,
              animationDelay: `${i * 0.07}s`,
            }}
          >
            {i % 2 ? '🔥' : '💥'}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="hana-emotion-motif is-sparkles" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="hana-emotion-motif-bit"
          style={{
            left: `${(i * 11 + 3) % 97}%`,
            top: `${10 + (i % 7) * 11}%`,
            animationDelay: `${i * 0.05}s`,
          }}
        >
          ✨
        </span>
      ))}
    </div>
  )
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
      const ttl = prefersReducedMotion() ? 1400 : 2400
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
