import { useEffect, useState } from 'react'
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
 * Full-screen image preview.
 * Save = download image (gallery / Downloads) + success toast.
 * Share = OS share sheet.
 */
export default function ChatImageLightbox({ src, alt = '写真', onClose }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const canShareApi = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (!src) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [src, onClose])

  useEffect(() => {
    if (!note) return undefined
    const id = window.setTimeout(() => setNote(''), 2000)
    return () => window.clearTimeout(id)
  }, [note])

  if (!src || typeof document === 'undefined') return null

  const fileName = guessDownloadName(src, alt)

  const handleSave = async (event) => {
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const raw = await fetchImageBlob(src)
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
        const blob = await fetchImageBlob(src)
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
        shared = await shareImageFile(file, alt || '写真')
      } catch {
        /* fall through to URL share */
      }
      if (!shared && /^https:\/\//i.test(src)) {
        await navigator.share({
          title: alt || '写真',
          text: 'Hana Mediaboxの写真',
          url: src,
        })
        shared = true
      }
      // Share promise resolves after the user picks an action (save / send / …).
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
      className="hana-chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="画像プレビュー"
      onClick={onClose}
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

      <img
        className="hana-chat-lightbox-image"
        src={src}
        alt={alt}
        onClick={(event) => {
          event.stopPropagation()
        }}
      />

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
