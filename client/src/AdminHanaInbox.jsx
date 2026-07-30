import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './Admin.css'
import ChatImageLightbox from './ChatImageLightbox'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import EmotionMomentLayer, { EMOTION_MOMENTS } from './EmotionMoment'
import FlowerRainLayer, { CHAT_PARTY_REACTION } from './FlowerRain'
import HanaSticker, { isHanaSticker } from './HanaStickers'
import OwnerMessageAssist from './OwnerMessageAssist'
import hanachanArt from './assets/hanachan.svg'
import {
    addChatReminder,
    remindAtFromChoice,
    toggleChatPin,
} from './chatExtras'
import { readDefaultReaction } from './chatSettings'
import {
    analyzeGuestMessageForOwner,
    clearAllChatHistories,
    clearChatThreadHistory,
    deleteChatAccount,
    deliveryStatusLabel,
    ensureChatThread,
    ensureDefaultChatAccounts,
    formatChatTimestamp,
    getFirebaseErrorMessage,
    getMessageDeliveryStatus,
    listGuestProfiles,
    listOwnerProfiles,
    markThreadRead,
    OWNER_PROFILE,
    pulseChatPresence,
    resolveAvatarSrc,
    resolveChatPresence,
    sendChatMessage,
    softDeleteChatMessage,
    subscribeChatAccounts,
    subscribeChatMessages,
    subscribeChatProfiles,
    subscribeChatThreads,
    toggleChatReaction,
    translateChatMessage,
    updateChatMessage,
    upsertChatAccount,
} from './firebase'
import './hana-chat.css'

const EMPTY_ACCOUNT_FORM = {
  key: '',
  passKey: '',
  displayName: '',
  addressAs: '',
  role: 'guest',
}

const OWNER_ASSIST_CACHE_LIMIT = 40

function isOwnerAssistableGuestMessage(message) {
  if (!message || message.deleted) return false
  if (message.sender !== 'guest') return false
  if (message.sticker || message.imageUrl || message.effect) return false
  return Boolean(String(message.rawText || message.text || '').trim())
}

/**
 * Admin inbox for Hana realtime chat + guest roster (used on /admin).
 */
export default function AdminHanaInbox() {
  const [threads, setThreads] = useState([])
  const [chatAccounts, setChatAccounts] = useState([])
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
  const [translations, setTranslations] = useState({})
  const [ownerAssist, setOwnerAssist] = useState({})
  const [remindMessage, setRemindMessage] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [defaultReaction] = useState(() => readDefaultReaction())
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM)
  const [editingAccountKey, setEditingAccountKey] = useState(null)
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const listRef = useRef(null)
  const ownerAssistBaselineRef = useRef('')
  const ownerAssistSeenRef = useRef(new Set())
  const ownerAssistSeededRef = useRef(false)

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
    ensureDefaultChatAccounts().catch(() => {})
    return subscribeChatAccounts(
      (next) => setChatAccounts(next || []),
      (err) => setError(getFirebaseErrorMessage(err) || 'ユーザー一覧の読み込みに失敗しました。'),
    )
  }, [])

  useEffect(() => {
    const ids = chatAccounts.map((account) => account.key)
    if (!ids.includes(OWNER_PROFILE.key)) ids.push(OWNER_PROFILE.key)
    return subscribeChatProfiles(
      ids,
      (next) => setChatProfiles(next || {}),
      () => {},
    )
  }, [chatAccounts])

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

  const messagesScrollKey = useMemo(() => {
    const last = messages[messages.length - 1]
    return [
      activeId || '',
      String(messages.length),
      last?.id || '',
      last?.text || '',
      last?.editedAt || '',
      last?.deleted ? '1' : '0',
    ].join('\0')
  }, [messages, activeId])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messagesScrollKey])

  const guestRoster = useMemo(() => {
    return listGuestProfiles(chatAccounts).map((profile) => {
      const threadId = `guest-${profile.key}`
      const thread = threads.find((t) => t.id === threadId || t.guestKey === profile.key) || null
      return { profile, threadId, thread, kind: 'guest' }
    })
  }, [threads, chatAccounts])

  const ownerRoster = useMemo(() => {
    return listOwnerProfiles(chatAccounts).map((profile) => ({
      profile,
      threadId: null,
      thread: null,
      kind: 'owner',
    }))
  }, [chatAccounts])

  const resetAccountForm = () => {
    setAccountForm(EMPTY_ACCOUNT_FORM)
    setEditingAccountKey(null)
    setAccountFormOpen(false)
  }

  const startCreateAccount = (role = 'guest') => {
    setEditingAccountKey(null)
    setAccountForm({ ...EMPTY_ACCOUNT_FORM, role })
    setAccountFormOpen(true)
  }

  const startEditAccount = (profile) => {
    setEditingAccountKey(profile.key)
    setAccountForm({
      key: profile.key,
      passKey: profile.passKey || profile.key,
      displayName: profile.displayName || '',
      addressAs: profile.addressAs || profile.displayName || '',
      role: profile.role === 'owner' ? 'owner' : 'guest',
    })
    setAccountFormOpen(true)
  }

  const handleSaveAccount = async (event) => {
    event.preventDefault()
    setAccountBusy(true)
    setError('')
    setStatusNote('')
    try {
      const saved = await upsertChatAccount({
        key: editingAccountKey || accountForm.key,
        passKey: accountForm.passKey || accountForm.key,
        displayName: accountForm.displayName,
        addressAs: accountForm.addressAs,
        role: accountForm.role,
      }, { isNew: !editingAccountKey })
      setStatusNote(`${saved.displayName}を保存しました。`)
      resetAccountForm()
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || 'ユーザーの保存に失敗しました。')
    } finally {
      setAccountBusy(false)
    }
  }

  const handleDeleteAccount = async (profile) => {
    const label = profile.displayName || profile.key
    const ok = window.confirm(
      profile.role === 'owner'
        ? `オーナー「${label}」を削除しますか？`
        : `ゲスト「${label}」を削除しますか？チャット履歴も消えます。`,
    )
    if (!ok) return
    setAccountBusy(true)
    setError('')
    setStatusNote('')
    try {
      await deleteChatAccount(profile.key, { clearHistory: profile.role === 'guest' })
      if (editingAccountKey === profile.key) resetAccountForm()
      if (profile.role === 'guest') {
        const threadId = `guest-${profile.key}`
        if (activeId === threadId) {
          setActiveId(null)
          setMessages([])
          clearComposerExtras()
        }
      }
      setStatusNote(`${label}を削除しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || 'ユーザーの削除に失敗しました。')
    } finally {
      setAccountBusy(false)
    }
  }

  const otherThreads = useMemo(() => {
    const knownIds = new Set(guestRoster.map((entry) => entry.threadId))
    const knownKeys = new Set(guestRoster.map((entry) => entry.profile.key))
    return threads.filter((t) => !knownIds.has(t.id) && !knownKeys.has(t.guestKey))
  }, [threads, guestRoster])

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId],
  )

  const activeGuestName = useMemo(() => {
    if (!activeId) return ''
    const known = guestRoster.find((entry) => entry.threadId === activeId)?.profile
    return known?.displayName || activeThread?.guestLabel || 'ゲスト'
  }, [activeId, activeThread, guestRoster])

  const requestOwnerAssist = useCallback(async (message, { force = false } = {}) => {
    if (!message?.id) return
    const text = String(message.rawText || message.text || '').trim()
    if (!text) return

    let shouldSkip = false
    setOwnerAssist((prev) => {
      const current = prev[message.id]
      if (!force && (current?.status === 'loading' || current?.status === 'ready')) {
        shouldSkip = true
        return prev
      }
      const next = {
        ...prev,
        [message.id]: {
          status: 'loading',
          translationVi: '',
          readingHiragana: '',
          replies: [],
          reason: null,
        },
      }
      const keys = Object.keys(next)
      if (keys.length <= OWNER_ASSIST_CACHE_LIMIT) return next
      const trimmed = { ...next }
      keys.slice(0, keys.length - OWNER_ASSIST_CACHE_LIMIT).forEach((key) => {
        delete trimmed[key]
      })
      return trimmed
    })
    if (shouldSkip) return

    const index = messages.findIndex((item) => item.id === message.id)
    const historySource = (index >= 0 ? messages.slice(0, index) : messages)
      .filter((item) => !item.deleted && String(item.text || '').trim())
      .slice(-8)
      .map((item) => ({
        role: item.sender === 'hana' ? 'model' : 'user',
        text: String(item.rawText || item.text || '').trim(),
      }))

    try {
      const data = await analyzeGuestMessageForOwner({
        text,
        guestName: activeGuestName,
        history: historySource,
      })
      const ok = Boolean(data.translationVi || data.readingHiragana || data.replies?.length)
      setOwnerAssist((prev) => ({
        ...prev,
        [message.id]: {
          status: ok ? 'ready' : 'error',
          translationVi: data.translationVi || '',
          readingHiragana: data.readingHiragana || '',
          replies: Array.isArray(data.replies) ? data.replies : [],
          reason: data.reason || (ok ? null : 'empty'),
        },
      }))
    } catch {
      setOwnerAssist((prev) => ({
        ...prev,
        [message.id]: {
          status: 'error',
          translationVi: '',
          readingHiragana: '',
          replies: [],
          reason: 'error',
        },
      }))
    }
  }, [activeGuestName, messages])

  useEffect(() => {
    if (!activeId) {
      ownerAssistBaselineRef.current = ''
      ownerAssistSeenRef.current = new Set()
      ownerAssistSeededRef.current = false
      return undefined
    }

    if (ownerAssistBaselineRef.current !== activeId) {
      ownerAssistBaselineRef.current = activeId
      ownerAssistSeenRef.current = new Set()
      ownerAssistSeededRef.current = false
    }

    if (!ownerAssistSeededRef.current) {
      if (messages.length === 0) {
        const timer = window.setTimeout(() => {
          if (ownerAssistBaselineRef.current !== activeId) return
          if (ownerAssistSeededRef.current) return
          ownerAssistSeenRef.current = new Set()
          ownerAssistSeededRef.current = true
        }, 600)
        return () => window.clearTimeout(timer)
      }
      ownerAssistSeenRef.current = new Set(messages.map((item) => item.id).filter(Boolean))
      ownerAssistSeededRef.current = true
      return undefined
    }

    const newcomers = messages.filter((item) => (
      isOwnerAssistableGuestMessage(item)
      && !ownerAssistSeenRef.current.has(item.id)
    ))
    newcomers.forEach((item) => {
      ownerAssistSeenRef.current.add(item.id)
      void requestOwnerAssist(item)
    })
    return undefined
  }, [activeId, messages, requestOwnerAssist])

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
    const known = guestRoster.find((entry) => entry.threadId === activeId)?.profile
    if (known) return known.key
    return String(activeThread?.guestKey || '').trim().toLowerCase()
  }, [activeId, activeThread, guestRoster])

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

  const handleReact = async (message, emoji, options = {}) => {
    if (!activeId || message?.deleted || !emoji || !message?.id) return
    try {
      await toggleChatReaction({
        threadId: activeId,
        messageId: message.id,
        emoji,
        reactorId: OWNER_PROFILE.key,
        mode: options.mode || 'toggle',
      })
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'リアクションに失敗しました。')
    }
  }

  const handleMenuAction = (actionId, message) => {
    if (!message || message.deleted) return false
    const profileId = OWNER_PROFILE.key

    if (actionId === 'pin') {
      const result = toggleChatPin(profileId, message, { threadId: activeId || '' })
      setStatusNote(result.pinned ? 'ピン留めしました' : 'ピンを外しました')
      return true
    }
    if (actionId === 'remind') {
      setRemindMessage(message)
      return true
    }
    if (actionId === 'translate') {
      const text = String(message.rawText || message.text || '').trim()
      if (!text) return true
      setStatusNote('ベトナム語に翻訳中…')
      void translateChatMessage({ text, targetLang: 'vi' })
        .then((data) => {
          if (!data.translation) {
            setStatusNote(data.reason === 'quota' ? '翻訳クォータ不足です' : '翻訳に失敗しました')
            return
          }
          setTranslations((prev) => ({ ...prev, [message.id]: data.translation }))
          setStatusNote('ベトナム語に翻訳しました')
        })
        .catch((err) => {
          setStatusNote(getFirebaseErrorMessage(err) || '翻訳に失敗しました')
        })
      return true
    }
    return false
  }

  const confirmReminder = (choice) => {
    if (!remindMessage) return
    const remindAt = remindAtFromChoice(choice)
    if (!remindAt) {
      setRemindMessage(null)
      return
    }
    addChatReminder(OWNER_PROFILE.key, remindMessage, remindAt, { threadId: activeId || '' })
    setRemindMessage(null)
    setStatusNote('リマインダーをセットしました')
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
  const activeGuestPresence = resolveChatPresence({
    onlineAt: activeThread?.guestOnlineAt,
    status: activeThread?.guestStatus,
  }, presenceTick)

  return (
    <>
      <FlowerRainLayer />
      <EmotionMomentLayer />
      <section className="admin-card admin-chat-card">
        <div className="admin-logs-header">
          <div>
            <h2>ユーザー管理</h2>
            <p>ゲスト / オーナーの追加・編集・削除と会話スレッド</p>
          </div>
          <div className="admin-user-header-actions">
            <button
              type="button"
              className="admin-primary"
              disabled={accountBusy}
              onClick={() => startCreateAccount('guest')}
            >
              ゲスト追加
            </button>
            <button
              type="button"
              className="admin-primary"
              disabled={accountBusy}
              onClick={() => startCreateAccount('owner')}
            >
              オーナー追加
            </button>
            <button
              type="button"
              className="admin-danger"
              disabled={busy || clearBusy}
              onClick={handleClearAllHistories}
            >
              {clearBusy ? '削除中…' : '全チャット履歴を削除'}
            </button>
          </div>
        </div>

        {statusNote ? <p className="admin-status-note">{statusNote}</p> : null}

        {accountFormOpen ? (
          <form className="admin-account-form" onSubmit={handleSaveAccount}>
            <strong>{editingAccountKey ? 'ユーザー編集' : 'ユーザー追加'}</strong>
            <div className="admin-account-form-grid">
              <label>
                役割
                <select
                  value={accountForm.role}
                  disabled={Boolean(editingAccountKey)}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="guest">ゲスト</option>
                  <option value="owner">オーナー</option>
                </select>
              </label>
              <label>
                ID（ログイン用・変更不可）
                <input
                  value={accountForm.key}
                  disabled={Boolean(editingAccountKey)}
                  placeholder="hiro"
                  autoComplete="off"
                  onChange={(event) => setAccountForm((prev) => ({
                    ...prev,
                    key: event.target.value,
                    passKey: prev.passKey || event.target.value,
                  }))}
                  required={!editingAccountKey}
                />
              </label>
              <label>
                パスワード
                <input
                  value={accountForm.passKey}
                  placeholder="ログインパスワード"
                  autoComplete="off"
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, passKey: event.target.value }))}
                  required
                />
              </label>
              <label>
                表示名
                <input
                  value={accountForm.displayName}
                  placeholder="ヒロ"
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  required
                />
              </label>
              <label>
                呼び方
                <input
                  value={accountForm.addressAs}
                  placeholder="表示名と同じでもOK"
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, addressAs: event.target.value }))}
                />
              </label>
            </div>
            <div className="admin-account-form-actions">
              <button type="submit" className="admin-primary" disabled={accountBusy}>
                {accountBusy ? '保存中…' : '保存'}
              </button>
              <button type="button" className="admin-danger admin-danger--ghost" disabled={accountBusy} onClick={resetAccountForm}>
                キャンセル
              </button>
            </div>
          </form>
        ) : null}

        <div className="admin-guest-roster" aria-label="オーナー一覧">
          {ownerRoster.map(({ profile }) => (
            <article key={`owner-${profile.key}`} className="admin-guest-card is-owner">
              <div className="admin-guest-card-main">
                <strong className="admin-guest-name">
                  <span className="admin-guest-avatar-wrap">
                    <img
                      className="admin-guest-avatar"
                      src={avatarSrcForProfile(profile.key, profile.displayName)}
                      alt=""
                    />
                  </span>
                  {profile.displayName}
                  <span className="admin-guest-online-label is-online">オーナー</span>
                </strong>
                <span className="admin-guest-meta">
                  id: {profile.key}
                  {' · '}
                  pass: {profile.passKey || profile.key}
                  {profile.addressAs !== profile.displayName ? ` · 呼び: ${profile.addressAs}` : ''}
                </span>
              </div>
              <div className="admin-guest-card-actions">
                <button type="button" className="admin-primary" disabled={accountBusy} onClick={() => startEditAccount(profile)}>
                  編集
                </button>
                <button
                  type="button"
                  className="admin-danger admin-danger--ghost"
                  disabled={accountBusy || ownerRoster.length <= 1}
                  onClick={() => { void handleDeleteAccount(profile) }}
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="admin-guest-roster" aria-label="ゲスト一覧">
          {guestRoster.map(({ profile, thread, threadId }) => {
            const presence = resolveChatPresence({
              onlineAt: thread?.guestOnlineAt,
              status: thread?.guestStatus,
            }, presenceTick)
            return (
              <article
                key={profile.key}
                className={`admin-guest-card${activeId === threadId ? ' is-active' : ''}${thread?.unreadByHana ? ' is-unread' : ''}`}
              >
                <div className="admin-guest-card-main">
                  <strong className="admin-guest-name">
                    <span className="admin-guest-avatar-wrap">
                      <img
                        className="admin-guest-avatar"
                        src={avatarSrcForProfile(profile.key, profile.displayName)}
                        alt=""
                      />
                      <span className={`admin-guest-dot ${presence.className}`} aria-hidden="true" />
                    </span>
                    {profile.displayName}
                    <span className={`admin-guest-online-label ${presence.className}`}>{presence.label}</span>
                  </strong>
                  <span className="admin-guest-meta">
                    id: {profile.key}
                    {' · '}
                    pass: {profile.passKey || profile.key}
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
                  <button type="button" className="admin-primary" disabled={accountBusy} onClick={() => startEditAccount(profile)}>
                    編集
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
                  <button
                    type="button"
                    className="admin-danger admin-danger--ghost"
                    disabled={accountBusy}
                    onClick={() => { void handleDeleteAccount(profile) }}
                  >
                    削除
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
            {guestRoster.map(({ profile, thread, threadId }) => {
              const presence = resolveChatPresence({
                onlineAt: thread?.guestOnlineAt,
                status: thread?.guestStatus,
              }, presenceTick)
              return (
              <button
                key={threadId}
                type="button"
                className={`admin-chat-thread${activeId === threadId ? ' is-active' : ''}${thread?.unreadByHana ? ' is-unread' : ''}`}
                onClick={() => handleOpenGuest(profile)}
              >
                <strong className="admin-guest-name">
                  <span className="admin-guest-avatar-wrap is-sm">
                    <img
                      className="admin-guest-avatar admin-guest-avatar--sm"
                      src={avatarSrcForProfile(profile.key, profile.displayName)}
                      alt=""
                    />
                    <span
                      className={`admin-guest-dot ${presence.className}`}
                      title={presence.label}
                      aria-hidden="true"
                    />
                  </span>
                  {profile.displayName}
                </strong>
                <span>{thread?.lastText || '（未開始）'}</span>
              </button>
              )
            })}
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
                      <span className="admin-guest-avatar-wrap is-sm">
                        <img
                          className="admin-guest-avatar admin-guest-avatar--sm"
                          src={avatarSrcForProfile(activeGuestKey || 'guest', activeGuestName)}
                          alt=""
                        />
                        <span
                          className={`admin-guest-dot ${activeGuestPresence.className}`}
                          title={activeGuestPresence.label}
                          aria-hidden="true"
                        />
                      </span>
                      {activeGuestName}
                    </strong>
                    <span>{activeGuestPresence.label} · とチャット中</span>
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
                    const showsSticker = !message.deleted && isHanaSticker(message.sticker)
                    const showsImage = !message.deleted && Boolean(message.imageUrl)
                    const effectEmoji = !message.deleted && message.effect
                      ? (String(message.effectEmoji || '').trim()
                        || EMOTION_MOMENTS.find((item) => item.id === message.effect)?.emoji
                        || (message.effect === 'party' ? CHAT_PARTY_REACTION : '')
                        || (message.effect === 'flower' ? defaultReaction : ''))
                      : ''
                    const showsEffect = Boolean(effectEmoji)
                    const avatarSrc = avatarSrcForMessage(message)
                    return (
                      <div key={message.id} className={`hana-chat-msg-row ${isOwn ? 'is-own' : 'is-other'}`}>
                        {!isOwn ? (
                          <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
                        ) : null}
                        <div className="hana-chat-msg-main">
                          {isOwn && (timeLabel || !message.deleted || (message.editedAt && !message.deleted)) ? (
                            <div className="hana-chat-msg-aside">
                              {isOwn && !message.deleted ? (
                                <span className={`hana-chat-delivery is-${delivery || 'sent'}`}>
                                  {delivery ? deliveryStatusLabel(delivery) : '送信済'}
                                </span>
                              ) : null}
                              {timeLabel ? (
                                <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
                              ) : null}
                              {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
                            </div>
                          ) : null}
                          <ChatSwipeBubble
                            className={`${isOwn ? 'is-own' : 'is-other'} is-${message.sender}`}
                            canReply={!message.deleted}
                            canEdit={mutable && !showsSticker && !showsEffect && !showsImage}
                            canDelete={mutable}
                            canReact={!message.deleted}
                            showFlowerReact={!message.deleted && !isOwn}
                            defaultReaction={defaultReaction}
                            reactions={message.reactions || {}}
                            reactorId={OWNER_PROFILE.key}
                            copyText={message.deleted || showsImage ? '' : (message.rawText || message.text || '')}
                            onReply={() => startReply(message)}
                            onEdit={() => startEdit(message)}
                            onDelete={() => handleDelete(message)}
                            onReact={(emoji, options) => { void handleReact(message, emoji, options) }}
                            onMenuAction={(actionId) => handleMenuAction(actionId, message)}
                          >
                            <div className={`admin-chat-bubble is-${message.sender}${message.deleted ? ' is-deleted' : ''}${showsSticker ? ' is-sticker' : ''}${showsEffect ? ' is-effect' : ''}${showsImage ? ' is-image' : ''}`}>
                              {message.replyTo ? (
                                <div className="hana-chat-quote">
                                  <strong>{labelForSender(message.replyTo.sender)}</strong>
                                  <span>{message.replyTo.text}</span>
                                </div>
                              ) : null}
                              {showsSticker ? (
                                <HanaSticker id={message.sticker} size={96} title={message.text} />
                              ) : showsImage ? (
                                <button
                                  type="button"
                                  className="hana-chat-image-link"
                                  data-no-bubble-press="true"
                                  aria-label="画像を拡大表示"
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setPreviewImage({
                                      src: message.imageUrl,
                                      alt: message.text || '写真',
                                    })
                                  }}
                                >
                                  <img
                                    className="hana-chat-image"
                                    src={message.imageUrl}
                                    alt={message.text || '写真'}
                                    loading="lazy"
                                  />
                                </button>
                              ) : showsEffect ? (
                                <div className="hana-chat-effect-msg">
                                  <span className="hana-chat-effect-msg-emoji" aria-hidden="true">{effectEmoji}</span>
                                  <p className="hana-chat-effect-msg-caption">{message.text}</p>
                                </div>
                              ) : (
                                <p>{message.text}</p>
                              )}
                              {translations[message.id] ? (
                                <p className="hana-chat-translation">{translations[message.id]}</p>
                              ) : null}
                            </div>
                          </ChatSwipeBubble>
                          {!isOwn && ownerAssist[message.id] ? (
                            <OwnerMessageAssist
                              assist={ownerAssist[message.id]}
                              onRetry={() => { void requestOwnerAssist(message, { force: true }) }}
                              onUseReply={(text) => {
                                setDraft(String(text || '').trim())
                                setEditingId(null)
                              }}
                            />
                          ) : null}
                          {!isOwn && (timeLabel || (message.editedAt && !message.deleted)) ? (
                            <div className="hana-chat-msg-aside">
                              {timeLabel ? (
                                <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
                              ) : null}
                              {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
                            </div>
                          ) : null}
                        </div>
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
                {remindMessage ? (
                  <div className="hana-chat-action-sheet" role="dialog" aria-label="リマインダー">
                    <strong>いつ知らせる？</strong>
                    <div className="hana-chat-action-sheet-row">
                      <button type="button" onClick={() => confirmReminder('1h')}>1時間後</button>
                      <button type="button" onClick={() => confirmReminder('3h')}>3時間後</button>
                      <button type="button" onClick={() => confirmReminder('tonight')}>今夜</button>
                      <button type="button" onClick={() => confirmReminder('tomorrow')}>明日の朝</button>
                    </div>
                    <button type="button" className="is-cancel" onClick={() => setRemindMessage(null)}>キャンセル</button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
      {previewImage ? (
        <ChatImageLightbox
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
    </>
  )
}
