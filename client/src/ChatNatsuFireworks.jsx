import { useEffect, useState } from 'react'
import './natsu-atmosphere.css'

/** Richer matsuri palettes for in-chat hanabi. */
const CHAT_BURST_COLORS = [
  ['#ff3b2e', '#ffd24a', '#fff7d6'],
  ['#ff6b9d', '#ffc2d4', '#ffe8f0'],
  ['#3b82f6', '#7dd3fc', '#e0f2fe'],
  ['#fbbf24', '#fb923c', '#fff7ed'],
  ['#a855f7', '#e879f9', '#f5d0fe'],
  ['#22d3ee', '#67e8f9', '#ecfeff'],
  ['#4ade80', '#bbf7d0', '#f0fdf4'],
  ['#fb7185', '#fda4af', '#fff1f2'],
  ['#f97316', '#fdba74', '#ffedd5'],
  ['#06b6d4', '#67e8f9', '#cffafe'],
  ['#e11d48', '#fb7185', '#ffe4e6'],
  ['#8b5cf6', '#c4b5fd', '#ede9fe'],
]

const KINDS = ['kiku', 'yanagi', 'botan', 'senrin']

function makeChatRays(kind) {
  const baseCount = kind === 'yanagi' ? 10 : kind === 'botan' ? 12 : kind === 'senrin' ? 11 : 12
  const rayCount = baseCount + Math.floor(Math.random() * 3) - 1
  const jitter = 7 + Math.random() * 8
  return Array.from({ length: Math.max(8, rayCount) }, (_, i) => {
    const base = (360 / rayCount) * i
    const angle = base + (Math.random() - 0.5) * jitter + (kind === 'senrin' ? i * 1.6 : 0)
    const length = kind === 'yanagi'
      ? 40 + Math.random() * 28
      : kind === 'botan'
        ? 22 + Math.random() * 18
        : 28 + Math.random() * 22
    return {
      angle,
      length,
      tipDelay: 0.04 + Math.random() * 0.1,
      rayDelay: Math.random() * 0.08,
    }
  })
}

function makeChatBurst(seq) {
  const kind = KINDS[Math.floor(Math.random() * KINDS.length)]
  const colors = CHAT_BURST_COLORS[Math.floor(Math.random() * CHAT_BURST_COLORS.length)]
  return {
    id: `chat-fw-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    // Keep bursts inside the panel, clear of header/composer edges.
    left: 10 + Math.random() * 78,
    top: 14 + Math.random() * 58,
    delay: Math.random() * 0.2,
    scale: 0.68 + Math.random() * 0.28,
    rise: 16 + Math.random() * 20,
    colors,
    rays: makeChatRays(kind),
  }
}

/**
 * Same ray-burst hanabi as the main natsu atmosphere, sized for the chat panel.
 * Each burst spawns at a fresh random spot (not fixed placements).
 */
export default function ChatNatsuFireworks() {
  const [bursts, setBursts] = useState([])

  useEffect(() => {
    let seq = 0
    let cancelled = false
    const timeoutIds = []

    const spawn = () => {
      if (cancelled) return
      seq += 1
      const next = makeChatBurst(seq)
      setBursts((prev) => [...prev, next].slice(-4))
      // Remove after the one-shot animation finishes.
      timeoutIds.push(window.setTimeout(() => {
        setBursts((prev) => prev.filter((item) => item.id !== next.id))
      }, 4200))
    }

    spawn()
    timeoutIds.push(window.setTimeout(spawn, 1800))
    const intervalId = window.setInterval(() => {
      spawn()
    }, 4800)

    return () => {
      cancelled = true
      timeoutIds.forEach((id) => window.clearTimeout(id))
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <div className="hana-chat-natsu-hanabi" aria-hidden="true">
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className={`natsu-firework hana-chat-firework is-${burst.kind}`}
          style={{
            left: `${burst.left}%`,
            top: `${burst.top}%`,
            animationDelay: `${burst.delay}s`,
            '--fw-scale': burst.scale,
            '--fw-rise': `${burst.rise}px`,
            '--fw-c0': burst.colors[0],
            '--fw-c1': burst.colors[1],
            '--fw-c2': burst.colors[2],
          }}
        >
          <i className="natsu-firework-trail" style={{ animationDelay: `${burst.delay}s` }} />
          <i className="natsu-firework-flash" style={{ animationDelay: `${burst.delay}s` }} />
          <i className="natsu-firework-core" style={{ animationDelay: `${burst.delay}s` }} />
          <i className="natsu-firework-bloom" style={{ animationDelay: `${burst.delay}s` }} />
          {burst.rays.map((ray, index) => (
            <i
              key={`${burst.id}-r${index}`}
              className="natsu-firework-ray"
              style={{
                '--ray-angle': `${ray.angle}deg`,
                '--ray-len': `${ray.length}px`,
                animationDelay: `${burst.delay + 0.28 + ray.rayDelay}s`,
              }}
            >
              <b
                className="natsu-firework-spark"
                style={{ animationDelay: `${burst.delay + 0.35 + ray.tipDelay}s` }}
              />
            </i>
          ))}
        </span>
      ))}
    </div>
  )
}
