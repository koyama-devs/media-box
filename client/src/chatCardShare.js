export const CHAT_CARD_SHARE_EVENT = 'hana-chat:share-song-card'

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
