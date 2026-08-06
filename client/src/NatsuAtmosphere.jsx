import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import NatsuKingyo from './NatsuKingyo'
import './natsu-atmosphere.css'

/** Brighter Japanese summer-night palettes (hanabi + matsuri). */
const BURST_COLORS = [
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

const BURST_KINDS = ['kiku', 'yanagi', 'botan', 'senrin']

const TORO = [
  { id: 't1', left: 22, delay: 0, dur: 20, size: 1.1 },
  { id: 't2', left: 58, delay: -5, dur: 22, size: 1.05 },
]

const HOTARU = Array.from({ length: 4 }, (_, i) => ({
  id: `h${i}`,
  left: 3 + ((i * 19) % 94),
  top: 8 + ((i * 17) % 62),
  delay: -(i * 0.55),
  dur: 2.8 + (i % 5) * 0.45,
}))

const CHOUCHIN = [
  { id: 'c1', left: 14, top: 5, hue: 'ember' },
  { id: 'c2', left: 86, top: 6, hue: 'gold' },
]

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function isChatOpen() {
  try {
    return document.documentElement.dataset.hanaChatOpen === '1'
  } catch {
    return false
  }
}

function makeBurst(id) {
  const palette = BURST_COLORS[id % BURST_COLORS.length]
  const kind = BURST_KINDS[id % BURST_KINDS.length]
  const baseCount = kind === 'yanagi' ? 18 : kind === 'botan' ? 28 : kind === 'senrin' ? 22 : 26
  const rayCount = baseCount + Math.floor(Math.random() * 5) - 2
  const jitter = 8 + Math.random() * 10
  const rays = Array.from({ length: rayCount }, (_, i) => {
    const base = (360 / rayCount) * i
    const angle = base + (Math.random() - 0.5) * jitter + (kind === 'senrin' ? i * 1.8 : 0)
    const length = kind === 'yanagi'
      ? 52 + Math.random() * 36
      : kind === 'botan'
        ? 28 + Math.random() * 22
        : 34 + Math.random() * 28
    return {
      angle,
      length,
      tipDelay: 0.04 + Math.random() * 0.12,
      rayDelay: Math.random() * 0.1,
    }
  })
  return {
    id,
    kind,
    left: 8 + Math.random() * 84,
    top: 8 + Math.random() * 40,
    delay: Math.random() * 0.25,
    scale: 0.95 + Math.random() * 1.05,
    rise: 28 + Math.random() * 36,
    colors: palette,
    rays,
  }
}

/**
 * Japanese summer night: back wash + bright lanterns + dimmer front props.
 */
export default function NatsuAtmosphere({ active = false }) {
  const [bursts, setBursts] = useState([])
  const reduced = useMemo(
    () => (typeof window === 'undefined' ? false : prefersReducedMotion()),
    [],
  )

  useEffect(() => {
    if (!active) {
      setBursts([])
      return undefined
    }
    if (reduced) {
      setBursts([makeBurst(1), makeBurst(2), makeBurst(3)])
      return undefined
    }

    let seq = 0
    const spawn = () => {
      if (isChatOpen()) {
        setBursts((prev) => (prev.length ? [] : prev))
        return
      }
      seq += 1
      const next = makeBurst(seq)
      setBursts((prev) => {
        const merged = [...prev, next]
        return merged.slice(-4)
      })
    }

    spawn()
    const timer = window.setInterval(spawn, 5600)
    return () => window.clearInterval(timer)
  }, [active, reduced])

  if (!active || typeof document === 'undefined') return null

  const reducedClass = reduced ? ' is-reduced' : ''

  return (
    <>
      {createPortal(
        <div className={`natsu-atmosphere natsu-atmosphere--back${reducedClass}`} aria-hidden="true">
          <div className="natsu-atmosphere-sky" />
          <div className="natsu-atmosphere-milkyway" />
          <div className="natsu-atmosphere-horizon" />
          <div className="natsu-atmosphere-river" />
          <div className="natsu-atmosphere-sparks" />
        </div>,
        document.body,
      )}

      {/* Bright top lanterns — not dimmed by front-layer opacity */}
      {createPortal(
        <div className={`natsu-atmosphere natsu-atmosphere--lanterns${reducedClass}`} aria-hidden="true">
          {CHOUCHIN.map((item) => (
            <span
              key={item.id}
              className={`natsu-chouchin is-${item.hue}`}
              style={{ left: `${item.left}%`, top: `${item.top}%` }}
            >
              <i className="natsu-chouchin-cord" />
              <i className="natsu-chouchin-body" />
              <i className="natsu-chouchin-glow" />
            </span>
          ))}
        </div>,
        document.body,
      )}

      {createPortal(
        <div className={`natsu-atmosphere natsu-atmosphere--front${reducedClass}`} aria-hidden="true">
          {HOTARU.map((bug) => (
            <span
              key={bug.id}
              className="natsu-hotaru"
              style={{
                left: `${bug.left}%`,
                top: `${bug.top}%`,
                animationDelay: `${bug.delay}s`,
                animationDuration: `${bug.dur}s`,
              }}
            />
          ))}

          {bursts.map((burst) => (
            <span
              key={burst.id}
              className={`natsu-firework is-${burst.kind}`}
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
              <i className="natsu-firework-trail" />
              <i className="natsu-firework-flash" />
              <i className="natsu-firework-core" />
              <i className="natsu-firework-bloom" />
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

          <div className="natsu-goldfish-lane">
            <span className="natsu-goldfish is-a"><NatsuKingyo gradientId="atm-a" /></span>
            <span className="natsu-goldfish is-b"><NatsuKingyo gradientId="atm-b" /></span>
          </div>

          <div className="natsu-toro-river">
            {TORO.map((lantern) => (
              <span
                key={lantern.id}
                className="natsu-toro"
                style={{
                  left: `${lantern.left}%`,
                  animationDelay: `${lantern.delay}s`,
                  animationDuration: `${lantern.dur}s`,
                  '--toro-scale': lantern.size,
                }}
              >
                <i className="natsu-toro-flame" />
                <i className="natsu-toro-body" />
                <i className="natsu-toro-base" />
                <i className="natsu-toro-ripple" />
              </span>
            ))}
          </div>

          <div className="natsu-furin is-left" />
          <div className="natsu-furin is-right" />
          <div className="natsu-asagao is-left" />
          <div className="natsu-asagao is-right" />
        </div>,
        document.body,
      )}
    </>
  )
}
