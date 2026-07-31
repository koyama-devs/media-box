import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHAT_DEFAULT_REACTION } from './firebase'

export const CHAT_PARTY_REACTION = '🎉'

const listeners = new Set()
let seq = 0

function emit(payload) {
  listeners.forEach((fn) => {
    try {
      fn(payload)
    } catch {
      /* ignore */
    }
  })
}

/**
 * Full-screen cherry-blossom burst (flower reaction).
 * @param {{ x?: number, y?: number, count?: number }} [opts]
 */
export function triggerFlowerRain(opts = {}) {
  const emoji = String(opts.emoji || CHAT_DEFAULT_REACTION).trim() || CHAT_DEFAULT_REACTION
  emit({
    id: ++seq,
    kind: 'flower',
    emoji,
    x: Number.isFinite(opts.x) ? opts.x : window.innerWidth * 0.5,
    y: Number.isFinite(opts.y) ? opts.y : window.innerHeight * 0.45,
    count: Math.min(48, Math.max(12, Number(opts.count) || 28)),
    at: Date.now(),
  })
}

/**
 * Soft party confetti for 🎉 celebration reaction.
 * @param {{ x?: number, y?: number, count?: number }} [opts]
 */
export function triggerPartyBurst(opts = {}) {
  emit({
    id: ++seq,
    kind: 'party',
    x: Number.isFinite(opts.x) ? opts.x : window.innerWidth * 0.5,
    y: Number.isFinite(opts.y) ? opts.y : window.innerHeight * 0.42,
    count: Math.min(40, Math.max(10, Number(opts.count) || 22)),
    at: Date.now(),
  })
}

function subscribeFx(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const PARTY_COLORS = [
  '#ff6b8a',
  '#ffd166',
  '#06d6a0',
  '#4cc9f0',
  '#c77dff',
  '#ff9f1c',
  '#f72585',
]

function makeFlowerFx(burst) {
  const reduced = prefersReducedMotion()
  const fallN = reduced ? 6 : burst.count
  const burstN = reduced ? 4 : Math.max(8, Math.round(burst.count * 0.45))
  const primary = String(burst.emoji || CHAT_DEFAULT_REACTION).trim() || CHAT_DEFAULT_REACTION
  const glyphs = primary === '🌸'
    ? [primary, '💮', '🌸', '✿']
    : primary === '❤️' || primary === '💖'
      ? [primary, '💕', '💗', '❤️']
      : [primary, primary, '✨', primary]

  const fall = Array.from({ length: fallN }, (_, i) => {
    const left = Math.random() * 100
    const delay = Math.random() * 0.55
    const dur = reduced ? 1.4 : 2.4 + Math.random() * 2.2
    const size = 0.85 + Math.random() * 1.35
    const drift = (Math.random() - 0.5) * 140
    const spin = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 420)
    const sway = 12 + Math.random() * 28
    return {
      id: `f-${burst.id}-${i}`,
      glyph: glyphs[i % glyphs.length],
      className: 'hana-flower-rain-petal is-fall',
      style: {
        left: `${left}%`,
        fontSize: `${size}rem`,
        animationDelay: `${delay}s`,
        animationDuration: `${dur}s`,
        '--petal-drift': `${drift}px`,
        '--petal-spin': `${spin}deg`,
        '--petal-sway': `${sway}px`,
      },
    }
  })

  const spray = Array.from({ length: burstN }, (_, i) => {
    const angle = (Math.PI * 2 * i) / burstN + (Math.random() - 0.5) * 0.4
    const dist = reduced ? 40 + Math.random() * 50 : 70 + Math.random() * 140
    const bx = Math.cos(angle) * dist
    const by = Math.sin(angle) * dist - 20 - Math.random() * 40
    const delay = Math.random() * 0.08
    const dur = reduced ? 0.7 : 0.85 + Math.random() * 0.55
    const size = 1 + Math.random() * 1.2
    const spin = (Math.random() > 0.5 ? 1 : -1) * (90 + Math.random() * 280)
    return {
      id: `b-${burst.id}-${i}`,
      glyph: glyphs[(i + 1) % glyphs.length],
      className: 'hana-flower-rain-petal is-burst',
      style: {
        left: `${burst.x}px`,
        top: `${burst.y}px`,
        fontSize: `${size}rem`,
        animationDelay: `${delay}s`,
        animationDuration: `${dur}s`,
        '--burst-x': `${bx}px`,
        '--burst-y': `${by}px`,
        '--petal-spin': `${spin}deg`,
      },
    }
  })

  return {
    reduced,
    ttl: reduced ? 1600 : 4200,
    flashClass: 'hana-flower-rain-flash',
    pieces: [...spray, ...fall],
  }
}

function makePartyFx(burst) {
  const reduced = prefersReducedMotion()
  const emojiN = reduced ? 5 : Math.max(8, Math.round(burst.count * 0.4))
  const confettiN = reduced ? 8 : burst.count
  const glyphs = [CHAT_PARTY_REACTION, '✨', '🎊', '🥳', '⭐']

  const emojis = Array.from({ length: emojiN }, (_, i) => {
    const angle = -Math.PI * 0.85 + (Math.PI * 1.7 * i) / Math.max(1, emojiN - 1)
    const dist = reduced ? 50 + Math.random() * 40 : 90 + Math.random() * 120
    const bx = Math.cos(angle) * dist
    const by = Math.sin(angle) * dist * 0.55 - 30 - Math.random() * 50
    return {
      id: `pe-${burst.id}-${i}`,
      glyph: glyphs[i % glyphs.length],
      className: 'hana-party-piece is-emoji',
      style: {
        left: `${burst.x}px`,
        top: `${burst.y}px`,
        fontSize: `${0.95 + Math.random() * 0.7}rem`,
        animationDelay: `${Math.random() * 0.1}s`,
        animationDuration: `${reduced ? 0.75 : 0.95 + Math.random() * 0.45}s`,
        '--burst-x': `${bx}px`,
        '--burst-y': `${by}px`,
        '--petal-spin': `${(Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 200)}deg`,
      },
    }
  })

  const confetti = Array.from({ length: confettiN }, (_, i) => {
    const fromLeft = i % 2 === 0
    const left = fromLeft
      ? Math.random() * 28
      : 72 + Math.random() * 28
    const color = PARTY_COLORS[i % PARTY_COLORS.length]
    const w = 5 + Math.random() * 5
    const h = 8 + Math.random() * 8
    const drift = (fromLeft ? 1 : -1) * (40 + Math.random() * 90)
    const spin = (Math.random() > 0.5 ? 1 : -1) * (260 + Math.random() * 420)
    return {
      id: `pc-${burst.id}-${i}`,
      glyph: null,
      className: 'hana-party-piece is-confetti',
      style: {
        left: `${left}%`,
        width: `${w}px`,
        height: `${h}px`,
        background: color,
        borderRadius: Math.random() > 0.5 ? '1px' : '50%',
        animationDelay: `${Math.random() * 0.35}s`,
        animationDuration: `${reduced ? 1.2 : 1.8 + Math.random() * 1.4}s`,
        '--petal-drift': `${drift}px`,
        '--petal-spin': `${spin}deg`,
        '--petal-sway': `${10 + Math.random() * 18}px`,
      },
    }
  })

  return {
    reduced,
    ttl: reduced ? 1400 : 3200,
    flashClass: 'hana-party-flash',
    pieces: [...emojis, ...confetti],
  }
}

function buildFx(burst) {
  return burst.kind === 'party' ? makePartyFx(burst) : makeFlowerFx(burst)
}

/**
 * Portal overlay — mount once near chat roots.
 */
export default function FlowerRainLayer() {
  const [bursts, setBursts] = useState([])

  useEffect(() => subscribeFx((burst) => {
    const fx = buildFx(burst)
    setBursts((prev) => [...prev.slice(-2), { ...burst, ...fx }])
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id))
    }, fx.ttl)
  }), [])

  if (!bursts.length || typeof document === 'undefined') return null

  return createPortal(
    <div className="hana-flower-rain" aria-hidden="true">
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className={`hana-flower-rain-burst${burst.kind === 'party' ? ' is-party' : ''}`}
        >
          <span
            className={burst.flashClass}
            style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
          />
          {burst.pieces.map((p) => (
            <span key={p.id} className={p.className} style={p.style}>
              {p.glyph}
            </span>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  )
}
