function createNoiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1
    last = last * 0.96 + white * 0.04
    data[i] = last
  }
  return buffer
}

export class AmbientEngine {
  constructor() {
    this.ctx = null
    this.gain = null
    this.nodes = []
    this.type = null
  }

  async start(type, volume = 0.28) {
    if (!type || this.type === type) {
      this.setVolume(volume)
      return
    }

    this.stop()

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    this.ctx = new AudioContextClass()
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        /* ignore */
      }
    }

    this.gain = this.ctx.createGain()
    this.gain.gain.value = volume
    this.gain.connect(this.ctx.destination)
    this.type = type

    if (type === 'ocean') {
      this.startOcean()
    } else if (type === 'rain') {
      this.startRain()
    } else if (type === 'wind') {
      this.startWind()
    } else if (type === 'room') {
      this.startRoom()
    }
  }

  startOcean() {
    const source = this.ctx.createBufferSource()
    source.buffer = createNoiseBuffer(this.ctx, 3)
    source.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420

    const lfo = this.ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.08
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 180
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)

    source.connect(filter)
    filter.connect(this.gain)
    source.start()
    lfo.start()
    this.nodes.push(source, filter, lfo, lfoGain)
  }

  startRain() {
    const source = this.ctx.createBufferSource()
    source.buffer = createNoiseBuffer(this.ctx, 2)
    source.loop = true

    const highpass = this.ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 1800

    const lowpass = this.ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 5200

    source.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(this.gain)
    source.start()
    this.nodes.push(source, highpass, lowpass)
  }

  startWind() {
    const source = this.ctx.createBufferSource()
    source.buffer = createNoiseBuffer(this.ctx, 3)
    source.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 320
    filter.Q.value = 0.4

    const lfo = this.ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.05
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 120
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)

    source.connect(filter)
    filter.connect(this.gain)
    source.start()
    lfo.start()
    this.nodes.push(source, filter, lfo, lfoGain)
  }

  startRoom() {
    const source = this.ctx.createBufferSource()
    source.buffer = createNoiseBuffer(this.ctx, 2)
    source.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900

    source.connect(filter)
    filter.connect(this.gain)
    source.start()
    this.nodes.push(source, filter)
  }

  setVolume(volume) {
    if (!this.gain) return
    this.gain.gain.value = Math.min(1, Math.max(0, volume))
  }

  stop() {
    for (const node of this.nodes) {
      try {
        node.stop?.()
        node.disconnect?.()
      } catch {
        /* ignore */
      }
    }
    this.nodes = []
    if (this.ctx) {
      this.ctx.close().catch(() => {})
    }
    this.ctx = null
    this.gain = null
    this.type = null
  }
}

export function getFullscreenElement() {
  return (
    document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
    || null
  )
}

export async function tryEnterFullscreen() {
  const el = document.documentElement
  try {
    if (getFullscreenElement()) return
    if (el.requestFullscreen) {
      await el.requestFullscreen()
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen()
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen()
    }
  } catch {
    /* ignore */
  }
}

export async function tryExitFullscreen() {
  try {
    if (!getFullscreenElement()) return
    if (document.exitFullscreen) {
      await document.exitFullscreen()
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen()
    }
  } catch {
    /* ignore */
  }
}
