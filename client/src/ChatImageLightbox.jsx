import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Full-screen in-place image preview (no new tab).
 * Close via backdrop, Escape, close button, or tapping the enlarged image.
 */
export default function ChatImageLightbox({ src, alt = '写真', onClose }) {
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

  if (!src || typeof document === 'undefined') return null

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
          // Tap image again to shrink back.
          event.stopPropagation()
          onClose?.()
        }}
      />
    </div>,
    document.body,
  )
}
