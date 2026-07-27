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

const AI_HISTORY_PREFIX = 'hana-chat-ai-history-'
const CHANNEL_PREFIX = 'hana-chat-channel-'

const INTRO_ID = 'welcome-intro'
const HUMAN_SWITCH_NOTICE_ID = 'notice-human-switch'

const INTRO_TEXT =
  'こんにちは、はなちゃんです。メディボックスのことや、ちょっとしたお話、なんでもどうぞ。\n\n' +
  'いまは AI のはなちゃんとお話しできます。クレジットがなくなったときや、「本物のはなと話したい」と伝えてくれたときは、はな本人につながります。'

const HUMAN_SWITCH_QUOTA =
  'はなちゃんのクレジットがなくなっちゃったみたい…。これからのはな本人にバトンタッチするね。メッセージはそのまま届くよ。'

const HUMAN_SWITCH_INTENT =
  'わかったよ。これからのはな本人につながるね。少し待ってもらえるとうれしいな。'

const HUMAN_MODE_HINT =
  'いまはな本人とつながっています。返信は届き次第、ここに表示されます。'

const WANT_HUMAN_RE =
  /(本物|本当|リアル).{0,6}はな|はな本人|はな(と|に).{0,8}(話|しゃべ|チャット)|人間のはな|実在のはな|real\s*hana|talk\s*to\s*hana|hana\s*(thật|that)|muốn\s*.{0,20}hana\s*thật|nói\s*chuyện\s*với\s*hana\s*thật|chủ\s*nhân|オーナーのはな/i

function storageKey(prefix, guestId) {
  return `${prefix}${guestId || 'default'}`
}

function loadAiMessages(guestId) {
  try {
    const raw = window.localStorage.getItem(storageKey(AI_HISTORY_PREFIX, guestId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.filter((m) => m && typeof m.text === 'string' && m.id)
  } catch {
    return null
  }
}

function saveAiMessages(guestId, messages) {
  try {
    window.localStorage.setItem(
      storageKey(AI_HISTORY_PREFIX, guestId),
      JSON.stringify(messages.slice(-80)),
    )
  } catch {
    /* ignore */
  }
}

function loadChannel(guestId) {
  try {
    return window.localStorage.getItem(storageKey(CHANNEL_PREFIX, guestId)) === 'human'
      ? 'human'
      : 'ai'
  } catch {
    return 'ai'
  }
}

function saveChannel(guestId, channel) {
  try {
    window.localStorage.setItem(storageKey(CHANNEL_PREFIX, guestId), channel)
  } catch {
    /* ignore */
  }
}

function defaultIntroMessages() {
  return [
    {
      id: INTRO_ID,
      role: 'hanachan',
      text: INTRO_TEXT,
      kind: 'intro',
    },
  ]
}

function wantsHumanHana(text) {
  return WANT_HUMAN_RE.test(String(text || '').trim())
}

/**
 * Floating chat.
 * - Guest (other passwords): single stream — Hanachan AI, auto/opt-in switch to human Hana
 * - Owner (password `hana` or Google admin): reply inbox UI
 */
export default function HanaChat({ hidden = false, appRole = 'guest' }) {
  const [open, setOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [guestChatId, setGuestChatId] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [channel, setChannel] = useState('ai') // ai | human (guest only)
  const [aiMessages, setAiMessages] = useState(defaultIntroMessages)
  const [hanaMessages, setHanaMessages] = useState([])
  const [threads, setThreads] = useState([])
  const [ownThread, setOwnThread] = useState(null)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [showHumanSuggest, setShowHumanSuggest] = useState(false)
  const [humanNotice, setHumanNotice] = useState('')
  const [storageReady, setStorageReady] = useState(false)
  const listRef = useRef(null)

  const isAdmin = isAdminUser(authUser)
  const actingAsOwner = appRole === 'owner' || isAdmin

  const unreadLauncher = useMemo(() => {
    if (actingAsOwner) return threads.filter((t) => t.unreadByHana).length
    return ownThread?.unreadByGuest ? 1 : 0
  }, [actingAsOwner, threads, ownThread])

  useEffect(() => {
    if (hidden) return undefined
    return subscribeToAuthUser(setAuthUser)
  }, [hidden])

  useEffect(() => {
    if (hidden) {
      setStorageReady(false)
      return
    }
    const id = ensureGuestChatId()
    const stored = loadAiMessages(id)
    const savedChannel = loadChannel(id)
    setGuestChatId(id)
    setAiMessages(stored?.length ? stored : defaultIntroMessages())
    setChannel(savedChannel)
    if (savedChannel === 'human') {
      setHumanNotice(HUMAN_MODE_HINT)
    }
    setStorageReady(true)
  }, [hidden])

  useEffect(() => {
    if (!storageReady || !guestChatId || actingAsOwner) return
    saveAiMessages(guestChatId, aiMessages)
  }, [aiMessages, guestChatId, actingAsOwner, storageReady])

  useEffect(() => {
    if (!storageReady || !guestChatId || actingAsOwner) return
    saveChannel(guestChatId, channel)
  }, [channel, guestChatId, actingAsOwner, storageReady])

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
  const guestOnHuman = !actingAsOwner && channel === 'human'

  useEffect(() => {
    if (hidden || actingAsOwner) {
      if (actingAsOwner && !activeThreadId) setHanaMessages([])
      return undefined
    }
    if (!guestOnHuman || !guestChatId) {
      if (!guestOnHuman) setHanaMessages([])
      return undefined
    }
    const unsub = subscribeChatMessages(
      guestChatId,
      (next) => {
        setHanaMessages(next)
        setError('')
      },
      (err) => setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。'),
    )
    markThreadRead(guestChatId, 'guest').catch(() => {})
    return unsub
  }, [hidden, actingAsOwner, guestOnHuman, guestChatId])

  useEffect(() => {
    if (hidden || !actingAsOwner || !activeThreadId) {
      if (actingAsOwner && !activeThreadId) setHanaMessages([])
      return undefined
    }
    const unsub = subscribeChatMessages(
      activeThreadId,
      (next) => {
        setHanaMessages(next)
        setError('')
      },
      (err) => setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。'),
    )
    markThreadRead(activeThreadId, 'hana').catch(() => {})
    return unsub
  }, [hidden, actingAsOwner, activeThreadId])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [aiMessages, hanaMessages, open, channel, activeThreadId, actingAsOwner])

  useEffect(() => {
    if (actingAsOwner || channel !== 'ai') {
      setShowHumanSuggest(false)
      return
    }
    const guestTurns = aiMessages.filter((m) => m.role === 'guest').length
    setShowHumanSuggest(guestTurns >= 1)
  }, [aiMessages, channel, actingAsOwner])

  if (hidden) return null

  const switchToHuman = (noticeText) => {
    setChannel('human')
    setShowHumanSuggest(false)
    if (noticeText) {
      setHumanNotice(noticeText)
      setAiMessages((prev) => {
        if (prev.some((m) => m.id === HUMAN_SWITCH_NOTICE_ID || m.kind === 'human-switch')) {
          return prev
        }
        return [
          ...prev,
          {
            id: HUMAN_SWITCH_NOTICE_ID,
            role: 'hanachan',
            text: noticeText,
            kind: 'human-switch',
          },
        ]
      })
    }
  }

  const visibleMessages = actingAsOwner || guestOnHuman
    ? hanaMessages.map((m) => ({
        id: m.id,
        role: m.sender === 'hana' ? 'hana' : 'guest',
        text: m.text,
      }))
    : aiMessages

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError('')
    setBusy(true)
    setSpeaking(true)

    try {
      if (actingAsOwner) {
        if (!activeThreadId) {
          setError('返信する相手を選んでください。')
          return
        }
        await sendChatMessage({
          threadId: activeThreadId,
          text,
          sender: 'hana',
        })
      } else if (channel === 'human' || wantsHumanHana(text)) {
        if (channel !== 'human') {
          switchToHuman(HUMAN_SWITCH_INTENT)
        }
        const threadId = guestChatId || ensureGuestChatId()
        if (!guestChatId) setGuestChatId(threadId)
        await sendChatMessage({
          threadId,
          text,
          sender: 'guest',
          guestLabel: guestLabelFromUid(threadId),
        })
        setChannel('human')
      } else {
        const history = aiMessages
          .filter((m) => m.id !== INTRO_ID && m.kind !== 'human-switch' && m.kind !== 'intro')
          .map((m) => ({
            role: m.role === 'guest' ? 'user' : 'model',
            text: m.text,
          }))
        setAiMessages((prev) => [
          ...prev,
          { id: `g-${Date.now()}`, role: 'guest', text },
        ])
        const data = await chatWithHanachan({ message: text, history })
        if (data?.reason === 'quota') {
          switchToHuman(HUMAN_SWITCH_QUOTA)
          const threadId = guestChatId || ensureGuestChatId()
          if (!guestChatId) setGuestChatId(threadId)
          await sendChatMessage({
            threadId,
            text,
            sender: 'guest',
            guestLabel: guestLabelFromUid(threadId),
          })
          return
        }
        const reply = String(data?.reply || '').trim()
        setAiMessages((prev) => [
          ...prev,
          {
            id: `h-${Date.now()}`,
            role: 'hanachan',
            text: reply || '……うまくお返事できなかったみたい。もう一度試してみてね。',
          },
        ])
      }
    } catch (err) {
      console.error(err)
      const msg = getFirebaseErrorMessage(err) || ''
      const looksQuota = /quota|credit|resource-exhausted|429/i.test(`${err?.code || ''} ${msg} ${err?.message || ''}`)
      if (!actingAsOwner && channel === 'ai' && looksQuota) {
        switchToHuman(HUMAN_SWITCH_QUOTA)
        try {
          const threadId = guestChatId || ensureGuestChatId()
          await sendChatMessage({
            threadId,
            text,
            sender: 'guest',
            guestLabel: guestLabelFromUid(threadId),
          })
        } catch (sendErr) {
          setError(getFirebaseErrorMessage(sendErr) || '送信に失敗しました。')
        }
      } else {
        setError(msg || '送信に失敗しました。')
        if (!actingAsOwner && channel === 'ai') {
          setAiMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: 'hanachan',
              text: 'ごめんね、いま少し調子が悪いみたい。少ししてからまた話そうね。はな本人と話したいときは「本物のはなと話したい」と送ってね。',
            },
          ])
        }
      }
    } finally {
      setBusy(false)
      window.setTimeout(() => setSpeaking(false), 600)
    }
  }

  const modeTitle = actingAsOwner
    ? 'はな（返信）'
    : channel === 'human'
      ? 'はな'
      : 'はなちゃん'
  const modeSub = actingAsOwner
    ? 'ゲストへの返信'
    : channel === 'human'
      ? HUMAN_MODE_HINT
      : 'AI のはなちゃん'

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

          {actingAsOwner ? (
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

          {!actingAsOwner && channel === 'human' ? (
            <div className="hana-chat-channel-banner" role="status">
              <p>{humanNotice || HUMAN_MODE_HINT}</p>
              <button
                type="button"
                onClick={() => {
                  setChannel('ai')
                  setHumanNotice('')
                }}
              >
                はなちゃんに戻る
              </button>
            </div>
          ) : null}

          <div className="hana-chat-messages" ref={listRef} role="log" aria-live="polite">
            {actingAsOwner && !activeThreadId ? (
              <p className="hana-chat-empty">上のリストから返信する相手を選んでね。</p>
            ) : null}
            {!actingAsOwner && guestOnHuman && visibleMessages.length === 0 ? (
              <p className="hana-chat-empty">はなにメッセージを送ると、ここに返信が届きます。</p>
            ) : null}
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`hana-chat-bubble is-${message.role}${message.kind === 'human-switch' || message.kind === 'intro' ? ' is-notice' : ''}`}
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

          {!actingAsOwner && channel === 'ai' && showHumanSuggest ? (
            <div className="hana-chat-suggest">
              <button
                type="button"
                onClick={() => switchToHuman(HUMAN_SWITCH_INTENT)}
              >
                本物のはなと話したい
              </button>
            </div>
          ) : null}

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
                actingAsOwner
                  ? 'ゲストに返信…'
                  : channel === 'human'
                    ? 'はなに送る…'
                    : 'はなちゃんに話しかける…'
              }
              maxLength={2000}
              disabled={busy || (actingAsOwner && !activeThreadId)}
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
