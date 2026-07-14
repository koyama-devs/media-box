import { useEffect, useRef } from 'react'

const SPIN_SECONDS = 5.2
const LABEL_BAKE_SIZE = 768

function bakeLabelBitmap(image) {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_BAKE_SIZE
  canvas.height = LABEL_BAKE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const iw = image.naturalWidth
  const ih = image.naturalHeight

  // SVGs often report bad intrinsic sizes; stretch into the square like object-fit: fill
  if (!iw || !ih) {
    ctx.drawImage(image, 0, 0, LABEL_BAKE_SIZE, LABEL_BAKE_SIZE)
    return canvas
  }

  // Photos: object-fit cover into square
  const scale = Math.max(LABEL_BAKE_SIZE / iw, LABEL_BAKE_SIZE / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(image, (LABEL_BAKE_SIZE - dw) / 2, (LABEL_BAKE_SIZE - dh) / 2, dw, dh)
  return canvas
}

function drawVinyl(ctx, cssSize, angle, labelBitmap) {
  const cx = cssSize / 2
  const cy = cssSize / 2
  const radius = cssSize / 2 - 1
  const labelRadius = radius * 0.52

  ctx.clearRect(0, 0, cssSize, cssSize)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#0a0a0a'
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.clip()

  for (let ring = radius * 0.98; ring > labelRadius + 4; ring -= 3) {
    ctx.beginPath()
    ctx.arc(0, 0, ring, 0, Math.PI * 2)
    ctx.strokeStyle = ring % 6 < 3 ? '#1a1a1a' : '#0f0f0f'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  for (let ring = labelRadius + 6; ring < radius * 0.92; ring += 4) {
    ctx.beginPath()
    ctx.arc(0, 0, ring, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2)
  ctx.clip()

  if (labelBitmap) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(labelBitmap, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2)
  } else {
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(-labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2)
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.lineWidth = 1.25
  ctx.stroke()

  const spindle = Math.max(4, cssSize * 0.02)
  const spindleGrad = ctx.createLinearGradient(-spindle, -spindle, spindle, spindle)
  spindleGrad.addColorStop(0, '#f3f4f6')
  spindleGrad.addColorStop(1, '#9ca3af')
  ctx.beginPath()
  ctx.arc(0, 0, spindle, 0, Math.PI * 2)
  ctx.fillStyle = spindleGrad
  ctx.fill()
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.restore()
}

function redraw(canvas, cssSize, angle, labelBitmap) {
  if (!canvas || !cssSize) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  drawVinyl(ctx, cssSize, angle, labelBitmap)
}

export default function VinylDiscCanvas({ labelSrc, isSpinning }) {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const angleRef = useRef(0)
  const lastTimeRef = useRef(0)
  const labelBitmapRef = useRef(null)
  const sizeRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = labelSrc

    const apply = async () => {
      try {
        if (!image.complete) {
          await image.decode()
        }
      } catch {
        // keep going; bake may still work after load error for fallbacks
      }
      if (cancelled) return
      labelBitmapRef.current = bakeLabelBitmap(image)
      redraw(canvasRef.current, sizeRef.current, angleRef.current, labelBitmapRef.current)
    }

    if (image.complete && image.naturalWidth + image.naturalHeight > 0) {
      apply()
    } else {
      image.addEventListener('load', apply)
      image.addEventListener('error', apply)
    }

    return () => {
      cancelled = true
      image.removeEventListener('load', apply)
      image.removeEventListener('error', apply)
    }
  }, [labelSrc])

  useEffect(() => {
    const shell = shellRef.current
    const canvas = canvasRef.current
    if (!shell || !canvas) return undefined

    const syncSize = () => {
      const cssSize = Math.max(1, Math.round(Math.min(shell.clientWidth, shell.clientHeight) || shell.clientWidth))
      sizeRef.current = cssSize
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(cssSize * dpr)
      canvas.height = Math.round(cssSize * dpr)
      canvas.style.width = `${cssSize}px`
      canvas.style.height = `${cssSize}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redraw(canvas, cssSize, angleRef.current, labelBitmapRef.current)
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let frameId = 0
    lastTimeRef.current = performance.now()

    const tick = (now) => {
      if (isSpinning) {
        const delta = (now - lastTimeRef.current) / 1000
        angleRef.current += (delta / SPIN_SECONDS) * Math.PI * 2
      }
      lastTimeRef.current = now
      redraw(canvas, sizeRef.current, angleRef.current, labelBitmapRef.current)

      if (isSpinning) {
        frameId = requestAnimationFrame(tick)
      }
    }

    if (isSpinning) {
      frameId = requestAnimationFrame(tick)
    } else {
      lastTimeRef.current = performance.now()
      redraw(canvas, sizeRef.current, angleRef.current, labelBitmapRef.current)
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [isSpinning, labelSrc])

  return (
    <div ref={shellRef} className="vinyl-record-shell-inner">
      <canvas ref={canvasRef} className="vinyl-disc-canvas" aria-hidden="true" />
    </div>
  )
}
