import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import AkiLeaf, { AkiTsukimiMoon } from './AkiLeaf'
import './aki-atmosphere.css'

const LEAF_TONES = ['crimson', 'scarlet', 'gold', 'amber']
const LEAF_VARIANTS = ['momiji', 'momiji', 'momiji', 'ginkgo']

const FALLING = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  left: `${(i * 5.7 + 2) % 98}%`,
  delay: `${-(i * 1.05 + (i % 3) * 0.4)}s`,
  dur: `${14 + (i % 7) * 2.4}s`,
  sway: `${3 + (i % 5)}s`,
  tone: LEAF_TONES[i % LEAF_TONES.length],
  variant: LEAF_VARIANTS[i % LEAF_VARIANTS.length],
  size: 24 + (i % 4) * 8,
  drift: i % 2 === 0 ? 1 : -1,
}))

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function AkiAtmosphere({ active }) {
  const reduced = useMemo(
    () => (typeof window === 'undefined' ? false : prefersReducedMotion()),
    [],
  )

  if (!active || typeof document === 'undefined') return null

  const reducedClass = reduced ? ' is-reduced' : ''

  return (
    <>
      {createPortal(
        <div className={`aki-atmosphere aki-atmosphere--back${reducedClass}`} aria-hidden="true">
          <div className="aki-atmosphere-sky" />
          <div className="aki-atmosphere-dusk" />
          <div className="aki-atmosphere-haze" />
          <div className="aki-atmosphere-horizon" />
          <div className="aki-atmosphere-ground" />
        </div>,
        document.body,
      )}

      {createPortal(
        <div className={`aki-atmosphere aki-atmosphere--moon${reducedClass}`} aria-hidden="true">
          <AkiTsukimiMoon className="aki-atmosphere-moon-stack" size={112} />
        </div>,
        document.body,
      )}

      {createPortal(
        <div className={`aki-atmosphere aki-atmosphere--front${reducedClass}`} aria-hidden="true">
          {!reduced
            ? FALLING.map((leaf) => (
              <span
                key={leaf.id}
                className="aki-falling-leaf"
                style={{
                  left: leaf.left,
                  animationDuration: `${leaf.dur}, ${leaf.sway}`,
                  animationDelay: `${leaf.delay}, ${leaf.delay}`,
                  '--aki-drift': leaf.drift,
                }}
              >
                <AkiLeaf variant={leaf.variant} tone={leaf.tone} size={leaf.size} />
              </span>
            ))
            : null}
        </div>,
        document.body,
      )}
    </>
  )
}
