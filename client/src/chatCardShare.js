export const CHAT_CARD_SHARE_EVENT = 'hana-chat:share-song-card'
export const CHAT_PLAY_TRACK_EVENT = 'hana-chat:play-track'

/**
 * Ask the mounted HanaChat instance to send a rendered song card to its
 * currently selected conversation. Dispatch is synchronous so the postcard
 * dialog can immediately explain when no conversation is selected.
 */
export function requestChatCardShare({ file, title, shareUrl }) {
  if (typeof window === 'undefined' || !(file instanceof File)) {
    return { accepted: false, reason: 'カード画像を作成できませんでした。' }
  }
  const detail = {
    file,
    title: String(title || '').trim(),
    shareUrl: String(shareUrl || '').trim(),
    accepted: false,
    reason: '',
  }
  window.dispatchEvent(new CustomEvent(CHAT_CARD_SHARE_EVENT, { detail }))
  return detail
}

/** Pull `track` id from a mediabox share URL (`/?track=...`). */
export function trackIdFromShareUrl(shareUrl) {
  try {
    const parsed = new URL(String(shareUrl || ''), typeof window !== 'undefined' ? window.location.origin : 'https://hana-mediabox.web.app')
    return String(parsed.searchParams.get('track') || '').trim()
  } catch {
    return ''
  }
}

/**
 * Ask App to select + autoplay a track in-place (no welcome postcard).
 * Synchronous so chat can fall back to navigation if App is not mounted.
 */
export function requestChatTrackPlay(trackId) {
  const id = String(trackId || '').trim()
  if (!id || typeof window === 'undefined') {
    return { accepted: false, trackId: id }
  }
  const detail = { trackId: id, accepted: false }
  window.dispatchEvent(new CustomEvent(CHAT_PLAY_TRACK_EVENT, { detail }))
  return detail
}
