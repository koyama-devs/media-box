import { useEffect, useRef } from 'react'
import { resolveListeningSpace } from './listeningSpaces'

function seedParticles(type, width, height, count) {
  const particles = []
  for (let i = 0; i < count; i += 1) {
    if (type === 'stars') {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.72,
        r: Math.random() * 1.4 + 0.4,
        a: Math.random() * 0.5 + 0.2,
        tw: Math.random() * Math.PI * 2,
      })
    } else if (type === 'rain') {
      const layer = Math.random()
      const near = layer > 0.78
      const mid = layer > 0.4
      particles.push({
        x: Math.random() * (width + 80) - 40,
        y: Math.random() * height,
        len: near ? Math.random() * 8 + 14 : mid ? Math.random() * 6 + 10 : Math.random() * 5 + 6,
        speed: near ? Math.random() * 3.5 + 6.5 : mid ? Math.random() * 2.5 + 4.5 : Math.random() * 1.8 + 3.2,
        drift: 0,
        width: near ? 1.3 : mid ? 1 : 0.8,
        a: near ? Math.random() * 0.15 + 0.4 : mid ? Math.random() * 0.15 + 0.26 : Math.random() * 0.12 + 0.16,
      })
    } else if (type === 'petals') {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 3 + 2,
        speed: Math.random() * 0.4 + 0.2,
        drift: Math.random() * 0.6 - 0.3,
        rot: Math.random() * Math.PI,
        a: Math.random() * 0.45 + 0.25,
      })
    } else {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 40 + 20,
        speed: Math.random() * 0.15 + 0.05,
        a: Math.random() * 0.08 + 0.03,
      })
    }
  }
  return particles
}

export default function SpaceParticles({ spaceId, reducedMotion = false }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(0)
  const isRain = spaceId === 'rainy-city'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) return undefined

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    const space = resolveListeningSpace(spaceId)
    const type = space.particle

    let particles = []
    let width = 0
    let height = 0

    const resize = () => {
      // Prefer viewport size so rain never seeds against a 0×0 canvas.
      width = Math.max(canvas.clientWidth, window.innerWidth, 1)
      height = Math.max(canvas.clientHeight, window.innerHeight, 1)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = width * height
      const rainCount = Math.min(700, Math.max(350, Math.round(area / 2200)))
      const count =
        type === 'mist' ? 18
          : type === 'stars' ? 80
            : type === 'rain' ? rainCount
              : 60
      particles = seedParticles(type, width, height, count)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    window.addEventListener('resize', resize)

    const draw = (time) => {
      ctx.clearRect(0, 0, width, height)

      if (type === 'stars') {
        for (const p of particles) {
          const alpha = p.a + Math.sin(time * 0.001 + p.tw) * 0.15
          ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (type === 'rain') {
        // Batch by opacity bands so dense rain stays readable over photo BG.
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#e8f4ff'

        // Far drizzle
        ctx.globalAlpha = 0.1
        ctx.lineWidth = 0.8
        ctx.beginPath()
        for (const p of particles) {
          if (p.width > 0.9) continue
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.drift * 1.5, p.y + p.len)
        }
        ctx.stroke()

        // Mid rain
        ctx.globalAlpha = 0.18
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const p of particles) {
          if (p.width <= 0.9 || p.width > 1.1) continue
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.drift * 1.5, p.y + p.len)
        }
        ctx.stroke()

        // Near streaks
        ctx.globalAlpha = 0.28
        ctx.lineWidth = 1.3
        ctx.beginPath()
        for (const p of particles) {
          if (p.width <= 1.1) continue
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.drift * 1.6, p.y + p.len)
        }
        ctx.stroke()

        for (const p of particles) {
          p.y += p.speed
          p.x -= p.drift
          if (p.y > height + 30) {
            p.y = -Math.random() * 80 - 10
            p.x = Math.random() * (width + 100) - 40
          }
          if (p.x < -40) p.x = width + 40
        }

        ctx.globalAlpha = 1
        ctx.lineWidth = 1
      } else if (type === 'petals') {
        for (const p of particles) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = `rgba(251, 182, 206, ${p.a})`
          ctx.beginPath()
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          p.y += p.speed
          p.x += p.drift
          p.rot += 0.01
          if (p.y > height + 10) {
            p.y = -10
            p.x = Math.random() * width
          }
        }
      } else {
        for (const p of particles) {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
          gradient.addColorStop(0, `rgba(248, 250, 252, ${p.a})`)
          gradient.addColorStop(1, 'rgba(248, 250, 252, 0)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
          p.y -= p.speed
          if (p.y < -p.r) {
            p.y = height + p.r
            p.x = Math.random() * width
          }
        }
      }

      frameRef.current = window.requestAnimationFrame(draw)
    }

    frameRef.current = window.requestAnimationFrame(draw)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(frameRef.current)
    }
  }, [spaceId, reducedMotion])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className={`listening-space-particles${isRain ? ' is-rain' : ''}`}
      aria-hidden="true"
    />
  )
}
