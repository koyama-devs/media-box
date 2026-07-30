/**
 * Soft two-note chime for new chat messages (Web Audio — no asset file).
 * Browsers often block audio until a user gesture; call unlockChatNotifySound
 * once on pointer/keydown so later plays work while the tab stays open.
 */

let audioCtx = null
let unlocked = false
let lastPlayAt = 0

const COOLDOWN_MS = 900

function getContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx()
  }
  return audioCtx
}

export function unlockChatNotifySound() {
  const ctx = getContext()
  if (!ctx) return
  unlocked = true
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}

function tone(ctx, {
  frequency,
  start,
  duration,
  gain = 0.08,
  type = 'sine',
}) {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Play the Hana-style notify chime (deduped briefly so bursts don't stack). */
export function playChatNotifySound() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false
  }
  const now = Date.now()
  if (now - lastPlayAt < COOLDOWN_MS) return false
  const ctx = getContext()
  if (!ctx || !unlocked) return false

  const run = () => {
    lastPlayAt = Date.now()
    const t0 = ctx.currentTime + 0.01
    // Soft rose-gold ping: G5 → C6
    tone(ctx, { frequency: 784, start: t0, duration: 0.18, gain: 0.07 })
    tone(ctx, { frequency: 1046.5, start: t0 + 0.12, duration: 0.28, gain: 0.055 })
  }

  if (ctx.state === 'suspended') {
    ctx.resume().then(run).catch(() => {})
    return true
  }
  run()
  return true
}
