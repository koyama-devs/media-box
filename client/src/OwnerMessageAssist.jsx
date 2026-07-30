/**
 * Owner-only private assist card under a guest bubble.
 * Never synced to Firestore — guests never see this UI.
 */
export default function OwnerMessageAssist({ assist, onRetry, onCopy, onUseReply }) {
  if (!assist) return null

  const status = assist.status || 'loading'
  const copy = async (text) => {
    const value = String(text || '').trim()
    if (!value) {
      onCopy?.(false)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      onCopy?.(true)
    } catch {
      onCopy?.(false)
    }
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
      <p className="hana-owner-assist-badge">はな専用</p>

      {assist.translationVi ? (
        <div className="hana-owner-assist-block">
          <div className="hana-owner-assist-block-head">
            <strong>ベトナム語</strong>
            <button type="button" onClick={() => { void copy(assist.translationVi) }}>コピー</button>
          </div>
          <p className="hana-owner-assist-text">{assist.translationVi}</p>
        </div>
      ) : null}

      {assist.readingHiragana ? (
        <div className="hana-owner-assist-block">
          <div className="hana-owner-assist-block-head">
            <strong>読み（ひらがな）</strong>
            <button type="button" onClick={() => { void copy(assist.readingHiragana) }}>コピー</button>
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
                  <div className="hana-owner-assist-actions">
                    <button type="button" onClick={() => { void copy(reply.ja) }}>コピー</button>
                    {onUseReply ? (
                      <button type="button" onClick={() => onUseReply(reply.ja)}>使う</button>
                    ) : null}
                  </div>
                </div>
                {reply.vi ? (
                  <div className="hana-owner-assist-reply-line is-vi">
                    <span className="hana-owner-assist-lang">VI</span>
                    <p>{reply.vi}</p>
                    <div className="hana-owner-assist-actions">
                      <button type="button" onClick={() => { void copy(reply.vi) }}>コピー</button>
                    </div>
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
