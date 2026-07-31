import { useEffect, useState } from 'react'

/**
 * Owner-only private assist card under a guest bubble.
 * Never synced to Firestore — guests never see this UI.
 */
export default function OwnerMessageAssist({
  assist,
  collapsed = false,
  onRetry,
  onUseReply,
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (collapsed) setExpanded(false)
  }, [collapsed])

  if (!assist) return null

  const status = assist.status || 'loading'
  const showCollapsed = collapsed && !expanded && status === 'ready'

  if (showCollapsed) {
    const preview = String(assist.translationVi || '').trim()
    return (
      <button
        type="button"
        className="hana-owner-assist is-collapsed"
        data-no-bubble-press="true"
        aria-label="はな専用メモをひらく"
        onClick={() => setExpanded(true)}
      >
        <span>はな専用</span>
        <span className="hana-owner-assist-collapsed-hint">
          {preview || 'ひらく'}
        </span>
      </button>
    )
  }

  if (status === 'loading') {
    return (
      <div className="hana-owner-assist is-loading" data-no-bubble-press="true">
        <p className="hana-owner-assist-status">ベトナム語訳・読み・返信案を準備中…</p>
      </div>
    )
  }

  if (status === 'error') {
    const note = assist.reason === 'quota'
      ? 'クォータ不足のため解析できませんでした'
      : '解析に失敗しました'
    return (
      <div className="hana-owner-assist is-error" data-no-bubble-press="true">
        <p className="hana-owner-assist-status">{note}</p>
        {onRetry ? (
          <button type="button" className="hana-owner-assist-retry" onClick={onRetry}>
            再試行
          </button>
        ) : null}
      </div>
    )
  }

  const replies = Array.isArray(assist.replies) ? assist.replies : []

  return (
    <div className="hana-owner-assist" data-no-bubble-press="true" aria-label="はな専用メモ">
      <div className="hana-owner-assist-top">
        <p className="hana-owner-assist-badge">はな専用</p>
        {collapsed ? (
          <button
            type="button"
            className="hana-owner-assist-fold"
            onClick={() => setExpanded(false)}
          >
            とじる
          </button>
        ) : null}
      </div>

      {assist.translationVi ? (
        <div className="hana-owner-assist-block">
          <div className="hana-owner-assist-block-head">
            <strong>ベトナム語</strong>
          </div>
          <p className="hana-owner-assist-text">{assist.translationVi}</p>
        </div>
      ) : null}

      {assist.readingHiragana ? (
        <div className="hana-owner-assist-block">
          <div className="hana-owner-assist-block-head">
            <strong>読み（ひらがな）</strong>
          </div>
          <p className="hana-owner-assist-text is-reading">{assist.readingHiragana}</p>
        </div>
      ) : null}

      {replies.length ? (
        <div className="hana-owner-assist-block">
          <div className="hana-owner-assist-block-head">
            <strong>返信案</strong>
          </div>
          <ul className="hana-owner-assist-replies">
            {replies.map((reply, index) => (
              <li key={`assist-reply-${index}`}>
                <div className="hana-owner-assist-reply-line">
                  <span className="hana-owner-assist-lang">JP</span>
                  <p>{reply.ja}</p>
                  {onUseReply ? (
                    <div className="hana-owner-assist-actions">
                      <button type="button" onClick={() => onUseReply(reply.ja)}>使う</button>
                    </div>
                  ) : null}
                </div>
                {reply.vi ? (
                  <div className="hana-owner-assist-reply-line is-vi">
                    <span className="hana-owner-assist-lang">VI</span>
                    <p>{reply.vi}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Guest text messages after Hana's last reply (walks backwards until a hana
 * bubble). Stickers / images in between do not break the streak. Caps the
 * batch so opening a long thread cannot flood the Gemini quota.
 */
export function collectUnansweredOwnerAssistMessages(messages, { isAssistable, max = 8 } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const streak = []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]
    if (!item || item.deleted) continue
    const sender = item.sender || item.role
    if (sender === 'hana') break
    if (typeof isAssistable === 'function' ? isAssistable(item) : false) {
      streak.push(item)
      if (streak.length >= Math.max(1, max)) break
    }
  }
  return streak.reverse()
}

/**
 * Collapse once Hana has replied after this guest message, or when a newer
 * guest text sits in the same unanswered streak (only the latest stays open).
 */
export function ownerAssistShouldCollapse(messageId, messages) {
  const list = Array.isArray(messages) ? messages : []
  const index = list.findIndex((item) => item.id === messageId)
  if (index < 0) return false
  for (let i = index + 1; i < list.length; i += 1) {
    const item = list[i]
    if (!item || item.deleted) continue
    const sender = item.sender || item.role
    if (sender === 'hana') return true
    if (
      sender === 'guest'
      && !item.sticker
      && !item.imageUrl
      && !item.effect
      && String(item.rawText || item.text || '').trim()
    ) {
      return true
    }
  }
  return false
}
