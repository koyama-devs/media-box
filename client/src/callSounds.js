/**
 * Call UX tones via Web Audio (no asset files).
 * Japanese-style ringtone / ringback (着信・呼び出し).
 * Must be unlocked by a user gesture (accept / start call / prior chat unlock).
 */

let audioCtx = null
let loopTimer = null
let activeKind = null
let activeNodes = []

function getContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new Ctx()
  return audioCtx
}

export function unlockCallSounds() {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
}

function trackNode(node) {
  activeNodes.push(node)
  const clear = () => {
    activeNodes = activeNodes.filter((n) => n !== node)
  }
  try {
    node.addEventListener?.('ended', clear)
  } catch {
    /* ignore */
  }
  return node
}

function tone(ctx, {
  frequency,
  start,
  duration,
  gain = 0.08,
  type = 'sine',
  frequencyEnd,
}) {
  const osc = trackNode(ctx.createOscillator())
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  if (frequencyEnd) {
    osc.frequency.linearRampToValueAtTime(frequencyEnd, start + duration)
  }
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.04)
}

function stopLoop() {
  if (loopTimer != null) {
    window.clearInterval(loopTimer)
    loopTimer = null
  }
  activeKind = null
  // Soft-stop lingering oscillators from the previous burst.
  const ctx = audioCtx
  const now = ctx?.currentTime ?? 0
  for (const node of activeNodes.splice(0)) {
    try {
      node.stop?.(now + 0.02)
    } catch {
      /* already stopped */
    }
  }
}

export function stopCallSounds() {
  stopLoop()
}

function withContext(run) {
  const ctx = getContext()
  if (!ctx) return false
  const go = () => run(ctx)
  if (ctx.state === 'suspended') {
    ctx.resume().then(go).catch(() => {})
    return true
  }
  go()
  return true
}

/**
 * Japanese keitai-style incoming ringtone (着信メロディ).
 * Bright marimba/chime arpeggio — soft, familiar JP phone feel.
 */
function playIncomingBurst(ctx) {
  const t0 = ctx.currentTime + 0.01
  // Phrase A: rising chime (E5 G5 B5 E6)
  const phraseA = [
    [659.25, 0.0],
    [783.99, 0.12],
    [987.77, 0.24],
    [1318.51, 0.36],
  ]
  // Phrase B: soft echo (G5 B5 E6 G6)
  const phraseB = [
    [783.99, 0.55],
    [987.77, 0.67],
    [1318.51, 0.79],
    [1567.98, 0.91],
  ]
  for (const [freq, at] of phraseA) {
    tone(ctx, { frequency: freq, start: t0 + at, duration: 0.2, gain: 0.07, type: 'triangle' })
    tone(ctx, { frequency: freq * 2, start: t0 + at, duration: 0.12, gain: 0.02, type: 'sine' })
  }
  for (const [freq, at] of phraseB) {
    tone(ctx, { frequency: freq, start: t0 + at, duration: 0.22, gain: 0.055, type: 'triangle' })
    tone(ctx, { frequency: freq * 2, start: t0 + at, duration: 0.1, gain: 0.016, type: 'sine' })
  }
  // Soft resolving chime
  tone(ctx, { frequency: 1046.5, start: t0 + 1.15, duration: 0.28, gain: 0.045, type: 'triangle' })
  tone(ctx, { frequency: 1318.51, start: t0 + 1.15, duration: 0.28, gain: 0.03, type: 'sine' })
}

/**
 * Japanese PSTN-style ringback (呼び出し音):
 * ~400 Hz with light AM, 1s on / 2s off cadence.
 */
function playRingbackBurst(ctx) {
  const t0 = ctx.currentTime + 0.01
  const duration = 1.0

  const carrier = trackNode(ctx.createOscillator())
  const side = trackNode(ctx.createOscillator())
  const lfo = trackNode(ctx.createOscillator())
  const lfoDepth = ctx.createGain()
  const mix = ctx.createGain()
  const amp = ctx.createGain()

  carrier.type = 'sine'
  side.type = 'sine'
  carrier.frequency.setValueAtTime(400, t0)
  side.frequency.setValueAtTime(420, t0)
  lfo.frequency.setValueAtTime(16, t0)
  lfoDepth.gain.setValueAtTime(0.028, t0)

  mix.gain.setValueAtTime(0.55, t0)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.linearRampToValueAtTime(0.07, t0 + 0.04)
  amp.gain.setValueAtTime(0.07, t0 + duration - 0.08)
  amp.gain.linearRampToValueAtTime(0.0001, t0 + duration)

  lfo.connect(lfoDepth)
  lfoDepth.connect(amp.gain)
  carrier.connect(mix)
  side.connect(mix)
  mix.connect(amp)
  amp.connect(ctx.destination)

  carrier.start(t0)
  side.start(t0)
  lfo.start(t0)
  carrier.stop(t0 + duration + 0.05)
  side.stop(t0 + duration + 0.05)
  lfo.stop(t0 + duration + 0.05)
}

export function startIncomingRingtone() {
  unlockCallSounds()
  if (activeKind === 'incoming') return
  stopLoop()
  activeKind = 'incoming'
  const burst = () => {
    withContext((ctx) => {
      playIncomingBurst(ctx)
      navigator.vibrate?.([120, 80, 120, 80, 220, 120, 120])
    })
  }
  burst()
  window.setTimeout(burst, 100)
  // Melody ~1.5s + pause → loop every ~2.8s (JP keitai cadence feel)
  loopTimer = window.setInterval(burst, 2800)
}

export function startOutgoingRingback(force = false) {
  unlockCallSounds()
  if (!force && activeKind === 'outgoing') return
  stopLoop()
  activeKind = 'outgoing'
  const burst = () => {
    withContext((ctx) => playRingbackBurst(ctx))
  }
  burst()
  // JP 呼び出し音: 1s tone + 2s silence
  loopTimer = window.setInterval(burst, 3000)
}

export function playCallConnected() {
  unlockCallSounds()
  stopLoop()
  withContext((ctx) => {
    const t0 = ctx.currentTime + 0.01
    tone(ctx, { frequency: 784, start: t0, duration: 0.1, gain: 0.05, type: 'triangle' })
    tone(ctx, { frequency: 988, start: t0 + 0.09, duration: 0.12, gain: 0.05, type: 'triangle' })
    tone(ctx, { frequency: 1319, start: t0 + 0.2, duration: 0.2, gain: 0.045, type: 'sine' })
  })
}

export function playCallEnded() {
  unlockCallSounds()
  stopLoop()
  withContext((ctx) => {
    const t0 = ctx.currentTime + 0.01
    tone(ctx, { frequency: 659, start: t0, duration: 0.14, gain: 0.045, type: 'triangle' })
    tone(ctx, { frequency: 523, start: t0 + 0.12, duration: 0.18, gain: 0.04, type: 'triangle' })
    tone(ctx, { frequency: 392, start: t0 + 0.28, duration: 0.26, gain: 0.035, type: 'sine' })
  })
}
