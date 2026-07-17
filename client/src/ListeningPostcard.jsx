import { useEffect, useMemo, useRef, useState } from 'react'
import jacketSakuraUrl from './assets/vinyl-jacket-0-sakura.svg?url'
import jacketPosterUrl from './assets/vinyl-jacket-1-poster.svg?url'
import jacketRecordUrl from './assets/vinyl-jacket-2-record.svg?url'
import jacketPaperUrl from './assets/vinyl-jacket-3-paper.svg?url'
import jacketPetalUrl from './assets/vinyl-jacket-4-petal.svg?url'
import defaultLabelUrl from './assets/vinyl-label-default.svg?url'
import {
    getPostcardThemeFromSpace,
    LISTENING_SPACES,
    loadSavedListeningSpaceId,
} from './listeningSpaces'
import SpaceScenery, { SpaceSceneryPreview } from './SpaceScenery'

const JACKET_FALLBACKS = {
  petal: jacketPetalUrl,
  sakura: jacketSakuraUrl,
  poster: jacketPosterUrl,
  paper: jacketPaperUrl,
  record: jacketRecordUrl,
}

function resolveJacketUrl(jacketSrc, jacketStyleId) {
  if (jacketSrc) return jacketSrc
  return JACKET_FALLBACKS[jacketStyleId] || JACKET_FALLBACKS.sakura
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('missing image'))
      return
    }
    const image = new Image()
    image.decoding = 'async'
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = src
  })
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/)
  if (words.length === 1 && !words[0].includes(' ')) {
    // CJK / no spaces — wrap by character cluster
    const chars = Array.from(String(text || ''))
    const lines = []
    let current = ''
    for (const char of chars) {
      const next = current + char
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current)
        current = char
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
    return lines
  }

  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

async function renderPostcardCanvas({
  title,
  lyricJa,
  lyricEn,
  jacketUrl,
  coverUrl,
  shareUrl,
  spaceId = 'ocean-night',
  spaceTagline = '',
}) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  }

  const width = 900
  const height = 1200
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  const theme = getPostcardThemeFromSpace(spaceId)
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, theme.gradient[0])
  gradient.addColorStop(0.45, theme.gradient[1])
  gradient.addColorStop(1, theme.gradient[2])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Soft glow
  const glow = ctx.createRadialGradient(width * 0.7, height * 0.22, 20, width * 0.7, height * 0.22, 360)
  glow.addColorStop(0, theme.glow)
  glow.addColorStop(1, 'rgba(96, 165, 250, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  const horizon = ctx.createLinearGradient(0, height * 0.42, 0, height * 0.58)
  horizon.addColorStop(0, 'rgba(255, 255, 255, 0)')
  horizon.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)')
  horizon.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = horizon
  ctx.fillRect(0, height * 0.34, width, height * 0.3)

  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
  ctx.font = '500 22px "Cormorant Garamond", "Times New Roman", serif'
  ctx.fillText('この曲への招待', 72, 78)

  ctx.fillStyle = 'rgba(248, 250, 252, 0.95)'
  ctx.font = '600 18px Inter, "Segoe UI", sans-serif'
  ctx.fillText('Hana Media Box', 72, 112)

  let jacketImage = null
  let coverImage = null
  try {
    jacketImage = await loadImage(jacketUrl)
  } catch {
    jacketImage = null
  }
  try {
    coverImage = await loadImage(coverUrl || defaultLabelUrl)
  } catch {
    coverImage = null
  }

  const jacketSize = 520
  const jacketX = (width - jacketSize) / 2
  const jacketY = 160

  ctx.save()
  ctx.translate(jacketX + jacketSize / 2, jacketY + jacketSize / 2)
  ctx.rotate((-4 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 18
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(-jacketSize / 2, -jacketSize / 2, jacketSize, jacketSize)
  if (jacketImage) {
    ctx.drawImage(jacketImage, -jacketSize / 2, -jacketSize / 2, jacketSize, jacketSize)
  }
  ctx.restore()

  // Vinyl peek
  const discR = 118
  const discX = jacketX + jacketSize - 36
  const discY = jacketY + jacketSize - 40
  ctx.save()
  ctx.beginPath()
  ctx.arc(discX, discY, discR, 0, Math.PI * 2)
  ctx.fillStyle = '#0a0e16'
  ctx.fill()
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath()
    ctx.arc(discX, discY, discR - 10 - i * 10, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(148, 163, 184, ${0.08 + (i % 2) * 0.04})`
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const labelR = 42
  ctx.beginPath()
  ctx.arc(discX, discY, labelR, 0, Math.PI * 2)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  if (coverImage) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(discX, discY, labelR - 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(coverImage, discX - labelR, discY - labelR, labelR * 2, labelR * 2)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(discX, discY, 7, 0, Math.PI * 2)
  ctx.fillStyle = '#020617'
  ctx.fill()
  ctx.restore()

  const textTop = jacketY + jacketSize + 56
  ctx.fillStyle = '#f8fafc'
  ctx.font = '600 42px "Cormorant Garamond", "Times New Roman", serif'
  const titleLines = wrapCanvasText(ctx, title || '無題', width - 144).slice(0, 2)
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 72, textTop + index * 52)
  })

  let quoteY = textTop + titleLines.length * 52 + 28
  if (spaceTagline) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.88)'
    ctx.font = 'italic 24px "Hiragino Mincho ProN", "Yu Mincho", "Cormorant Garamond", serif'
    const taglineLines = wrapCanvasText(ctx, spaceTagline, width - 144).slice(0, 2)
    taglineLines.forEach((line, index) => {
      ctx.fillText(line, 72, quoteY + index * 34)
    })
    quoteY += taglineLines.length * 34 + 16
  }

  quoteY += 8
  if (lyricJa || lyricEn) {
    ctx.fillStyle = 'rgba(96, 165, 250, 0.85)'
    ctx.font = '500 16px Inter, "Segoe UI", sans-serif'
    ctx.fillText('ひとこと', 72, quoteY)
    quoteY += 34

    if (lyricJa) {
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '500 28px "Hiragino Mincho ProN", "Yu Mincho", "Cormorant Garamond", serif'
      const jaLines = wrapCanvasText(ctx, lyricJa, width - 144).slice(0, 3)
      jaLines.forEach((line, index) => {
        ctx.fillText(line, 72, quoteY + index * 40)
      })
      quoteY += jaLines.length * 40 + 12
    }

    if (lyricEn) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.95)'
      ctx.font = 'italic 22px "Cormorant Garamond", "Times New Roman", serif'
      const enLines = wrapCanvasText(ctx, lyricEn, width - 144).slice(0, 2)
      enLines.forEach((line, index) => {
        ctx.fillText(line, 72, quoteY + index * 32)
      })
      quoteY += enLines.length * 32
    }
  }

  ctx.fillStyle = 'rgba(100, 116, 139, 0.95)'
  ctx.font = '400 16px Inter, "Segoe UI", sans-serif'
  const urlLines = wrapCanvasText(ctx, shareUrl, width - 144).slice(0, 2)
  const urlY = height - 72 - (urlLines.length - 1) * 22
  urlLines.forEach((line, index) => {
    ctx.fillText(line, 72, urlY + index * 22)
  })

  return canvas
}

export default function ListeningPostcard({
  open,
  mode = 'share',
  title,
  shareUrl,
  lyricJa = '',
  lyricEn = '',
  jacketSrc = null,
  jacketStyleId = null,
  coverSrc = null,
  initialSpaceId = null,
  onClose,
  onShareFile = null,
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [localError, setLocalError] = useState('')
  const [spaceId, setSpaceId] = useState(initialSpaceId || loadSavedListeningSpaceId())
  const cardRef = useRef(null)

  const jacketUrl = useMemo(
    () => resolveJacketUrl(jacketSrc, jacketStyleId),
    [jacketSrc, jacketStyleId],
  )

  useEffect(() => {
    if (!open) return undefined
    setBusy(false)
    setStatus('')
    setLocalError('')
    setSpaceId(initialSpaceId || loadSavedListeningSpaceId())
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, initialSpaceId])

  if (!open) return null

  const activeTheme = getPostcardThemeFromSpace(spaceId)

  const buildCanvas = () =>
    renderPostcardCanvas({
      title,
      lyricJa,
      lyricEn,
      jacketUrl,
      coverUrl: coverSrc,
      shareUrl,
      spaceId,
      spaceTagline: activeTheme.tagline,
    })

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatus('リンクをコピーしました')
      setLocalError('')
    } catch {
      setLocalError('リンクのコピーに失敗しました。')
    }
  }

  const handleDownload = async () => {
    if (busy) return
    setBusy(true)
    setLocalError('')
    try {
      const canvas = await buildCanvas()
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('export failed')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const safeName = String(title || 'postcard').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
      anchor.href = url
      anchor.download = `${safeName}-postcard.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setStatus('カード画像を保存しました')
    } catch (error) {
      console.error(error)
      setLocalError('画像の保存に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const handleShare = async () => {
    if (busy) return
    setBusy(true)
    setLocalError('')
    try {
      const canvas = await buildCanvas()
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('export failed')
      const file = new File([blob], 'listening-card.png', { type: 'image/png' })
      const text = [title, lyricJa || lyricEn, shareUrl].filter(Boolean).join('\n')

      if (typeof navigator.share === 'function') {
        const payload = { title: title || 'Hana Media Box', text, url: shareUrl }
        const withFile =
          typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
        try {
          await navigator.share(withFile ? { ...payload, files: [file] } : payload)
          setStatus('共有しました')
          return
        } catch (shareError) {
          if (shareError?.name === 'AbortError') return
        }
      }

      await navigator.clipboard.writeText(text)
      setStatus('カードの文面をコピーしました')
    } catch (error) {
      console.error(error)
      setLocalError('共有に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="postcard-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'welcome' ? '曲が届きました' : 'この曲をカードで送る'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div className="postcard-dialog">
        <div className="postcard-dialog-header">
          <div>
            <p className="postcard-eyebrow">
              {mode === 'welcome' ? '曲が届きました' : 'Share Card'}
            </p>
            <h3>
              {mode === 'welcome'
                ? 'この曲を聴く準備ができています'
                : 'この曲をカードで送る'}
            </h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="閉じる" aria-label="閉じる">
            ×
          </button>
        </div>

        <article
          className="postcard-card"
          ref={cardRef}
          style={{
            '--postcard-gradient-0': activeTheme.gradient[0],
            '--postcard-gradient-1': activeTheme.gradient[1],
            '--postcard-gradient-2': activeTheme.gradient[2],
            '--postcard-glow': activeTheme.glow,
          }}
        >
          <SpaceScenery spaceId={spaceId} className="postcard-card-scenery" variant="card" />
          <div className="postcard-card-content">
          <div className="postcard-card-top">
            <span>Hana Media Box</span>
            <span>{activeTheme.label}で聴く</span>
          </div>
          <div
            className="postcard-jacket"
            style={{ backgroundImage: `url("${jacketUrl}")` }}
            aria-hidden="true"
          >
            <div
              className="postcard-vinyl"
              style={{ backgroundImage: coverSrc ? `url("${coverSrc}")` : `url("${defaultLabelUrl}")` }}
            />
          </div>
          <h4 className="postcard-title">{title || '無題'}</h4>
          {lyricJa || lyricEn ? (
            <blockquote className="postcard-quote">
              {lyricJa ? <p className="postcard-quote-ja">{lyricJa}</p> : null}
              {lyricEn ? <p className="postcard-quote-en">{lyricEn}</p> : null}
            </blockquote>
          ) : null}
          <p className="postcard-space-tagline">{activeTheme.tagline}</p>
          <p className="postcard-quote-fallback">いま、この一枚をあなたへ。</p>
          <p className="postcard-url">{shareUrl}</p>
          </div>
        </article>

        {mode === 'share' ? (
          <div className="postcard-theme-picker" role="group" aria-label="聴く場所">
            {LISTENING_SPACES.map((space) => (
              <button
                key={space.id}
                type="button"
                className={`postcard-theme-chip${space.id === spaceId ? ' is-active' : ''}`}
                onClick={() => setSpaceId(space.id)}
              >
                <SpaceSceneryPreview spaceId={space.id} />
                <span>{space.labelShort}</span>
              </button>
            ))}
          </div>
        ) : null}

        {status ? <p className="postcard-status">{status}</p> : null}
        {localError ? <p className="postcard-error">{localError}</p> : null}

        <div className="postcard-actions">
          {mode === 'welcome' ? (
            <button type="button" className="primary-button" onClick={onClose}>
              聴く
            </button>
          ) : (
            <>
              <button type="button" className="primary-button" disabled={busy} onClick={handleShare}>
                {busy ? '準備中...' : '共有する'}
              </button>
              <button type="button" className="secondary-button" disabled={busy} onClick={handleDownload}>
                画像を保存
              </button>
              <button type="button" className="secondary-button" onClick={handleCopyLink}>
                リンクをコピー
              </button>
              {typeof onShareFile === 'function' ? (
                <button type="button" className="secondary-button" disabled={busy} onClick={onShareFile}>
                  ファイルを送る
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
