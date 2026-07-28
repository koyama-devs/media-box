import { useEffect, useMemo, useRef, useState } from 'react'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import hanachanArt from './assets/hanachan.svg'
import {
    clearAllChatHistories,
    clearChatThreadHistory,
    deliveryStatusLabel,
    ensureChatThread,
    formatChatTimestamp,
    getFirebaseErrorMessage,
    getMessageDeliveryStatus,
    GUEST_PROFILES,
    isPresenceOnline,
    markThreadRead,
    OWNER_PROFILE,
    pulseChatPresence,
    resolveAvatarSrc,
    sendChatMessage,
    softDeleteChatMessage,
    subscribeChatMessages,
    subscribeChatProfiles,
    subscribeChatThreads,
    toggleChatReaction,
    updateChatMessage,
} from './firebase'
import './hana-chat.css'

const KNOWN_GUESTS = Object.values(GUEST_PROFILES)

/**
 * Admin inbox for Hana realtime chat + guest roster (used on /admin).
 */
export default function AdminHanaInbox() {
  const [threads, setThreads] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [presenceTick, setPresenceTick] = useState(() => Date.now())
  const [clearBusy, setClearBusy] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [chatProfiles, setChatProfiles] = useState({})
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
    const ids = [OWNER_PROFILE.key, ...KNOWN_GUESTS.map((g) => g.key)]
    return subscribeChatProfiles(
      ids,
      (next) => setChatProfiles(next || {}),
      () => {},
    )
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceTick(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return undefined
    }
    const unsub = subscribeChatMessages(
      activeId,
      (next) => {
        setMessages(next)
        markThreadRead(activeId, 'hana').catch(() => {})
      },
      (err) => setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。'),
    )
    markThreadRead(activeId, 'hana').catch(() => {})
    return unsub
  }, [activeId])

  useEffect(() => {
    if (!activeId) return undefined
    const beat = () => {
      pulseChatPresence(activeId, 'hana').catch(() => {})
    }
    beat()
    const timer = window.setInterval(beat, 20_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [activeId])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, activeId])

  const guestRoster = useMemo(() => {
    return KNOWN_GUESTS.map((profile) => {
      const threadId = `guest-${profile.key}`
      const thread = threads.find((t) => t.id === threadId || t.guestKey === profile.key) || null
      return { profile, threadId, thread }
    })
  }, [threads])

  const otherThreads = useMemo(() => {
    const knownIds = new Set(KNOWN_GUESTS.map((g) => `guest-${g.key}`))
    return threads.filter((t) => !knownIds.has(t.id) && !KNOWN_GUESTS.some((g) => g.key === t.guestKey))
  }, [threads])

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId],
  )

  const activeGuestName = useMemo(() => {
    if (!activeId) return ''
    const known = KNOWN_GUESTS.find((g) => `guest-${g.key}` === activeId)
    return known?.displayName || activeThread?.guestLabel || 'ゲスト'
  }, [activeId, activeThread])

  const clearComposerExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const labelForSender = (sender) => (sender === 'hana' ? 'はな' : activeGuestName)

  const avatarSrcForProfile = (profileId, displayName) => {
    const id = String(profileId || '').trim().toLowerCase() || 'guest'
    const fallback = id === OWNER_PROFILE.key || id === 'hana' ? hanachanArt : ''
    return resolveAvatarSrc(id, displayName || id, chatProfiles[id]?.avatarUrl || '', fallback)
  }

  const activeGuestKey = useMemo(() => {
    if (!activeId) return ''
    const known = KNOWN_GUESTS.find((g) => `guest-${g.key}` === activeId)
    if (known) return known.key
    return String(activeThread?.guestKey || '').trim().toLowerCase()
  }, [activeId, activeThread])

  const avatarSrcForMessage = (message) => {
    if (message.sender === 'hana') {
      return avatarSrcForProfile(OWNER_PROFILE.key, OWNER_PROFILE.displayName)
    }
    return avatarSrcForProfile(activeGuestKey || 'guest', activeGuestName)
  }

  const handleOpenGuest = (profile) => {
    const threadId = `guest-${profile.key}`
    setError('')
    clearComposerExtras()
    // Subscribe immediately; ensure thread doc in the background if missing.
    setActiveId(threadId)
    const exists = threads.some((thread) => thread.id === threadId)
    if (exists) return
    void ensureChatThread({
      threadId,
      guestLabel: profile.displayName,
      guestKey: profile.key,
    }).catch((err) => {
      setError(getFirebaseErrorMessage(err) || 'ゲストの準備に失敗しました。')
    })
  }

  const startReply = (message) => {
    if (message.deleted) return
    setEditingId(null)
    setReplyTo({
      id: message.id,
      text: message.text,
      sender: message.sender,
    })
  }

  const startEdit = (message) => {
    if (!canMutateOwnMessage(message) || message.deleted) return
    setReplyTo(null)
    setEditingId(message.id)
    setDraft(message.rawText || message.text)
  }

  const handleDelete = async (message) => {
    if (!canMutateOwnMessage(message) || message.deleted || !activeId) return
    if (!window.confirm('このメッセージを削除しますか？')) return
    try {
      await softDeleteChatMessage({ threadId: activeId, messageId: message.id })
      if (editingId === message.id) {
        setEditingId(null)
        setDraft('')
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '削除に失敗しました。')
    }
  }

  const handleReact = async (message, emoji) => {
    if (!activeId || message?.deleted || !emoji || !message?.id) return
    try {
      await toggleChatReaction({
        threadId: activeId,
        messageId: message.id,
        emoji,
        reactorId: OWNER_PROFILE.key,
      })
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'リアクションに失敗しました。')
    }
  }

  const handleClearActiveThread = async () => {
    if (!activeId || clearBusy) return
    const ok = window.confirm(
      `「${activeGuestName}」とのチャット履歴をすべて削除しますか？\nこの操作は取り消せません。`,
    )
    if (!ok) return
    setClearBusy(true)
    setError('')
    setStatusNote('')
    try {
      await clearChatThreadHistory(activeId, { deleteThread: false })
      setMessages([])
      clearComposerExtras()
      setStatusNote(`${activeGuestName}の履歴を削除しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '履歴の削除に失敗しました。')
    } finally {
      setClearBusy(false)
    }
  }

  const handleClearAllHistories = async () => {
    if (clearBusy) return
    const ok = window.confirm(
      'すべてのゲストのチャット履歴を削除しますか？\nこの操作は取り消せません。',
    )
    if (!ok) return
    const ok2 = window.confirm('本当に全履歴を削除してよろしいですか？')
    if (!ok2) return
    setClearBusy(true)
    setError('')
    setStatusNote('')
    try {
      const count = await clearAllChatHistories()
      setActiveId(null)
      setMessages([])
      clearComposerExtras()
      setStatusNote(`チャット履歴を削除しました（${count}スレッド）。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '全履歴の削除に失敗しました。')
    } finally {
      setClearBusy(false)
    }
  }

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !activeId || busy) return
    setBusy(true)
    setError('')
    const pendingReply = replyTo
    const pendingEditId = editingId
    setDraft('')
    clearComposerExtras()
    try {
      if (pendingEditId) {
        await updateChatMessage({ threadId: activeId, messageId: pendingEditId, text })
      } else {
        await sendChatMessage({
          threadId: activeId,
          text,
          sender: 'hana',
          replyTo: pendingReply,
        })
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '送信に失敗しました。')
    } finally {
      setBusy(false)
    }
  }

  const unread = threads.filter((t) => t.unreadByHana).length
  const activeGuestOnline = isPresenceOnline(activeThread?.guestOnlineAt, presenceTick)

  return (
    <>
      <section className="admin-card admin-chat-card">
        <div className="admin-logs-header">
          <div>
            <h2>ゲスト管理</h2>
            <p>パスワードごとのゲストアカウントと会話スレッド</p>
          </div>
          <button
            type="button"
            className="admin-danger"
            disabled={busy || clearBusy}
            onClick={handleClearAllHistories}
          >
            {clearBusy ? '削除中…' : '全チャット履歴を削除'}
          </button>
        </div>

        {statusNote ? <p className="admin-status-note">{statusNote}</p> : null}

        <div className="admin-guest-roster" aria-label="ゲスト一覧">
          {guestRoster.map(({ profile, thread, threadId }) => {
            const online = isPresenceOnline(thread?.guestOnlineAt, presenceTick)
            return (
              <article
                key={profile.key}
                className={`admin-guest-card${activeId === threadId ? ' is-active' : ''}${thread?.unreadByHana ? ' is-unread' : ''}`}
              >
                <div className="admin-guest-card-main">
                  <strong className="admin-guest-name">
                    <img
                      className="admin-guest-avatar"
                      src={avatarSrcForProfile(profile.key, profile.displayName)}
                      alt=""
                    />
                    <span className={`admin-guest-dot ${online ? 'is-online' : 'is-offline'}`} aria-hidden="true" />
                    {profile.displayName}
                    <span className={`admin-guest-online-label${online ? ' is-online' : ''}`}>{online ? 'オンライン' : 'オフライン'}</span>
                  </strong>
                  <span className="admin-guest-meta">
                    pass: {profile.key}
                    {profile.addressAs !== profile.displayName ? ` · 呼び: ${profile.addressAs}` : ''}
                  </span>
                  <span className="admin-guest-meta">
                    {thread?.updatedAt
                      ? `最終: ${formatChatTimestamp(thread.updatedAt)}`
                      : 'まだ会話なし'}
                    {thread?.unreadByHana ? ' · 未読あり' : ''}
                  </span>
                  {thread?.lastText ? (
                    <span className="admin-guest-preview">{thread.lastText}</span>
                  ) : null}
                </div>
                <div className="admin-guest-card-actions">
                  <button
                    type="button"
                    className="admin-primary"
                    disabled={busy || clearBusy}
                    onClick={() => handleOpenGuest(profile)}
                  >
                    チャットを開く
                  </button>
                  <button
                    type="button"
                    className="admin-danger admin-danger--ghost"
                    disabled={busy || clearBusy || !thread}
                    onClick={async () => {
                      const ok = window.confirm(
                        `「${profile.displayName}」のチャット履歴を削除しますか？`,
                      )
                      if (!ok) return
                      setClearBusy(true)
                      setError('')
                      try {
                        await clearChatThreadHistory(thread.id || threadId, {
                          deleteThread: false,
                        })
                        if (activeId === threadId || activeId === thread?.id) {
                          setMessages([])
                          clearComposerExtras()
                        }
                        setStatusNote(`${profile.displayName}の履歴を削除しました。`)
                      } catch (err) {
                        setError(getFirebaseErrorMessage(err) || '履歴の削除に失敗しました。')
                      } finally {
                        setClearBusy(false)
                      }
                    }}
                  >
                    履歴削除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

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
            {guestRoster.map(({ profile, thread, threadId }) => (
              <button
                key={threadId}
                type="button"
                className={`admin-chat-thread${activeId === threadId ? ' is-active' : ''}${thread?.unreadByHana ? ' is-unread' : ''}`}
                onClick={() => handleOpenGuest(profile)}
              >
                <strong className="admin-guest-name">
                  <img
                    className="admin-guest-avatar admin-guest-avatar--sm"
                    src={avatarSrcForProfile(profile.key, profile.displayName)}
                    alt=""
                  />
                  <span
                    className={`admin-guest-dot ${isPresenceOnline(thread?.guestOnlineAt, presenceTick) ? 'is-online' : 'is-offline'}`}
                    aria-hidden="true"
                  />
                  {profile.displayName}
                </strong>
                <span>{thread?.lastText || '（未開始）'}</span>
              </button>
            ))}
            {otherThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`admin-chat-thread${activeId === thread.id ? ' is-active' : ''}${thread.unreadByHana ? ' is-unread' : ''}`}
                onClick={() => {
                  clearComposerExtras()
                  setActiveId(thread.id)
                }}
              >
                <strong>{thread.guestLabel}</strong>
                <span>{thread.lastText || '—'}</span>
              </button>
            ))}
          </aside>

          <div className="admin-chat-main">
            {!activeId ? (
              <p className="admin-chat-empty">ゲストを選んで返信してください。</p>
            ) : (
              <>
                <div className="admin-chat-active-title">
                  <div>
                    <strong className="admin-guest-name">
                      <img
                        className="admin-guest-avatar admin-guest-avatar--sm"
                        src={avatarSrcForProfile(activeGuestKey || 'guest', activeGuestName)}
                        alt=""
                      />
                      <span
                        className={`admin-guest-dot ${activeGuestOnline ? 'is-online' : 'is-offline'}`}
                        aria-hidden="true"
                      />
                      {activeGuestName}
                    </strong>
                    <span>{activeGuestOnline ? 'オンライン' : 'オフライン'} · とチャット中</span>
                  </div>
                  <button
                    type="button"
                    className="admin-danger admin-danger--ghost"
                    disabled={clearBusy}
                    onClick={handleClearActiveThread}
                  >
                    この履歴を削除
                  </button>
                </div>
                <div className="admin-chat-messages" ref={listRef}>
                  {messages.length === 0 ? (
                    <p className="admin-chat-empty">まだメッセージはありません。先に送っても大丈夫です。</p>
                  ) : null}
                  {messages.map((message) => {
                    const delivery = message.deleted
                      ? null
                      : getMessageDeliveryStatus(message, activeThread, 'hana')
                    const timeLabel = formatChatTimestamp(message.createdAt)
                    const mutable = message.sender === 'hana' && canMutateOwnMessage(message)
                    const isOwn = message.sender === 'hana'
                    const avatarSrc = avatarSrcForMessage(message)
                    return (
                      <div key={message.id} className={`hana-chat-msg-row ${isOwn ? 'is-own' : 'is-other'}`}>
                        {!isOwn ? (
                          <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
                        ) : null}
                        <ChatSwipeBubble
                          className={`${isOwn ? 'is-own' : 'is-other'} is-${message.sender}`}
                          canReply={!message.deleted}
                          canEdit={mutable}
                          canDelete={mutable}
                          canReact={!message.deleted}
                          reactions={message.reactions || {}}
                          reactorId={OWNER_PROFILE.key}
                          copyText={message.deleted ? '' : (message.rawText || message.text || '')}
                          onReply={() => startReply(message)}
                          onEdit={() => startEdit(message)}
                          onDelete={() => handleDelete(message)}
                          onReact={(emoji) => { void handleReact(message, emoji) }}
                        >
                          <div className={`admin-chat-bubble is-${message.sender}${message.deleted ? ' is-deleted' : ''}`}>
                            <span>{labelForSender(message.sender)}</span>
                            {message.replyTo ? (
                              <div className="hana-chat-quote">
                                <strong>{labelForSender(message.replyTo.sender)}</strong>
                                <span>{message.replyTo.text}</span>
                              </div>
                            ) : null}
                            <p>{message.text}</p>
                            {(timeLabel || delivery || message.editedAt) ? (
                              <div className="admin-chat-bubble-meta">
                                {message.editedAt && !message.deleted ? <span>編集済</span> : null}
                                {timeLabel ? <time dateTime={message.createdAt || undefined}>{timeLabel}</time> : null}
                                {delivery ? (
                                  <span className={`admin-chat-delivery is-${delivery}`}>
                                    {deliveryStatusLabel(delivery)}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </ChatSwipeBubble>
                        {isOwn ? (
                          <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {replyTo || editingId ? (
                  <div className="hana-chat-composer-context admin-chat-composer-context">
                    <div>
                      <strong>{editingId ? 'メッセージを編集' : '返信先'}</strong>
                      <span>
                        {editingId
                          ? '内容を直して更新できます'
                          : `${labelForSender(replyTo?.sender)}: ${String(replyTo?.text || '').slice(0, 60)}`}
                      </span>
                    </div>
                    <button type="button" onClick={clearComposerExtras} aria-label="キャンセル">×</button>
                  </div>
                ) : null}
                <form className="admin-chat-composer" onSubmit={handleSend}>
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault()
                        if (!busy && draft.trim()) {
                          event.currentTarget.form?.requestSubmit?.()
                        }
                      }
                    }}
                    placeholder={
                      editingId
                        ? '編集して更新…'
                        : replyTo
                          ? '返信を書く…'
                          : `${activeGuestName}に返信…`
                    }
                    maxLength={2000}
                    disabled={busy}
                  />
                  <button type="submit" className="admin-primary" disabled={busy || !draft.trim()}>
                    {editingId ? '更新' : '送る'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
