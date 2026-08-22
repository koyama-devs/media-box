import { memo, useEffect, useState } from 'react'
import { getDefaultAvatarDataUrl } from './firebase'

const STORAGE_HOST = 'firebasestorage.googleapis.com'

function needsBlobFetch(src) {
  const url = String(src || '').trim()
  if (!url) return false
  if (url.startsWith('data:') || url.startsWith('blob:')) return false
  return url.includes(STORAGE_HOST)
}

/**
 * Chat/profile avatar — Firebase Storage URLs often fail on Android WebView
 * when loaded directly on <img>; fetch → blob URL is more reliable.
 */
const ChatAvatar = memo(function ChatAvatar({
  src = '',
  alt = '',
  className = '',
  profileId = '',
  displayName = '',
}) {
  const fallback = getDefaultAvatarDataUrl(profileId, displayName)
  const [displaySrc, setDisplaySrc] = useState(() => String(src || '').trim() || fallback)

  useEffect(() => {
    const raw = String(src || '').trim()
    if (!raw) {
      setDisplaySrc(fallback)
      return undefined
    }
    if (!needsBlobFetch(raw)) {
      setDisplaySrc(raw)
      return undefined
    }

    let cancelled = false
    let objectUrl = ''

    fetch(raw, { mode: 'cors', referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error('avatar fetch failed')
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setDisplaySrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(raw)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, fallback])

  return (
    <img
      className={className}
      src={displaySrc || fallback}
      alt={alt}
      referrerPolicy="no-referrer"
      decoding="async"
      draggable={false}
      onError={(event) => {
        const el = event.currentTarget
        if (el.dataset.fallback === '1') return
        el.dataset.fallback = '1'
        el.src = fallback
      }}
    />
  )
})

export default ChatAvatar
