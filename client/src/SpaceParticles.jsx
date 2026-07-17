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
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        len: Math.random() * 14 + 8,
        speed: Math.random() * 6 + 8,
        a: Math.random() * 0.35 + 0.15,
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) return undefined

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const space = resolveListeningSpace(spaceId)
    const type = space.particle

    let particles = []
    let width = 0
    let height = 0

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = type === 'mist' ? 18 : type === 'stars' ? 80 : 60
      particles = seedParticles(type, width, height, count)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

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
        ctx.strokeStyle = 'rgba(191, 219, 254, 0.35)'
        for (const p of particles) {
          ctx.globalAlpha = p.a
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - 2, p.y + p.len)
          ctx.stroke()
          p.y += p.speed
          p.x -= 1.2
          if (p.y > height + 20) {
            p.y = -20
            p.x = Math.random() * width
          }
        }
        ctx.globalAlpha = 1
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
      window.cancelAnimationFrame(frameRef.current)
    }
  }, [spaceId, reducedMotion])

  if (reducedMotion) return null

  return <canvas ref={canvasRef} className="listening-space-particles" aria-hidden="true" />
}
