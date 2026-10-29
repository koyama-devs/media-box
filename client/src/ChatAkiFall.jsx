import { useEffect, useState } from 'react'
import AkiLeaf from './AkiLeaf'

const TONES = ['crimson', 'scarlet', 'gold', 'amber']
const VARIANTS = ['momiji', 'momiji', 'momiji', 'ginkgo']

function makeFallingLeaf(seq) {
  const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
  const tone = TONES[Math.floor(Math.random() * TONES.length)]
  return {
    id: `chat-leaf-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    left: 4 + Math.random() * 90,
    size: 34 + Math.floor(Math.random() * 18),
    duration: 9 + Math.random() * 8,
    delay: Math.random() * 0.4,
    drift: Math.random() > 0.5 ? 1 : -1,
    variant,
    tone,
  }
}

/** Continuous momiji / ichō fall inside the chat panel (like in-chat hanabi). */
export default function ChatAkiFall() {
  const [leaves, setLeaves] = useState([])

  useEffect(() => {
    let seq = 0
    let cancelled = false
    const timeoutIds = []

    const spawn = () => {
      if (cancelled) return
      seq += 1
      const next = makeFallingLeaf(seq)
      setLeaves((prev) => [...prev, next].slice(-14))
      timeoutIds.push(
        window.setTimeout(() => {
          setLeaves((prev) => prev.filter((item) => item.id !== next.id))
        }, (next.duration + 1) * 1000),
      )
    }

    spawn()
    const timer = window.setInterval(spawn, 720)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      timeoutIds.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  return (
    <div className="hana-chat-aki-fall" aria-hidden="true">
      {leaves.map((leaf) => (
        <span
          key={leaf.id}
          className="hana-chat-aki-fall-item"
          style={{
            left: `${leaf.left}%`,
            animationDuration: `${leaf.duration}s`,
            animationDelay: `${leaf.delay}s`,
            '--aki-drift': leaf.drift,
          }}
        >
          <AkiLeaf variant={leaf.variant} tone={leaf.tone} size={leaf.size} />
        </span>
      ))}
    </div>
  )
}
