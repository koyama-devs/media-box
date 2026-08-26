import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function guessDownloadName(src, alt = '写真') {
  const base = String(alt || '写真').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || '写真'
  try {
    const path = new URL(src, window.location.href).pathname
    const leaf = path.split('/').pop() || ''
    if (/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(leaf)) {
      return decodeURIComponent(leaf).slice(0, 120)
    }
  } catch {
    /* ignore */
  }
  if (/\.png$/i.test(src)) return `${base}.png`
  if (/\.webp$/i.test(src)) return `${base}.webp`
  if (/\.gif$/i.test(src)) return `${base}.gif`
  return `${base}.jpg`
}

async function fetchImageBlob(src) {
  const response = await fetch(src, { mode: 'cors' })
  if (!response.ok) throw new Error('fetch-failed')
  return response.blob()
}

/** Prefer a gallery-friendly JPEG when the source is a photo. */
async function toSaveableImageBlob(blob) {
  const type = String(blob.type || '').toLowerCase()
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') return blob
  if (!type.startsWith('image/')) return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const jpeg = await new Promise((resolve) => {
      canvas.toBlob((next) => resolve(next), 'image/jpeg', 0.92)
    })
    return jpeg || blob
  } catch {
    return blob
  }
}

async function downloadMediaBlob(blob, fileName) {
  const name = fileName || 'photo.jpg'
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = name
    anchor.rel = 'noopener'
    anchor.type = blob.type || 'image/jpeg'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
  }
}

async function shareImageFile(file, title) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false
  }
  const payload = { files: [file], title: title || '写真' }
  if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
    return false
  }
  await navigator.share(payload)
  return true
}

function normalizeGallery(src, alt, items, index) {
  const list = Array.isArray(items)
    ? items
      .map((row) => ({
        src: String(row?.src || '').trim(),
        alt: String(row?.alt || '写真').trim() || '写真',
      }))
      .filter((row) => row.src)
    : []
  if (!list.length && src) {
    list.push({ src: String(src), alt: String(alt || '写真') })
  }
  const start = Math.max(0, Math.min(list.length - 1, Number(index) || 0))
  return { list, start }
}

/** Simple download-to-device glyph. */
function IconSave() {
  return (
    <svg className="hana-chat-lightbox-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 4v10.5m0 0l-3.25-3.25M12 14.5l3.25-3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 17.25v1.4c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6v-1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Classic share nodes — send to other apps. */
function IconShare() {
  return (
    <svg className="hana-chat-lightbox-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="18" cy="5.5" r="2.35" fill="currentColor" />
      <circle cx="6" cy="12" r="2.35" fill="currentColor" />
      <circle cx="18" cy="18.5" r="2.35" fill="currentColor" />
      <path
        d="M8.1 10.9l7.7-4.1M8.1 13.1l7.7 4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Full-screen image preview with optional multi-image gallery (swipe / arrows).
 * Save = download image (gallery / Downloads) + success toast.
 * Share = OS share sheet.
 */
export default function ChatImageLightbox({
  src,
  alt = '写真',
  items = null,
  index = 0,
  onClose,
}) {
  const { list: gallery, start } = normalizeGallery(src, alt, items, index)
  const [idx, setIdx] = useState(start)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const touchRef = useRef(null)
  const canShareApi = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const multi = gallery.length > 1
  const safeIdx = Math.max(0, Math.min(gallery.length - 1, idx))
  const current = gallery[safeIdx] || null
  const currentSrc = current?.src || ''
  const currentAlt = current?.alt || '写真'

  useEffect(() => {
    setIdx(start)
  }, [start, src, items])

  useEffect(() => {
    if (!currentSrc) return undefined
    const goPrev = () => setIdx((n) => (n <= 0 ? gallery.length - 1 : n - 1))
    const goNext = () => setIdx((n) => (n >= gallery.length - 1 ? 0 : n + 1))
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
      else if (multi && event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (multi && event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [currentSrc, onClose, multi, gallery.length])

  useEffect(() => {
    if (!note) return undefined
    const id = window.setTimeout(() => setNote(''), 2000)
    return () => window.clearTimeout(id)
  }, [note])

  if (!currentSrc || typeof document === 'undefined') return null

  const fileName = guessDownloadName(currentSrc, currentAlt)

  const goPrev = (event) => {
    event?.stopPropagation?.()
    if (!multi) return
    setIdx((n) => (n <= 0 ? gallery.length - 1 : n - 1))
  }

  const goNext = (event) => {
    event?.stopPropagation?.()
    if (!multi) return
    setIdx((n) => (n >= gallery.length - 1 ? 0 : n + 1))
  }

  const onTouchStart = (event) => {
    if (!multi) return
    const touch = event.changedTouches?.[0]
    if (!touch) return
    touchRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() }
  }

  const onTouchEnd = (event) => {
    if (!multi || !touchRef.current) return
    const touch = event.changedTouches?.[0]
    if (!touch) return
    const dx = touch.clientX - touchRef.current.x
    const dy = touch.clientY - touchRef.current.y
    touchRef.current = null
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    if (dx < 0) goNext(event)
    else goPrev(event)
  }

  const handleSave = async (event) => {
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const raw = await fetchImageBlob(currentSrc)
      const blob = await toSaveableImageBlob(raw)
      const saveName = String(blob.type || '').includes('png')
        ? fileName.replace(/\.[^.]+$/, '.png')
        : fileName.replace(/\.[^.]+$/, '.jpg')

      await downloadMediaBlob(blob, saveName)
      setNote('保存しました')
    } catch {
      setNote('保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const handleShare = async (event) => {
    event.stopPropagation()
    if (!canShareApi || busy) return
    setBusy(true)
    try {
      let shared = false
      try {
        const blob = await fetchImageBlob(currentSrc)
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
        shared = await shareImageFile(file, currentAlt || '写真')
      } catch {
        /* fall through to URL share */
      }
      if (!shared && /^https:\/\//i.test(currentSrc)) {
        await navigator.share({
          title: currentAlt || '写真',
          text: 'Hana Mediaboxの写真',
          url: currentSrc,
        })
        shared = true
      }
      if (shared) setNote('完了')
      else setNote('共有に失敗しました')
    } catch (err) {
      if (err?.name === 'AbortError') return
      setNote('共有に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className={`hana-chat-lightbox${multi ? ' is-gallery' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="画像プレビュー"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        className="hana-chat-lightbox-close"
        aria-label="閉じる"
        onClick={(event) => {
          event.stopPropagation()
          onClose?.()
        }}
      >
        ×
      </button>

      {multi ? (
        <p className="hana-chat-lightbox-counter" aria-live="polite">
          {safeIdx + 1} / {gallery.length}
        </p>
      ) : null}

      {multi ? (
        <button
          type="button"
          className="hana-chat-lightbox-nav is-prev"
          aria-label="前の画像"
          onClick={goPrev}
        >
          ‹
        </button>
      ) : null}

      <img
        key={currentSrc}
        className="hana-chat-lightbox-image"
        src={currentSrc}
        alt={currentAlt}
        onClick={(event) => {
          event.stopPropagation()
        }}
        draggable={false}
      />

      {multi ? (
        <button
          type="button"
          className="hana-chat-lightbox-nav is-next"
          aria-label="次の画像"
          onClick={goNext}
        >
          ›
        </button>
      ) : null}

      <div
        className="hana-chat-lightbox-toolbar"
        role="toolbar"
        aria-label="画像アクション"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="hana-chat-lightbox-action is-save"
          disabled={busy}
          aria-label="保存"
          onClick={handleSave}
        >
          <IconSave />
        </button>
        {canShareApi ? (
          <button
            type="button"
            className="hana-chat-lightbox-action is-share"
            disabled={busy}
            aria-label="共有"
            onClick={handleShare}
          >
            <IconShare />
          </button>
        ) : null}
      </div>

      {note ? (
        <p className="hana-chat-lightbox-note" role="status" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>,
    document.body,
  )
}
