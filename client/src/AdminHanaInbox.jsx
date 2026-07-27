import { useEffect, useRef, useState } from 'react'
import {
  getFirebaseErrorMessage,
  markThreadRead,
  sendChatMessage,
  subscribeChatMessages,
  subscribeChatThreads,
} from './firebase'

/**
 * Admin inbox for Hana realtime chat (used on /admin).
 */
export default function AdminHanaInbox() {
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    return subscribeChatThreads(
      (next) => {
        setThreads(next)
        setError('')
      },
      (err) => setError(getFirebaseErrorMessage(err) || 'チャットの読み込みに失敗しました。'),
    )
  }, [])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return undefined
    }
    const unsub = subscribeChatMessages(
      activeId,
      (next) => setMessages(next),
      (err) => setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。'),
    )
    markThreadRead(activeId, 'hana').catch(() => {})
    return unsub
  }, [activeId])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, activeId])

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !activeId || busy) return
    setBusy(true)
    setError('')
    try {
      await sendChatMessage({ threadId: activeId, text, sender: 'hana' })
      setDraft('')
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '送信に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const unread = threads.filter((t) => t.unreadByHana).length

  return (
    <section className="admin-card admin-chat-card">
      <div className="admin-logs-header">
        <div>
          <h2>はなチャット</h2>
          <p>
            ゲストからのメッセージに返信します
            {unread ? ` · 未読 ${unread}` : ''}
          </p>
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-chat-layout">
        <aside className="admin-chat-thread-list" aria-label="スレッド">
          {threads.length === 0 ? (
            <p className="admin-chat-empty">まだ会話はありません。</p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`admin-chat-thread${activeId === thread.id ? ' is-active' : ''}${thread.unreadByHana ? ' is-unread' : ''}`}
                onClick={() => setActiveId(thread.id)}
              >
                <strong>{thread.guestLabel}</strong>
                <span>{thread.lastText || '—'}</span>
              </button>
            ))
          )}
        </aside>

        <div className="admin-chat-main">
          {!activeId ? (
            <p className="admin-chat-empty">スレッドを選んで返信してください。</p>
          ) : (
            <>
              <div className="admin-chat-messages" ref={listRef}>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`admin-chat-bubble is-${message.sender}`}
                  >
                    <span>{message.sender === 'hana' ? 'はな' : 'ゲスト'}</span>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form className="admin-chat-composer" onSubmit={handleSend}>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="はなとして返信…"
                  maxLength={2000}
                  disabled={busy}
                />
                <button type="submit" className="admin-primary" disabled={busy || !draft.trim()}>
                  送る
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
