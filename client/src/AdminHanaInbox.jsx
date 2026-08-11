import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './Admin.css'
import ChatImageLightbox from './ChatImageLightbox'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import EmotionMomentLayer, { EMOTION_MOMENTS } from './EmotionMoment'
import FlowerRainLayer, { CHAT_PARTY_REACTION } from './FlowerRain'
import HanaCall from './HanaCall'
import HanaSticker, { isHanaSticker } from './HanaStickers'
import OwnerMessageAssist, {
    buildOwnerAssistCombinedText,
    collectUnansweredOwnerAssistMessages,
    OWNER_ASSIST_BURST_DEBOUNCE_MS,
    ownerAssistShouldCollapse,
} from './OwnerMessageAssist'
import hanachanArt from './assets/hanachan.svg'
import { getAvatarPresetSrc } from './avatarPresets'
import {
    addChatReminder,
    remindAtFromChoice,
    toggleChatPin,
} from './chatExtras'
import { renderChatTextWithLinks } from './chatLinkify'
import { readDefaultReaction } from './chatSettings'
import {
    ACCOUNT_IDLE_DAYS_NEVER,
    analyzeGuestMessageForOwner,
    clearAllChatHistories,
    clearChatThreadHistory,
    DEFAULT_ACCOUNT_IDLE_DAYS,
    DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES,
    deleteChatAccount,
    deleteChatMessage,
    deliveryStatusLabel,
    ensureChatThread,
    ensureDefaultChatAccounts,
    formatChatFileSize,
    formatChatTimestamp,
    getChatMessageAttachment,
    getFirebaseErrorMessage,
    getMessageDeliveryStatus,
    isProtectedOwnerAccount,
    listGuestProfiles,
    listOwnerProfiles,
    markThreadRead,
    messageEditWindowMsFromMinutes,
    normalizeAccountIdleDays,
    OWNER_PROFILE,
    pulseChatPresence,
    resolveAvatarSrc,
    resolveChatPresence,
    sendChatMessage,
    setAccountActiveState,
    setAccountIdleDays,
    setGuestAlbumAccess,
    setGuestPlaylistAccess,
    subscribeChatAccounts,
    subscribeChatAppSettings,
    subscribeChatMessages,
    subscribeChatProfiles,
    subscribeChatThreads,
    subscribeToSharedPhotoAlbums,
    subscribeToSharedPlaylists,
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
  /** null = every playlist; string[] = only those ids */
  allowedPlaylistIds: null,
  /** null = every album; string[] = only those ids */
  allowedAlbumIds: null,
}

const OWNER_ASSIST_CACHE_LIMIT = 40

function isOwnerAssistableGuestMessage(message) {
  if (!message || message.deleted) return false
  if (message.sender !== 'guest') return false
  if (message.sticker || message.imageUrl || message.fileUrl || message.effect) return false
  return Boolean(String(message.rawText || message.text || '').trim())
}

/**
 * Admin inbox for Hana realtime chat + guest roster (used on /admin).
 * @param {{ section?: 'users'|'chat'|'none', onUnreadChange?: (count: number) => void }} props
 *   Both sections stay mounted regardless of `section` so Firestore
 *   subscriptions and the unread badge survive tab switches.
 */
export default function AdminHanaInbox({ section = 'users', onUnreadChange, onOpenChat }) {
  const [threads, setThreads] = useState([])
  const [chatAccounts, setChatAccounts] = useState([])
  const [editWindowMs, setEditWindowMs] = useState(
    () => messageEditWindowMsFromMinutes(DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES),
  )
  const [accountIdleDaysGlobal, setAccountIdleDaysGlobal] = useState(DEFAULT_ACCOUNT_IDLE_DAYS)
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
  const [ownerAssistEnabled, setOwnerAssistEnabled] = useState(true)
  const [remindMessage, setRemindMessage] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [defaultReaction] = useState(() => readDefaultReaction())
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM)
  const [editingAccountKey, setEditingAccountKey] = useState(null)
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [sharedPlaylists, setSharedPlaylists] = useState([])
  const [playlistAccessBusyKey, setPlaylistAccessBusyKey] = useState('')
  const [sharedAlbums, setSharedAlbums] = useState([])
  const [albumAccessBusyKey, setAlbumAccessBusyKey] = useState('')
  const listRef = useRef(null)
  const ownerAssistBaselineRef = useRef('')
  const ownerAssistSeenRef = useRef(new Set())
  const ownerAssistOpenedAtRef = useRef(0)
  const ownerAssistSeedRef = useRef('')
  const ownerAssistDebounceRef = useRef(0)
  const ownerAssistReqRef = useRef(0)
  const messagesRef = useRef([])

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
    return subscribeToSharedPlaylists(
      (next) => setSharedPlaylists(Array.isArray(next) ? next : []),
      () => {},
    )
  }, [])

  useEffect(() => {
    return subscribeToSharedPhotoAlbums(
      (next) => setSharedAlbums(Array.isArray(next) ? next : []),
      () => {},
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
    if (!node) return undefined
    const toBottom = () => { node.scrollTop = node.scrollHeight }
    toBottom()
    // Assist cards, stickers and images can grow the log after the first pass,
    // so repeat once the browser has laid them out.
    const frame = window.requestAnimationFrame(toBottom)
    const timer = window.setTimeout(toBottom, 200)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
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
    setAccountForm({ ...EMPTY_ACCOUNT_FORM, role, allowedPlaylistIds: null, allowedAlbumIds: null })
    setAccountFormOpen(true)
  }

  const startEditAccount = (profile) => {
    const live = chatAccounts.find((item) => item.key === profile.key) || profile
    setEditingAccountKey(profile.key)
    setAccountForm({
      key: profile.key,
      passKey: profile.passKey || profile.key,
      displayName: profile.displayName || '',
      addressAs: profile.addressAs || profile.displayName || '',
      role: profile.role === 'owner' ? 'owner' : 'guest',
      allowedPlaylistIds: live.role === 'guest'
        ? (Object.prototype.hasOwnProperty.call(live, 'allowedPlaylistIds')
          ? live.allowedPlaylistIds
          : null)
        : null,
      allowedAlbumIds: live.role === 'guest'
        ? (Object.prototype.hasOwnProperty.call(live, 'allowedAlbumIds')
          ? live.allowedAlbumIds
          : null)
        : null,
    })
    setAccountFormOpen(true)
  }

  const formAllowsPlaylist = (playlistId) => {
    if (accountForm.role !== 'guest') return true
    if (accountForm.allowedPlaylistIds == null) return true
    return accountForm.allowedPlaylistIds.includes(playlistId)
  }

  const toggleFormPlaylist = (playlistId) => {
    setAccountForm((prev) => {
      if (prev.role !== 'guest') return prev
      const allIds = sharedPlaylists.map((item) => item.id)
      const current = prev.allowedPlaylistIds == null ? allIds : prev.allowedPlaylistIds
      const nextSet = new Set(current)
      if (nextSet.has(playlistId)) nextSet.delete(playlistId)
      else nextSet.add(playlistId)
      const next = allIds.filter((id) => nextSet.has(id))
      return {
        ...prev,
        allowedPlaylistIds: next.length === allIds.length ? null : next,
      }
    })
  }

  const setFormPlaylistAccessAll = (allowAll) => {
    setAccountForm((prev) => ({
      ...prev,
      allowedPlaylistIds: allowAll ? null : [],
    }))
  }

  const guestAllowsPlaylist = (guest, playlistId) => {
    if (!guest || guest.role !== 'guest') return true
    if (guest.allowedPlaylistIds == null) return true
    return guest.allowedPlaylistIds.includes(playlistId)
  }

  const handleMatrixToggle = async (guest, playlistId) => {
    if (!guest?.key || playlistAccessBusyKey) return
    const allIds = sharedPlaylists.map((item) => item.id)
    const current = guest.allowedPlaylistIds == null ? allIds : [...guest.allowedPlaylistIds]
    const nextSet = new Set(current)
    if (nextSet.has(playlistId)) nextSet.delete(playlistId)
    else nextSet.add(playlistId)
    const next = allIds.filter((id) => nextSet.has(id))
    const allowedPlaylistIds = next.length === allIds.length ? null : next
    setPlaylistAccessBusyKey(`${guest.key}:${playlistId}`)
    setError('')
    try {
      await setGuestPlaylistAccess(guest.key, allowedPlaylistIds)
      setStatusNote(`${guest.displayName}のプレイリスト権限を更新しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '権限の更新に失敗しました。')
    } finally {
      setPlaylistAccessBusyKey('')
    }
  }

  const handleMatrixSetRow = async (guest, allowAll) => {
    if (!guest?.key || playlistAccessBusyKey) return
    setPlaylistAccessBusyKey(`${guest.key}:row`)
    setError('')
    try {
      await setGuestPlaylistAccess(guest.key, allowAll ? null : [])
      setStatusNote(`${guest.displayName}のプレイリスト権限を更新しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '権限の更新に失敗しました。')
    } finally {
      setPlaylistAccessBusyKey('')
    }
  }

  const formAllowsAlbum = (albumId) => {
    if (accountForm.role !== 'guest') return true
    if (accountForm.allowedAlbumIds == null) return true
    return accountForm.allowedAlbumIds.includes(albumId)
  }

  const toggleFormAlbum = (albumId) => {
    setAccountForm((prev) => {
      if (prev.role !== 'guest') return prev
      const allIds = sharedAlbums.map((item) => item.id)
      const current = prev.allowedAlbumIds == null ? allIds : prev.allowedAlbumIds
      const nextSet = new Set(current)
      if (nextSet.has(albumId)) nextSet.delete(albumId)
      else nextSet.add(albumId)
      const next = allIds.filter((id) => nextSet.has(id))
      return {
        ...prev,
        allowedAlbumIds: next.length === allIds.length ? null : next,
      }
    })
  }

  const setFormAlbumAccessAll = (allowAll) => {
    setAccountForm((prev) => ({
      ...prev,
      allowedAlbumIds: allowAll ? null : [],
    }))
  }

  const guestAllowsAlbum = (guest, albumId) => {
    if (!guest || guest.role !== 'guest') return true
    if (guest.allowedAlbumIds == null) return true
    return guest.allowedAlbumIds.includes(albumId)
  }

  const handleAlbumMatrixToggle = async (guest, albumId) => {
    if (!guest?.key || albumAccessBusyKey) return
    const allIds = sharedAlbums.map((item) => item.id)
    const current = guest.allowedAlbumIds == null ? allIds : [...guest.allowedAlbumIds]
    const nextSet = new Set(current)
    if (nextSet.has(albumId)) nextSet.delete(albumId)
    else nextSet.add(albumId)
    const next = allIds.filter((id) => nextSet.has(id))
    const allowedAlbumIds = next.length === allIds.length ? null : next
    setAlbumAccessBusyKey(`${guest.key}:${albumId}`)
    setError('')
    try {
      await setGuestAlbumAccess(guest.key, allowedAlbumIds)
      setStatusNote(`${guest.displayName}のフォトアルバム権限を更新しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '権限の更新に失敗しました。')
    } finally {
      setAlbumAccessBusyKey('')
    }
  }

  const handleAlbumMatrixSetRow = async (guest, allowAll) => {
    if (!guest?.key || albumAccessBusyKey) return
    setAlbumAccessBusyKey(`${guest.key}:row`)
    setError('')
    try {
      await setGuestAlbumAccess(guest.key, allowAll ? null : [])
      setStatusNote(`${guest.displayName}のフォトアルバム権限を更新しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '権限の更新に失敗しました。')
    } finally {
      setAlbumAccessBusyKey('')
    }
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
        ...(accountForm.role === 'guest'
          ? {
            allowedPlaylistIds: accountForm.allowedPlaylistIds,
            allowedAlbumIds: accountForm.allowedAlbumIds,
          }
          : {}),
      }, { isNew: !editingAccountKey })
      setStatusNote(`${saved.displayName}を保存しました。`)
      resetAccountForm()
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || 'ユーザーの保存に失敗しました。')
    } finally {
      setAccountBusy(false)
    }
  }

  const handleToggleAccountActive = async (profile) => {
    if (!profile?.key || isProtectedOwnerAccount(profile.key)) return
    const live = chatAccounts.find((item) => item.key === profile.key) || profile
    const nextActive = live.accountActive === false
    const label = live.displayName || live.key
    const ok = window.confirm(
      nextActive
        ? `「${label}」を再開しますか？`
        : `「${label}」を停止しますか？停止中はログインできません。`,
    )
    if (!ok) return
    setAccountBusy(true)
    setError('')
    setStatusNote('')
    try {
      await setAccountActiveState(live.key, nextActive, { by: 'admin' })
      setStatusNote(nextActive ? `${label}を再開しました。` : `${label}を停止しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '状態の更新に失敗しました。')
    } finally {
      setAccountBusy(false)
    }
  }

  const resolveLiveAccount = (profile) => (
    chatAccounts.find((item) => item.key === profile.key) || profile
  )

  const accountStatusBadge = (profile) => {
    const live = resolveLiveAccount(profile)
    if (isProtectedOwnerAccount(live.key)) {
      return <span className="admin-badge admin-badge--ok">保護</span>
    }
    if (live.accountActive === false) {
      return <span className="admin-badge admin-badge--warn">停止中</span>
    }
    return <span className="admin-badge admin-badge--ok">有効</span>
  }

  const accountLastAccessLabel = (profile) => {
    const live = resolveLiveAccount(profile)
    if (!live.lastAccessAt) return '最終利用: —'
    return `最終利用: ${formatChatTimestamp(live.lastAccessAt)}`
  }

  const accountIdlePolicyLabel = (profile) => {
    const live = resolveLiveAccount(profile)
    if (isProtectedOwnerAccount(live.key)) return '自動停止: なし（保護）'
    const own = normalizeAccountIdleDays(live.idleDays, { allowNull: true })
    if (own === ACCOUNT_IDLE_DAYS_NEVER) return '自動停止: 無期限'
    if (own == null) {
      if (accountIdleDaysGlobal === ACCOUNT_IDLE_DAYS_NEVER) return '自動停止: 全体（無期限）'
      return `自動停止: 全体（${accountIdleDaysGlobal}日）`
    }
    return `自動停止: ${own}日`
  }

  const handleAccountIdlePolicyChange = async (profile, mode, customDays = '') => {
    if (!profile?.key || isProtectedOwnerAccount(profile.key) || accountBusy) return
    let next = null
    if (mode === 'never') next = ACCOUNT_IDLE_DAYS_NEVER
    else if (mode === 'custom') {
      const n = Math.floor(Number(customDays))
      if (!Number.isFinite(n) || n <= 0) {
        setError('日数は1以上で指定してください。')
        return
      }
      next = normalizeAccountIdleDays(n, { allowNull: false })
    } else {
      next = null
    }
    setAccountBusy(true)
    setError('')
    setStatusNote('')
    try {
      await setAccountIdleDays(profile.key, next)
      const label = profile.displayName || profile.key
      setStatusNote(
        next == null
          ? `${label}: 自動停止を全体設定に合わせました。`
          : next === ACCOUNT_IDLE_DAYS_NEVER
            ? `${label}: 自動停止なし（無期限）にしました。`
            : `${label}: ${next}日で自動停止に設定しました。`,
      )
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || err?.message || '自動停止設定の更新に失敗しました。')
    } finally {
      setAccountBusy(false)
    }
  }

  const renderIdlePolicyControls = (profile) => {
    if (isProtectedOwnerAccount(profile.key)) return null
    const live = resolveLiveAccount(profile)
    const own = normalizeAccountIdleDays(live.idleDays, { allowNull: true })
    const mode = own === ACCOUNT_IDLE_DAYS_NEVER ? 'never' : own == null ? 'inherit' : 'custom'
    return (
      <label className="admin-idle-policy">
        <span>自動停止</span>
        <select
          className="admin-input admin-idle-policy-select"
          disabled={accountBusy}
          value={mode}
          onChange={(event) => {
            const nextMode = event.target.value
            if (nextMode === 'custom') {
              const days = window.prompt('何日利用がなければ自動停止しますか？', String(own > 0 ? own : accountIdleDaysGlobal || DEFAULT_ACCOUNT_IDLE_DAYS))
              if (days == null) return
              void handleAccountIdlePolicyChange(profile, 'custom', days)
              return
            }
            void handleAccountIdlePolicyChange(profile, nextMode)
          }}
        >
          <option value="inherit">全体と同じ</option>
          <option value="custom">{mode === 'custom' ? `${own}日（変更）` : '日数を指定…'}</option>
          <option value="never">無期限</option>
        </select>
      </label>
    )
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

  messagesRef.current = messages

  const requestOwnerAssist = useCallback(async (message, { force = false, batch = null } = {}) => {
    if (!ownerAssistEnabled || !message?.id) return
    const batchMessages = (Array.isArray(batch) && batch.length > 0)
      ? batch.filter(Boolean)
      : [message]
    const target = batchMessages[batchMessages.length - 1] || message
    if (!target?.id) return
    const text = buildOwnerAssistCombinedText(batchMessages)
    if (!text) return

    let shouldSkip = false
    setOwnerAssist((prev) => {
      const current = prev[target.id]
      if (!force && (current?.status === 'loading' || current?.status === 'ready')) {
        shouldSkip = true
        return prev
      }
      const next = { ...prev }
      for (const item of batchMessages.slice(0, -1)) {
        if (item?.id) delete next[item.id]
      }
      next[target.id] = {
        status: 'loading',
        translationVi: '',
        readingHiragana: '',
        replies: [],
        reason: null,
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

    const reqId = ++ownerAssistReqRef.current
    const firstId = batchMessages[0]?.id
    const firstIndex = messages.findIndex((item) => item.id === firstId)
    const historySource = (firstIndex >= 0 ? messages.slice(0, firstIndex) : messages)
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
      if (reqId !== ownerAssistReqRef.current && !force) return
      const ok = Boolean(data.translationVi || data.readingHiragana)
      setOwnerAssist((prev) => {
        const next = { ...prev }
        for (const item of batchMessages.slice(0, -1)) {
          if (item?.id) delete next[item.id]
        }
        next[target.id] = {
          status: ok ? 'ready' : 'error',
          translationVi: data.translationVi || '',
          readingHiragana: data.readingHiragana || '',
          replies: [],
          reason: data.reason || (ok ? null : 'empty'),
          sourceText: text,
        }
        return next
      })
    } catch {
      if (reqId !== ownerAssistReqRef.current && !force) return
      setOwnerAssist((prev) => ({
        ...prev,
        [target.id]: {
          status: 'error',
          translationVi: '',
          readingHiragana: '',
          replies: [],
          reason: 'error',
        },
      }))
    }
  }, [ownerAssistEnabled, activeGuestName, messages])

  // One combined はな専用 card for the unanswered guest streak (debounced bursts).
  useEffect(() => {
    if (!activeId || !ownerAssistEnabled) {
      ownerAssistBaselineRef.current = ''
      ownerAssistSeenRef.current = new Set()
      ownerAssistOpenedAtRef.current = 0
      ownerAssistSeedRef.current = ''
      window.clearTimeout(ownerAssistDebounceRef.current)
      if (!ownerAssistEnabled) setOwnerAssist({})
      return undefined
    }

    if (ownerAssistBaselineRef.current !== activeId) {
      ownerAssistBaselineRef.current = activeId
      ownerAssistSeenRef.current = new Set()
      ownerAssistOpenedAtRef.current = Date.now()
      ownerAssistSeedRef.current = ''
      window.clearTimeout(ownerAssistDebounceRef.current)
    }

    if (ownerAssistSeedRef.current !== activeId && messages.length) {
      ownerAssistSeedRef.current = activeId
      const streak = collectUnansweredOwnerAssistMessages(messages, {
        isAssistable: isOwnerAssistableGuestMessage,
        max: 8,
      })
      streak.forEach((item) => ownerAssistSeenRef.current.add(item.id))
      const last = streak[streak.length - 1]
      if (last) void requestOwnerAssist(last, { force: true, batch: streak })
    }

    const openedAt = ownerAssistOpenedAtRef.current
    const newcomers = messages.filter((item) => {
      if (!isOwnerAssistableGuestMessage(item)) return false
      if (ownerAssistSeenRef.current.has(item.id)) return false
      const createdAt = Date.parse(item.createdAt || '')
      return Number.isFinite(createdAt) && createdAt >= openedAt
    })
    if (newcomers.length) {
      newcomers.forEach((item) => ownerAssistSeenRef.current.add(item.id))
      const previewStreak = collectUnansweredOwnerAssistMessages(messages, {
        isAssistable: isOwnerAssistableGuestMessage,
        max: 8,
      })
      const previewLast = previewStreak[previewStreak.length - 1]
      if (previewLast) {
        setOwnerAssist((prev) => {
          const next = { ...prev }
          for (const item of previewStreak.slice(0, -1)) {
            if (item?.id) delete next[item.id]
          }
          next[previewLast.id] = {
            status: 'loading',
            translationVi: '',
            readingHiragana: '',
            replies: [],
            reason: null,
          }
          return next
        })
      }
      window.clearTimeout(ownerAssistDebounceRef.current)
      ownerAssistDebounceRef.current = window.setTimeout(() => {
        const streak = collectUnansweredOwnerAssistMessages(messagesRef.current, {
          isAssistable: isOwnerAssistableGuestMessage,
          max: 8,
        })
        const last = streak[streak.length - 1]
        if (!last) return
        void requestOwnerAssist(last, { force: true, batch: streak })
      }, OWNER_ASSIST_BURST_DEBOUNCE_MS)
    }

    return () => {
      window.clearTimeout(ownerAssistDebounceRef.current)
    }
  }, [activeId, ownerAssistEnabled, messages, requestOwnerAssist])

  const clearComposerExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const labelForSender = (sender) => (sender === 'hana' ? 'はな' : activeGuestName)

  const avatarSrcForProfile = (profileId, displayName) => {
    const id = String(profileId || '').trim().toLowerCase() || 'guest'
    const fallback = id === OWNER_PROFILE.key || id === 'hana' ? hanachanArt : ''
    const profile = chatProfiles[id] || {}
    return resolveAvatarSrc(
      id,
      displayName || id,
      profile.avatarUrl || '',
      fallback,
      getAvatarPresetSrc(profile.avatarPresetId),
    )
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
    onOpenChat?.()
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

  useEffect(() => {
    const unsubscribe = subscribeChatAppSettings(
      (settings) => {
        setEditWindowMs(messageEditWindowMsFromMinutes(settings?.messageEditWindowMinutes))
        setOwnerAssistEnabled(settings?.ownerAssistEnabled !== false)
        setAccountIdleDaysGlobal(settings?.accountIdleDays ?? DEFAULT_ACCOUNT_IDLE_DAYS)
      },
      () => {},
    )
    return unsubscribe
  }, [])

  const canMutateMessage = (message) => canMutateOwnMessage(message, {
    unreadByPartner: getMessageDeliveryStatus(message, activeThread, 'hana') === 'sent',
    windowMs: editWindowMs,
  })

  const startEdit = (message) => {
    if (!canMutateMessage(message) || message.deleted) return
    setReplyTo(null)
    setEditingId(message.id)
    setDraft(message.rawText || message.text)
  }

  const handleDelete = async (message) => {
    if (!canMutateMessage(message) || message.deleted || !activeId) return
    if (!window.confirm('このメッセージを削除しますか？')) return
    try {
      await deleteChatMessage({ threadId: activeId, messageId: message.id })
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
      if (!text) {
        setStatusNote('翻訳できるテキストがありません')
        return true
      }
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

  // Threads whose guest account no longer exists (auto labels like ゲスト霧24)
  // can only be cleaned up from here, so deletion removes the doc for good.
  const handleDeleteThread = async (thread) => {
    if (!thread?.id || clearBusy) return
    const label = thread.guestLabel || thread.id
    const ok = window.confirm(`スレッド「${label}」を完全に削除しますか？\nこの操作は取り消せません。`)
    if (!ok) return
    setClearBusy(true)
    setError('')
    setStatusNote('')
    try {
      await clearChatThreadHistory(thread.id, { deleteThread: true })
      if (activeId === thread.id) {
        setActiveId(null)
        setMessages([])
        clearComposerExtras()
      }
      setStatusNote(`${label}を削除しました。`)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'スレッドの削除に失敗しました。')
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

  useEffect(() => {
    onUnreadChange?.(unread)
  }, [unread, onUnreadChange])

  const activeGuestPresence = resolveChatPresence({
    onlineAt: activeThread?.guestOnlineAt,
    status: activeThread?.guestStatus,
  }, presenceTick)

  return (
    <>
      <FlowerRainLayer />
      <EmotionMomentLayer />
      <section className="admin-panel" hidden={section !== 'users'}>
        <div className="admin-panel-head">
          <div>
            <h2>
              ユーザー管理
              <span className="admin-badge">{ownerRoster.length + guestRoster.length}</span>
            </h2>
            <p>ゲスト / オーナーの発行・編集・削除と会話スレッド。長期間利用がないアカウントは設定日数で自動停止されます（hana除く・無期限設定可）。</p>
          </div>
          <div className="admin-user-header-actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={accountBusy}
              onClick={() => startCreateAccount('guest')}
            >
              ゲスト追加
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={accountBusy}
              onClick={() => startCreateAccount('owner')}
            >
              オーナー追加
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              disabled={busy || clearBusy}
              onClick={handleClearAllHistories}
            >
              {clearBusy ? '削除中…' : '全履歴を削除'}
            </button>
          </div>
        </div>

        <div className="admin-panel-body">
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
                ID（固定・変更不可）
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
            {accountForm.role === 'guest' ? (
              <div className="admin-account-playlists">
                <div className="admin-account-playlists-head">
                  <strong>アクセスできるプレイリスト</strong>
                  <div className="admin-account-playlists-quick">
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setFormPlaylistAccessAll(true)}>
                      すべて
                    </button>
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setFormPlaylistAccessAll(false)}>
                      なし
                    </button>
                  </div>
                </div>
                {sharedPlaylists.length === 0 ? (
                  <p className="admin-hint">まだ共有プレイリストがありません。アプリ側で作成するとここに表示されます。</p>
                ) : (
                  <div className="admin-account-playlist-checks" role="group" aria-label="プレイリスト権限">
                    {sharedPlaylists.map((playlist) => (
                      <label key={playlist.id} className="admin-playlist-check">
                        <input
                          type="checkbox"
                          checked={formAllowsPlaylist(playlist.id)}
                          onChange={() => toggleFormPlaylist(playlist.id)}
                        />
                        <span>{playlist.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="admin-hint">「すべて」「お気に入り」は常に利用できます。許可していないプレイリストの曲は「すべて」からも除外されます。</p>
              </div>
            ) : null}
            {accountForm.role === 'guest' ? (
              <div className="admin-account-playlists">
                <div className="admin-account-playlists-head">
                  <strong>アクセスできるフォトアルバム</strong>
                  <div className="admin-account-playlists-quick">
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setFormAlbumAccessAll(true)}>
                      すべて
                    </button>
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setFormAlbumAccessAll(false)}>
                      なし
                    </button>
                  </div>
                </div>
                {sharedAlbums.length === 0 ? (
                  <p className="admin-hint">まだ共有フォトアルバムがありません。アプリ側で作成するとここに表示されます。</p>
                ) : (
                  <div className="admin-account-playlist-checks" role="group" aria-label="フォトアルバム権限">
                    {sharedAlbums.map((album) => (
                      <label key={album.id} className="admin-playlist-check">
                        <input
                          type="checkbox"
                          checked={formAllowsAlbum(album.id)}
                          onChange={() => toggleFormAlbum(album.id)}
                        />
                        <span>{album.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="admin-hint">許可していないアルバムはゲストのライブラリに表示されません。</p>
              </div>
            ) : null}
            <div className="admin-account-form-actions">
              <button type="submit" className="admin-btn admin-btn--primary" disabled={accountBusy}>
                {accountBusy ? '保存中…' : '保存'}
              </button>
              <button type="button" className="admin-btn admin-btn--ghost" disabled={accountBusy} onClick={resetAccountForm}>
                キャンセル
              </button>
            </div>
          </form>
        ) : null}

        <p className="admin-group-label">オーナー</p>
        <div className="admin-guest-roster" aria-label="オーナー一覧">
          {ownerRoster.map(({ profile }) => (
            <article key={`owner-${profile.key}`} className={`admin-guest-card is-owner${resolveLiveAccount(profile).accountActive === false ? ' is-inactive' : ''}`}>
              <div className="admin-guest-card-main">
                <strong className="admin-guest-name">
                  <span className="admin-guest-avatar-wrap">
                    <img
                      className="admin-guest-avatar"
                      src={avatarSrcForProfile(profile.key, profile.displayName)}
                      alt=""
                    />
                  </span>
                  <span className="admin-guest-name-text">{profile.displayName}</span>
                  <span className="admin-badge admin-badge--owner">オーナー</span>
                  {accountStatusBadge(profile)}
                </strong>
                <span className="admin-cred-row">
                  <span className="admin-cred"><b>id</b><span>{profile.key}</span></span>
                  <span className="admin-cred"><b>pass</b><span>{profile.passKey || profile.key}</span></span>
                  {profile.addressAs !== profile.displayName ? (
                    <span className="admin-cred"><b>呼び</b><span>{profile.addressAs}</span></span>
                  ) : null}
                </span>
                <span className="admin-guest-meta">{accountLastAccessLabel(profile)} · {accountIdlePolicyLabel(profile)}</span>
              </div>
              <div className="admin-guest-card-actions">
                {renderIdlePolicyControls(profile)}
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  disabled={accountBusy}
                  onClick={() => startEditAccount(profile)}
                >
                  編集
                </button>
                {!isProtectedOwnerAccount(profile.key) ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    disabled={accountBusy}
                    onClick={() => { void handleToggleAccountActive(profile) }}
                  >
                    {resolveLiveAccount(profile).accountActive === false ? '再開' : '停止'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={accountBusy || ownerRoster.length <= 1 || isProtectedOwnerAccount(profile.key)}
                  onClick={() => { void handleDeleteAccount(profile) }}
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>

        <p className="admin-group-label">ゲスト</p>
        <div className="admin-guest-roster" aria-label="ゲスト一覧">
          {guestRoster.map(({ profile, thread, threadId }) => {
            const presence = resolveChatPresence({
              onlineAt: thread?.guestOnlineAt,
              status: thread?.guestStatus,
            }, presenceTick)
            return (
              <article
                key={profile.key}
                className={`admin-guest-card${activeId === threadId ? ' is-active' : ''}${thread?.unreadByHana ? ' is-unread' : ''}${resolveLiveAccount(profile).accountActive === false ? ' is-inactive' : ''}`}
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
                    <span className="admin-guest-name-text">{profile.displayName}</span>
                    <span className={`admin-guest-online-label ${presence.className}`}>{presence.label}</span>
                    {thread?.unreadByHana ? <span className="admin-badge admin-badge--warn">未読</span> : null}
                    {accountStatusBadge(profile)}
                  </strong>
                  <span className="admin-cred-row">
                    <span className="admin-cred"><b>id</b><span>{profile.key}</span></span>
                    <span className="admin-cred"><b>pass</b><span>{profile.passKey || profile.key}</span></span>
                    {profile.addressAs !== profile.displayName ? (
                      <span className="admin-cred"><b>呼び</b><span>{profile.addressAs}</span></span>
                    ) : null}
                  </span>
                  <span className="admin-guest-meta">
                    {thread?.updatedAt
                      ? `最終メッセージ: ${formatChatTimestamp(thread.updatedAt)}`
                      : 'まだ会話なし'}
                    {' · '}
                    {accountLastAccessLabel(profile)}
                    {' · '}
                    {accountIdlePolicyLabel(profile)}
                  </span>
                  {thread?.lastText ? (
                    <span className="admin-guest-preview">{thread.lastText}</span>
                  ) : null}
                </div>
                <div className="admin-guest-card-actions">
                  {renderIdlePolicyControls(profile)}
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary admin-btn--sm"
                    disabled={busy || clearBusy}
                    onClick={() => handleOpenGuest(profile)}
                  >
                    チャットを開く
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    disabled={accountBusy}
                    onClick={() => { void handleToggleAccountActive(profile) }}
                  >
                    {resolveLiveAccount(profile).accountActive === false ? '再開' : '停止'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    disabled={accountBusy}
                    onClick={() => startEditAccount(profile)}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
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
                    className="admin-btn admin-btn--ghost admin-btn--sm"
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

        <section className="admin-playlist-matrix" aria-label="プレイリスト権限">
          <div className="admin-playlist-matrix-head">
            <p className="admin-group-label">プレイリスト権限</p>
            <p className="admin-hint">行＝ゲスト、列＝プレイリスト。未チェックのリストは非表示で、その曲は「すべて」からも除外されます。</p>
          </div>
          {sharedPlaylists.length === 0 ? (
            <p className="admin-hint">共有プレイリストがまだありません。</p>
          ) : guestRoster.length === 0 ? (
            <p className="admin-hint">ゲストがまだいません。</p>
          ) : (
            <div className="admin-playlist-matrix-scroll">
              <table className="admin-playlist-matrix-table">
                <thead>
                  <tr>
                    <th scope="col">ゲスト</th>
                    {sharedPlaylists.map((playlist) => (
                      <th key={playlist.id} scope="col" title={playlist.name}>
                        <span>{playlist.name}</span>
                      </th>
                    ))}
                    <th scope="col">一括</th>
                  </tr>
                </thead>
                <tbody>
                  {guestRoster.map(({ profile }) => {
                    const guest = chatAccounts.find((item) => item.key === profile.key) || profile
                    const rowBusy = playlistAccessBusyKey.startsWith(`${guest.key}:`)
                    return (
                      <tr key={`matrix-${guest.key}`}>
                        <th scope="row">{guest.displayName}</th>
                        {sharedPlaylists.map((playlist) => {
                          const checked = guestAllowsPlaylist(guest, playlist.id)
                          const cellBusy = playlistAccessBusyKey === `${guest.key}:${playlist.id}`
                          return (
                            <td key={`${guest.key}-${playlist.id}`}>
                              <label className="admin-matrix-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={Boolean(playlistAccessBusyKey) || accountBusy}
                                  onChange={() => { void handleMatrixToggle(guest, playlist.id) }}
                                  aria-label={`${guest.displayName} / ${playlist.name}`}
                                />
                                {cellBusy ? <span className="admin-matrix-busy">…</span> : null}
                              </label>
                            </td>
                          )
                        })}
                        <td className="admin-matrix-row-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy || accountBusy}
                            onClick={() => { void handleMatrixSetRow(guest, true) }}
                          >
                            全
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy || accountBusy}
                            onClick={() => { void handleMatrixSetRow(guest, false) }}
                          >
                            無
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-album-matrix" aria-label="フォトアルバム権限">
          <div className="admin-album-matrix-head">
            <p className="admin-group-label">フォトアルバム権限</p>
            <p className="admin-hint">行＝ゲスト、列＝フォトアルバム。未チェックのアルバムはゲストに表示されません。</p>
          </div>
          {sharedAlbums.length === 0 ? (
            <p className="admin-hint">共有フォトアルバムがまだありません。</p>
          ) : guestRoster.length === 0 ? (
            <p className="admin-hint">ゲストがまだいません。</p>
          ) : (
            <div className="admin-album-matrix-scroll">
              <table className="admin-album-matrix-table">
                <thead>
                  <tr>
                    <th scope="col">ゲスト</th>
                    {sharedAlbums.map((album) => (
                      <th key={album.id} scope="col" title={album.name}>
                        <span>{album.name}</span>
                      </th>
                    ))}
                    <th scope="col">一括</th>
                  </tr>
                </thead>
                <tbody>
                  {guestRoster.map(({ profile }) => {
                    const guest = chatAccounts.find((item) => item.key === profile.key) || profile
                    const rowBusy = albumAccessBusyKey.startsWith(`${guest.key}:`)
                    return (
                      <tr key={`album-matrix-${guest.key}`}>
                        <th scope="row">{guest.displayName}</th>
                        {sharedAlbums.map((album) => {
                          const checked = guestAllowsAlbum(guest, album.id)
                          const cellBusy = albumAccessBusyKey === `${guest.key}:${album.id}`
                          return (
                            <td key={`${guest.key}-${album.id}`}>
                              <label className="admin-matrix-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={Boolean(albumAccessBusyKey) || accountBusy}
                                  onChange={() => { void handleAlbumMatrixToggle(guest, album.id) }}
                                  aria-label={`${guest.displayName} / ${album.name}`}
                                />
                                {cellBusy ? <span className="admin-matrix-busy">…</span> : null}
                              </label>
                            </td>
                          )
                        })}
                        <td className="admin-matrix-row-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy || accountBusy}
                            onClick={() => { void handleAlbumMatrixSetRow(guest, true) }}
                          >
                            全
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy || accountBusy}
                            onClick={() => { void handleAlbumMatrixSetRow(guest, false) }}
                          >
                            無
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </div>
      </section>

      <section className="admin-panel" hidden={section !== 'chat'}>
        <div className="admin-panel-head">
          <div>
            <h2>
              はなチャット
              {unread ? <span className="admin-count">{unread}</span> : null}
            </h2>
            <p>ゲストからのメッセージに、はなとして返信します</p>
          </div>
        </div>

        {error ? (
          <div className="admin-panel-body">
            <p className="admin-error">{error}</p>
          </div>
        ) : null}

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
            {otherThreads.length ? (
              <p className="admin-thread-group-label">未登録スレッド</p>
            ) : null}
            {otherThreads.map((thread) => (
              <div className="admin-chat-thread-row" key={thread.id}>
                <button
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
                <button
                  type="button"
                  className="admin-thread-delete"
                  title={`${thread.guestLabel}を削除`}
                  aria-label={`${thread.guestLabel}を削除`}
                  disabled={clearBusy}
                  onClick={() => { void handleDeleteThread(thread) }}
                >
                  ×
                </button>
              </div>
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
                      <span className="admin-guest-name-text">{activeGuestName}</span>
                    </strong>
                    <span className={`admin-guest-online-label ${activeGuestPresence.className}`}>
                      {activeGuestPresence.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    disabled={clearBusy}
                    onClick={handleClearActiveThread}
                  >
                    この履歴を削除
                  </button>
                  <HanaCall
                    key={activeId}
                    threadId={activeId}
                    role="hana"
                    partnerName={activeGuestName}
                    compact
                  />
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
                    const mutable = message.sender === 'hana' && canMutateMessage(message)
                    const isOwn = message.sender === 'hana'
                    const showsSticker = !message.deleted && isHanaSticker(message.sticker)
                    const attachment = getChatMessageAttachment(message)
                    const showsImage = Boolean(attachment && attachment.kind === 'image')
                    const showsVideo = Boolean(attachment && attachment.kind === 'video')
                    const showsFile = Boolean(attachment && attachment.kind === 'file')
                    const showsMedia = showsImage || showsVideo || showsFile
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
                        <div className="hana-chat-msg-column">
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
                              canEdit={mutable && !showsSticker && !showsEffect && !showsMedia}
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
                              <div className={`admin-chat-bubble is-${message.sender}${message.deleted ? ' is-deleted' : ''}${showsSticker ? ' is-sticker' : ''}${showsEffect ? ' is-effect' : ''}${showsImage ? ' is-image' : ''}${showsVideo ? ' is-video' : ''}${showsFile ? ' is-file' : ''}`}>
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
                                    aria-label="画像を拡大表示"
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      setPreviewImage({
                                        src: attachment.url,
                                        alt: attachment.fileName || message.text || '写真',
                                      })
                                    }}
                                  >
                                    <img
                                      className="hana-chat-image"
                                      src={attachment.url}
                                      alt={attachment.fileName || message.text || '写真'}
                                      loading="lazy"
                                    />
                                  </button>
                                ) : showsVideo ? (
                                  <div className="hana-chat-video-wrap" data-no-bubble-press="true">
                                    <video
                                      className="hana-chat-video"
                                      src={attachment.url}
                                      controls
                                      playsInline
                                      preload="metadata"
                                    />
                                  </div>
                                ) : showsFile ? (
                                  <a
                                    className="hana-chat-file-card"
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={attachment.fileName || true}
                                    data-no-bubble-press="true"
                                  >
                                    <span className="hana-chat-file-icon" aria-hidden="true">📄</span>
                                    <span className="hana-chat-file-meta">
                                      <strong className="hana-chat-file-name">{attachment.fileName}</strong>
                                      <span className="hana-chat-file-sub">
                                        {attachment.fileSize ? formatChatFileSize(attachment.fileSize) : 'ファイル'}
                                      </span>
                                    </span>
                                  </a>
                                ) : showsEffect ? (
                                  <div className="hana-chat-effect-msg">
                                    <span className="hana-chat-effect-msg-emoji" aria-hidden="true">{effectEmoji}</span>
                                    <p className="hana-chat-effect-msg-caption">{renderChatTextWithLinks(message.text)}</p>
                                  </div>
                                ) : (
                                  <p className="hana-chat-text">{renderChatTextWithLinks(message.text)}</p>
                                )}
                                {translations[message.id] ? (
                                  <p className="hana-chat-translation">{renderChatTextWithLinks(translations[message.id])}</p>
                                ) : null}
                              </div>
                            </ChatSwipeBubble>
                            {!isOwn && (timeLabel || (message.editedAt && !message.deleted)) ? (
                              <div className="hana-chat-msg-aside">
                                {timeLabel ? (
                                  <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
                                ) : null}
                                {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
                              </div>
                            ) : null}
                          </div>
                          {!isOwn && ownerAssistEnabled && ownerAssist[message.id] ? (
                            <OwnerMessageAssist
                              assist={ownerAssist[message.id]}
                              collapsed={ownerAssistShouldCollapse(message.id, messages)}
                              onRetry={() => {
                              const streak = collectUnansweredOwnerAssistMessages(messages, {
                                isAssistable: isOwnerAssistableGuestMessage,
                                max: 8,
                              })
                              const batch = streak.length ? streak : [message]
                              void requestOwnerAssist(batch[batch.length - 1], { force: true, batch })
                            }}
                            />
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
                  <button
                    type="submit"
                    className="admin-btn admin-btn--primary"
                    disabled={busy || !draft.trim()}
                  >
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
