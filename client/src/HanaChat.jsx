import { useEffect, useMemo, useRef, useState } from 'react'
import hanachanArt from './assets/hanachan.svg'
import {
  chatWithHanachan,
  ensureGuestChatId,
  getFirebaseErrorMessage,
  guestLabelFromUid,
  isAdminUser,
  markThreadRead,
  sendChatMessage,
  subscribeChatMessages,
  subscribeChatThreads,
  subscribeOwnChatThread,
  subscribeToAuthUser,
} from './firebase'
import './hana-chat.css'

const AI_WELCOME = {
  id: 'welcome-hanachan',
  role: 'hanachan',
  text: 'こんにちは、はなちゃんです。メディボックスの使い方や、ちょっとしたお話、なんでもどうぞ。',
}

/**
 * Floating Hanachan / Hana chat.
 * - はなちゃん: AI companion (Cloud Function)
 * - はな: realtime Firestore inbox with the human owner
 *
 * Main app defaults to guest messaging even if Google admin is signed in.
 * Owner reply UI only when admin toggles 「返信モード」 (or use /admin).
 */
export default function HanaChat({ hidden = false }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('hanachan') // hanachan | hana
  const [authUser, setAuthUser] = useState(null)
  const [replyAsHana, setReplyAsHana] = useState(false)
  const [guestChatId, setGuestChatId] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiMessages, setAiMessages] = useState([AI_WELCOME])
  const [hanaMessages, setHanaMessages] = useState([])
  const [threads, setThreads] = useState([])
  const [ownThread, setOwnThread] = useState(null)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const listRef = useRef(null)

  const isAdmin = isAdminUser(authUser)
  // Admin signed-in alone does NOT mean owner inbox — must opt into reply mode.
  const actingAsOwner = isAdmin && replyAsHana

  const unreadLauncher = useMemo(() => {
    if (actingAsOwner) return threads.filter((t) => t.unreadByHana).length
    return ownThread?.unreadByGuest ? 1 : 0
  }, [actingAsOwner, threads, ownThread])

  useEffect(() => {
    if (hidden) return undefined
    return subscribeToAuthUser(setAuthUser)
  }, [hidden])

  useEffect(() => {
    if (hidden) return
    setGuestChatId(ensureGuestChatId())
  }, [hidden])

  useEffect(() => {
    if (hidden || !actingAsOwner) {
      if (!actingAsOwner) setThreads([])
      return undefined
    }
    return subscribeChatThreads(
      (next) => setThreads(next),
      (err) => setError(getFirebaseErrorMessage(err) || 'スレッドの読み込みに失敗しました。'),
    )
  }, [hidden, actingAsOwner])

  useEffect(() => {
    if (hidden || actingAsOwner || !guestChatId) {
      if (!guestChatId) setOwnThread(null)
      return undefined
    }
    return subscribeOwnChatThread(
      guestChatId,
      (next) => setOwnThread(next),
      () => {},
    )
  }, [hidden, actingAsOwner, guestChatId])

  const hanaThreadId = actingAsOwner ? activeThreadId : guestChatId

  useEffect(() => {
    if (hidden || mode !== 'hana' || !hanaThreadId) {
      if (mode !== 'hana') setHanaMessages([])
      return undefined
    }
    const unsub = subscribeChatMessages(
      hanaThreadId,
      (next) => {
        setHanaMessages(next)
        setError('')
      },
      (err) => setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。'),
    )
    markThreadRead(hanaThreadId, actingAsOwner ? 'hana' : 'guest').catch(() => {})
    return unsub
  }, [hidden, mode, hanaThreadId, actingAsOwner])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [aiMessages, hanaMessages, open, mode, activeThreadId])

  if (hidden) return null

  const visibleMessages = mode === 'hanachan'
    ? aiMessages
    : hanaMessages.map((m) => ({
        id: m.id,
        role: m.sender === 'hana' ? 'hana' : 'guest',
        text: m.text,
      }))

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError('')
    setBusy(true)
    setSpeaking(true)

    try {
      if (mode === 'hanachan') {
        const history = aiMessages
          .filter((m) => m.id !== AI_WELCOME.id)
          .map((m) => ({
            role: m.role === 'guest' ? 'user' : 'model',
            text: m.text,
          }))
        setAiMessages((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: 'guest', text },
        ])
        const data = await chatWithHanachan({ message: text, history })
        const reply = String(data?.reply || '').trim() || '……うまくお返事できなかったみたい。もう一度試してみてね。'
        setAiMessages((prev) => [
          ...prev,
          { id: `h-${Date.now()}`, role: 'hanachan', text: reply },
        ])
      } else if (actingAsOwner) {
        if (!activeThreadId) {
          setError('返信する相手を選んでください。')
          return
        }
        await sendChatMessage({
          threadId: activeThreadId,
          text,
          sender: 'hana',
        })
      } else {
        const threadId = guestChatId || ensureGuestChatId()
        if (!guestChatId) setGuestChatId(threadId)
        await sendChatMessage({
          threadId,
          text,
          sender: 'guest',
          guestLabel: guestLabelFromUid(threadId),
        })
      }
    } catch (err) {
      console.error(err)
      setError(getFirebaseErrorMessage(err) || '送信に失敗しました。')
      if (mode === 'hanachan') {
        setAiMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'hanachan',
            text: 'ごめんね、いま少し調子が悪いみたい。少ししてからまた話そうね。',
          },
        ])
      }
    } finally {
      setBusy(false)
      window.setTimeout(() => setSpeaking(false), 600)
    }
  }

  const modeTitle = mode === 'hanachan' ? 'はなちゃん' : 'はな'
  const modeSub = mode === 'hanachan'
    ? 'いつでもお話しできます'
    : actingAsOwner
      ? 'ゲストへの返信'
      : 'はな本人にメッセージ'

  return (
    <div className={`hana-chat${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`hana-chat-launcher${unreadLauncher ? ' has-unread' : ''}${speaking ? ' is-speaking' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hana-chat-panel"
        title={open ? 'チャットを閉じる' : 'はなちゃんと話す'}
      >
        <img src={hanachanArt} alt="" className="hana-chat-launcher-art" />
        {unreadLauncher ? (
          <span className="hana-chat-badge" aria-label={`未読 ${unreadLauncher}`}>
            {unreadLauncher > 9 ? '9+' : unreadLauncher}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="hana-chat-panel"
          className="hana-chat-panel"
          aria-label="はなちゃんチャット"
        >
          <header className="hana-chat-header">
            <div className={`hana-chat-avatar${speaking ? ' is-speaking' : ''}`}>
              <img src={hanachanArt} alt="" />
            </div>
            <div className="hana-chat-titles">
              <p className="hana-chat-kicker">{modeSub}</p>
              <h2 className="hana-chat-heading">{modeTitle}</h2>
            </div>
            <button
              type="button"
              className="hana-chat-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ×
            </button>
          </header>

          <div className="hana-chat-modes" role="tablist" aria-label="モード切替">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'hanachan'}
              className={mode === 'hanachan' ? 'is-active' : ''}
              onClick={() => setMode('hanachan')}
            >
              はなちゃん
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'hana'}
              className={mode === 'hana' ? 'is-active' : ''}
              onClick={() => setMode('hana')}
            >
              はな
            </button>
          </div>

          {mode === 'hana' && isAdmin ? (
            <div className="hana-chat-role" role="group" aria-label="送信ロール">
              <button
                type="button"
                className={!replyAsHana ? 'is-active' : ''}
                onClick={() => {
                  setReplyAsHana(false)
                  setActiveThreadId(null)
                }}
              >
                ゲストとして送る
              </button>
              <button
                type="button"
                className={replyAsHana ? 'is-active' : ''}
                onClick={() => setReplyAsHana(true)}
              >
                返信モード
              </button>
            </div>
          ) : null}

          {mode === 'hana' && actingAsOwner ? (
            <div className="hana-chat-threads" aria-label="会話一覧">
              {threads.length === 0 ? (
                <p className="hana-chat-empty">まだメッセージはありません。</p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`hana-chat-thread${activeThreadId === thread.id ? ' is-active' : ''}${thread.unreadByHana ? ' is-unread' : ''}`}
                    onClick={() => setActiveThreadId(thread.id)}
                  >
                    <span className="hana-chat-thread-name">{thread.guestLabel}</span>
                    <span className="hana-chat-thread-preview">{thread.lastText || '—'}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          <div className="hana-chat-messages" ref={listRef} role="log" aria-live="polite">
            {mode === 'hana' && actingAsOwner && !activeThreadId ? (
              <p className="hana-chat-empty">上のリストから返信する相手を選んでね。</p>
            ) : null}
            {mode === 'hana' && !actingAsOwner && visibleMessages.length === 0 ? (
              <p className="hana-chat-empty">はなにメッセージを送ると、ここに返信が届きます。</p>
            ) : null}
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`hana-chat-bubble is-${message.role}`}
              >
                <span className="hana-chat-bubble-label">
                  {message.role === 'hanachan'
                    ? 'はなちゃん'
                    : message.role === 'hana'
                      ? 'はな'
                      : 'あなた'}
                </span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          {error ? <p className="hana-chat-error">{error}</p> : null}

          <form className="hana-chat-composer" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="hana-chat-input">
              メッセージ
            </label>
            <input
              id="hana-chat-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                mode === 'hanachan'
                  ? 'はなちゃんに話しかける…'
                  : actingAsOwner
                    ? 'ゲストに返信…'
                    : 'はなに送る…'
              }
              maxLength={2000}
              disabled={busy || (mode === 'hana' && actingAsOwner && !activeThreadId)}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? '…' : '送る'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
