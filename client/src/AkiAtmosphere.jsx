import { createPortal } from 'react-dom'
import './aki-atmosphere.css'

const LEAVES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${(i * 7.1 + 3) % 96}%`,
  delay: `${-(i * 1.3)}s`,
  dur: `${13 + (i % 6) * 2.2}s`,
  hue: i % 3,
}))

export default function AkiAtmosphere({ active }) {
  if (!active || typeof document === 'undefined') return null
  return createPortal(
    <div className="aki-atmosphere" aria-hidden="true">
      <div className="aki-atmosphere-sky" />
      <div className="aki-atmosphere-moon" />
      <div className="aki-atmosphere-susuki" />
      {LEAVES.map((leaf) => (
        <span
          key={leaf.id}
          className={`aki-leaf is-${leaf.hue}`}
          style={{
            left: leaf.left,
            animationDuration: leaf.dur,
            animationDelay: leaf.delay,
          }}
        />
      ))}
    </div>,
    document.body,
  )
}
