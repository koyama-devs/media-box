import { useEffect, useMemo, useRef, useState } from 'react'
import hanachanArt from './assets/hanachan.svg'
import {
    chatWithHanachan,
    ensureGuestAuth,
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
 */
export default function HanaChat({ hidden = false }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('hanachan') // hanachan | hana
  const [authUser, setAuthUser] = useState(null)
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

  const isOwner = isAdminUser(authUser)
  const guestUid = authUser && !isOwner ? authUser.uid : null
  const guestLabel = guestUid ? guestLabelFromUid(guestUid) : ''

  const unreadLauncher = useMemo(() => {
    if (isOwner) return threads.filter((t) => t.unreadByHana).length
    return ownThread?.unreadByGuest ? 1 : 0
  }, [isOwner, threads, ownThread])

  useEffect(() => {
    if (hidden) return undefined
    return subscribeToAuthUser(setAuthUser)
  }, [hidden])

  useEffect(() => {
    if (hidden) return undefined
    let cancelled = false
    ensureGuestAuth().catch((err) => {
      if (!cancelled && open) setError(getFirebaseErrorMessage(err) || 'ログインに失敗しました。')
    })
    return () => {
      cancelled = true
    }
  }, [hidden, open])

  useEffect(() => {
    if (hidden || !isOwner) {
      if (!isOwner) setThreads([])
      return undefined
    }
    return subscribeChatThreads(
      (next) => setThreads(next),
      (err) => setError(getFirebaseErrorMessage(err) || 'スレッドの読み込みに失敗しました。'),
    )
  }, [hidden, isOwner])

  useEffect(() => {
    if (hidden || isOwner || !guestUid) {
      if (!guestUid) setOwnThread(null)
      return undefined
    }
    return subscribeOwnChatThread(
      guestUid,
      (next) => setOwnThread(next),
      () => {},
    )
  }, [hidden, isOwner, guestUid])

  const hanaThreadId = isOwner ? activeThreadId : guestUid

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
    markThreadRead(hanaThreadId, isOwner ? 'hana' : 'guest').catch(() => {})
    return unsub
  }, [hidden, mode, hanaThreadId, isOwner])

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
      } else {
        const user = await ensureGuestAuth()
        if (isOwner) {
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
          await sendChatMessage({
            threadId: user.uid,
            text,
            sender: 'guest',
            guestLabel: guestLabelFromUid(user.uid),
          })
        }
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
    : isOwner
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

          {mode === 'hana' && isOwner ? (
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
            {mode === 'hana' && isOwner && !activeThreadId ? (
              <p className="hana-chat-empty">左（上）のリストから返信する相手を選んでね。</p>
            ) : null}
            {mode === 'hana' && !isOwner && visibleMessages.length === 0 ? (
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
                  : isOwner
                    ? 'ゲストに返信…'
                    : 'はなに送る…'
              }
              maxLength={2000}
              disabled={busy || (mode === 'hana' && isOwner && !activeThreadId)}
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
