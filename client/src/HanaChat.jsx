import { useEffect, useMemo, useRef, useState } from 'react'
import hanachanArt from './assets/hanachan.svg'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import {
  chatWithHanachan,
  deliveryStatusLabel,
  ensureChatThread,
  ensureGuestChatId,
  formatChatTimestamp,
  getFirebaseErrorMessage,
  getGuestProfile,
  getMessageDeliveryStatus,
  GUEST_PROFILES,
  isAdminUser,
  isPresenceOnline,
  markThreadRead,
  migrateLegacyGuestThread,
  OWNER_PROFILE,
  pulseChatPresence,
  resolveAvatarSrc,
  resolveGuestDisplayName,
  resolveSessionProfile,
  sendChatMessage,
  softDeleteChatMessage,
  subscribeChatMessages,
  subscribeChatProfiles,
  subscribeChatThreads,
  subscribeOwnChatThread,
  subscribeToAuthUser,
  suggestHanaChat,
  threadUnreadCount,
  toggleChatReaction,
  updateChatMessage,
} from './firebase'
import './hana-chat.css'

const AI_HISTORY_PREFIX = 'hana-chat-ai-history-'
const CHANNEL_PREFIX = 'hana-chat-channel-'

const INTRO_ID = 'welcome-intro'
const HUMAN_SWITCH_NOTICE_ID = 'notice-human-switch'

const HUMAN_SWITCH_QUOTA =
  'はなちゃん、いま少しお休み中みたい。ここからははな本人に直接メッセージを送れるよ。'

const HUMAN_SWITCH_INTENT =
  'わかったよ。ここからははな本人に直接メッセージを送れるね。気軽に話しかけてみて。'

const WANT_HUMAN_RE =
  /(本物|本当|リアル).{0,6}はな|はな本人|はな(と|に).{0,8}(話|しゃべ|チャット)|人間のはな|実在のはな|real\s*hana|talk\s*to\s*hana|hana\s*(thật|that)|muốn\s*.{0,20}hana\s*thật|nói\s*chuyện\s*với\s*hana\s*thật|chủ\s*nhân|オーナーのはな/i

/** Local chips for owner (real Hana) drafting help. */
const OWNER_EXPRESSION_CHIPS = ['😊', '🌸', '🎶', '✨', 'わくわく', 'だいすき', 'おやすみ', 'がんばって']
const OWNER_TOPIC_CHIPS = [
  '今日なに聴いてる？',
  'おすすめの曲ある？',
  'リスニングスペースどう？',
  '今期アニメ見てる？',
  '最近どう？',
]
const OWNER_FALLBACK_REPLIES = [
  'うん、わかった！',
  'ありがとう、うれしい！',
  'もう少し教えて〜',
  'いいね、それ好き！',
]

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

function defaultIntroMessages(profile) {
  const callName = profile?.addressAs || profile?.displayName || ''
  const greeting = callName
    ? `こんにちは、${callName}！はなちゃんです。`
    : 'こんにちは、はなちゃんです。'
  return [
    {
      id: INTRO_ID,
      role: 'hanachan',
      text:
        `${greeting}メディボックスのことや、ちょっとしたお話、なんでもどうぞ。\n\n` +
        'まずははなちゃんとお話しできます。「本物のはなと話したい」と送ってくれれば、はな本人にもつながります。',
      kind: 'intro',
      createdAt: new Date().toISOString(),
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
export default function HanaChat({ hidden = false, appRole = 'guest', guestKey = '' }) {
  const [open, setOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [guestChatId, setGuestChatId] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [channel, setChannel] = useState('ai') // ai | human (guest only)
  const [aiMessages, setAiMessages] = useState(() => defaultIntroMessages(getGuestProfile(guestKey)))
  const [hanaMessages, setHanaMessages] = useState([])
  const [threads, setThreads] = useState([])
  const [ownThread, setOwnThread] = useState(null)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [showHumanSuggest, setShowHumanSuggest] = useState(false)
  const [humanNotice, setHumanNotice] = useState('')
  const [storageReady, setStorageReady] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [presenceTick, setPresenceTick] = useState(() => Date.now())
  const [chatProfiles, setChatProfiles] = useState({})
  const [ownerSuggestions, setOwnerSuggestions] = useState({ replies: [], topics: [], expressions: [] })
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [suggestPickerGroup, setSuggestPickerGroup] = useState(null) // 'reply' | 'topic' | 'expr' | null
  const [mobileFullscreen, setMobileFullscreen] = useState(true)
  const [guestMenuOpen, setGuestMenuOpen] = useState(false)
  const [copyNote, setCopyNote] = useState('')
  const listRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const composerRef = useRef(null)
  const guestMenuRef = useRef(null)
  const syncPanelViewportRef = useRef(() => {})
  const viewportApplyRef = useRef({ top: 0, height: 0, width: 0, keyboard: false })
  const viewportDebounceRef = useRef(null)
  const keyboardPinnedRef = useRef(false)
  const migrationCheckedRef = useRef(new Set())
  const suggestReqRef = useRef(0)
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const guestProfile = useMemo(() => getGuestProfile(guestKey), [guestKey])
  const guestDisplayName = guestProfile?.displayName || 'ゲスト'
  const guestAddressAs = guestProfile?.addressAs || guestDisplayName
  const guestThreadLabel = guestProfile?.displayName || guestDisplayName

  const isAdmin = isAdminUser(authUser)
  const actingAsOwner = appRole === 'owner' || isAdmin
  const sessionProfile = useMemo(
    () => resolveSessionProfile(actingAsOwner ? 'owner' : 'guest', guestKey),
    [actingAsOwner, guestKey],
  )

  const ownerActiveGuestLabel = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return 'ゲスト'
    const thread = threads.find((entry) => entry.id === activeThreadId)
    return resolveGuestDisplayName({
      threadId: activeThreadId,
      guestKey: thread?.guestKey,
      guestLabel: thread?.guestLabel,
    })
  }, [actingAsOwner, activeThreadId, threads])

  const ownerActiveGuestKey = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return ''
    const thread = threads.find((entry) => entry.id === activeThreadId)
    const fromThread = String(thread?.guestKey || '').trim().toLowerCase()
    if (fromThread) return fromThread
    const known = String(activeThreadId).match(/^guest-(hiro|zen|gabusan)$/i)
    return known ? known[1].toLowerCase() : ''
  }, [actingAsOwner, activeThreadId, threads])

  const ownerGuestRoster = useMemo(() => {
    if (!actingAsOwner) return []
    const usedIds = new Set()
    const known = Object.values(GUEST_PROFILES).map((profile) => {
      const canonicalId = `guest-${profile.key}`
      const matches = threads.filter((t) => (
        t.id === canonicalId
        || t.guestKey === profile.key
        || t.guestLabel === profile.displayName
      ))
      const thread = [...matches].sort((a, b) => {
        const score = (entry) => (entry.lastText ? 4 : 0)
          + (entry.id === canonicalId ? 2 : 0)
          + (entry.guestKey === profile.key ? 1 : 0)
        const diff = score(b) - score(a)
        if (diff !== 0) return diff
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
      })[0] || null
      if (thread?.id) usedIds.add(thread.id)
      return {
        threadId: thread?.id || canonicalId,
        canonicalId,
        label: profile.displayName,
        thread,
        known: true,
        guestKey: profile.key,
      }
    })
    const extras = threads
      .filter((t) => !usedIds.has(t.id) && !Object.values(GUEST_PROFILES).some((p) => (
        p.key === t.guestKey || `guest-${p.key}` === t.id || p.displayName === t.guestLabel
      )))
      .map((thread) => ({
        threadId: thread.id,
        canonicalId: thread.id,
        label: resolveGuestDisplayName(thread),
        thread,
        known: false,
        guestKey: thread.guestKey || '',
      }))
    return [...known, ...extras]
  }, [actingAsOwner, threads])

  const unreadLauncher = useMemo(() => {
    if (actingAsOwner) {
      return threads.reduce((sum, thread) => sum + threadUnreadCount(thread, 'hana'), 0)
    }
    return threadUnreadCount(ownThread, 'guest')
  }, [actingAsOwner, threads, ownThread])

  const threadUnreadSnapshotRef = useRef({})
  const ownerThreadsReadyRef = useRef(false)

  useEffect(() => {
    if (hidden) return undefined
    return subscribeToAuthUser(setAuthUser)
  }, [hidden])

  useEffect(() => {
    if (hidden) {
      setStorageReady(false)
      return
    }
    setStorageReady(false)
    // Never fall back to anonymous "guest" for known password guests.
    if (!actingAsOwner && !getGuestProfile(guestKey)) {
      setGuestChatId('')
      setStorageReady(true)
      return
    }
    const id = ensureGuestChatId(guestKey || (actingAsOwner ? 'guest' : ''))
    const stored = loadAiMessages(id)
    const savedChannel = loadChannel(id)
    setGuestChatId(id)
    setAiMessages(stored?.length ? stored : defaultIntroMessages(guestProfile))
    setChannel(savedChannel)
    setHumanNotice('')
    setStorageReady(true)
  }, [hidden, guestKey, guestProfile, actingAsOwner])

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
      ownerThreadsReadyRef.current = false
      threadUnreadSnapshotRef.current = {}
      return undefined
    }
    return subscribeChatThreads(
      (next) => setThreads(next),
      (err) => setError(getFirebaseErrorMessage(err) || 'スレッドの読み込みに失敗しました。'),
    )
  }, [hidden, actingAsOwner])

  // While inbox is open, jump to the guest thread that just got the newest message.
  useEffect(() => {
    if (hidden || !actingAsOwner) return

    const snapshot = {}
    threads.forEach((thread) => {
      snapshot[thread.id] = {
        count: threadUnreadCount(thread, 'hana'),
        updatedAt: String(thread.updatedAt || ''),
        unread: Boolean(thread.unreadByHana),
      }
    })

    if (!open) {
      threadUnreadSnapshotRef.current = snapshot
      ownerThreadsReadyRef.current = Boolean(threads.length)
      return
    }

    if (!ownerThreadsReadyRef.current) {
      threadUnreadSnapshotRef.current = snapshot
      ownerThreadsReadyRef.current = true
      return
    }

    const prev = threadUnreadSnapshotRef.current
    let newestId = null
    let newestUpdated = ''

    threads.forEach((thread) => {
      const before = prev[thread.id]
      const count = threadUnreadCount(thread, 'hana')
      const updatedAt = String(thread.updatedAt || '')
      const grew = Boolean(thread.unreadByHana) && (
        !before
        || count > (before.count || 0)
        || (updatedAt && updatedAt > (before.updatedAt || ''))
      )
      if (!grew) return
      if (!newestUpdated || updatedAt >= newestUpdated) {
        newestUpdated = updatedAt
        newestId = thread.id
      }
    })

    threadUnreadSnapshotRef.current = snapshot
    if (!newestId || newestId === activeThreadId) return

    const entry = ownerGuestRoster.find((item) => (
      item.threadId === newestId || item.canonicalId === newestId || item.thread?.id === newestId
    ))
    setReplyTo(null)
    setEditingId(null)
    setHanaMessages([])
    if (entry) {
      setActiveThreadId(entry.threadId)
    } else {
      setActiveThreadId(newestId)
    }
  }, [hidden, actingAsOwner, open, threads, activeThreadId, ownerGuestRoster])

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

  useEffect(() => {
    if (hidden) {
      setChatProfiles({})
      return undefined
    }
    const ids = [
      OWNER_PROFILE.key,
      ...Object.keys(GUEST_PROFILES),
      sessionProfile.id,
      ownerActiveGuestKey,
    ].filter(Boolean)
    return subscribeChatProfiles(
      ids,
      (next) => setChatProfiles(next || {}),
      () => {},
    )
  }, [hidden, sessionProfile.id, ownerActiveGuestKey])

  const hanaThreadId = actingAsOwner ? activeThreadId : guestChatId
  const guestOnHuman = !actingAsOwner && channel === 'human'

  useEffect(() => {
    if (hidden || actingAsOwner) {
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
    return unsub
  }, [hidden, actingAsOwner, guestOnHuman, guestChatId])

  useEffect(() => {
    if (hidden || !actingAsOwner || !activeThreadId) {
      if (actingAsOwner && !activeThreadId) setHanaMessages([])
      return undefined
    }
    let cancelled = false
    const unsub = subscribeChatMessages(
      activeThreadId,
      (next) => {
        if (cancelled) return
        setHanaMessages(next)
        setError('')
      },
      (err) => {
        if (cancelled) return
        setError(getFirebaseErrorMessage(err) || 'メッセージの読み込みに失敗しました。')
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [hidden, actingAsOwner, activeThreadId])

  // Only mark read while the chat panel is actually open and visible.
  useEffect(() => {
    if (hidden || !open) return undefined

    const threadId = actingAsOwner
      ? activeThreadId
      : (guestOnHuman ? guestChatId : null)
    if (!threadId) return undefined

    const reader = actingAsOwner ? 'hana' : 'guest'
    const markIfVisible = () => {
      if (document.visibilityState === 'visible') {
        markThreadRead(threadId, reader).catch(() => {})
      }
    }
    markIfVisible()
    document.addEventListener('visibilitychange', markIfVisible)
    return () => document.removeEventListener('visibilitychange', markIfVisible)
  }, [
    hidden,
    open,
    actingAsOwner,
    activeThreadId,
    guestOnHuman,
    guestChatId,
    hanaMessages,
  ])

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

  const activeThreadMeta = useMemo(() => {
    if (actingAsOwner) {
      return threads.find((thread) => thread.id === activeThreadId) || null
    }
    return ownThread
  }, [actingAsOwner, threads, activeThreadId, ownThread])

  useEffect(() => {
    if (hidden || !open) return undefined
    const timer = window.setInterval(() => setPresenceTick(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [hidden, open])

  useEffect(() => {
    if (hidden) return undefined
    const role = actingAsOwner ? 'hana' : 'guest'
    const threadId = actingAsOwner ? activeThreadId : guestChatId
    // Guest: presence while using the app. Owner: while inbox is open on a thread.
    if (!threadId) return undefined
    if (actingAsOwner && !open) return undefined

    const beat = () => {
      pulseChatPresence(threadId, role).catch(() => {})
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
  }, [hidden, open, actingAsOwner, activeThreadId, guestChatId])

  const partnerOnline = useMemo(() => {
    void presenceTick
    if (actingAsOwner) {
      if (!activeThreadId) return false
      return isPresenceOnline(activeThreadMeta?.guestOnlineAt)
    }
    if (channel === 'ai') return true
    return isPresenceOnline(activeThreadMeta?.hanaOnlineAt)
  }, [actingAsOwner, channel, activeThreadMeta, presenceTick, activeThreadId])

  useEffect(() => {
    if (hidden || !open) return undefined
    const panel = panelRef.current
    if (!panel) return undefined

    const clearInline = () => {
      panel.style.left = ''
      panel.style.right = ''
      panel.style.top = ''
      panel.style.bottom = ''
      panel.style.width = ''
      panel.style.height = ''
      panel.style.maxHeight = ''
      panel.classList.remove('is-keyboard')
      keyboardPinnedRef.current = false
      viewportApplyRef.current = { top: 0, height: 0, width: 0, keyboard: false }
    }

    const lockPageScroll = (locked) => {
      const root = document.documentElement
      if (locked) {
        root.classList.add('hana-chat-scroll-lock')
        document.body.classList.add('hana-chat-scroll-lock')
      } else {
        root.classList.remove('hana-chat-scroll-lock')
        document.body.classList.remove('hana-chat-scroll-lock')
      }
    }

    const ensureComposerVisible = () => {
      const composer = composerRef.current
      if (!composer) return
      try {
        composer.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      } catch {
        /* ignore */
      }
    }

    const applyMobileViewport = (options = {}) => {
      if (!window.matchMedia('(max-width: 640px)').matches) {
        clearInline()
        lockPageScroll(false)
        return
      }

      // Always lock background page while chat is open on mobile.
      lockPageScroll(true)

      const vv = window.visualViewport
      const margin = mobileFullscreen ? 0 : 8
      const inputFocused = document.activeElement === inputRef.current
      const keyboardOpen = Boolean(options.forceKeyboard)
        || keyboardPinnedRef.current
        || inputFocused
        || Boolean(vv && vv.height < window.innerHeight - 120)

      if (inputFocused || options.forceKeyboard) keyboardPinnedRef.current = true
      if (!inputFocused && !options.forceKeyboard && vv && vv.height >= window.innerHeight - 80) {
        keyboardPinnedRef.current = false
      }

      if (!vv) {
        clearInline()
        return
      }

      if (!keyboardOpen) {
        clearInline()
        return
      }

      const left = Math.max(0, Math.round(vv.offsetLeft)) + margin
      const width = Math.max(240, Math.round(vv.width) - margin * 2)
      const top = Math.max(0, Math.round(vv.offsetTop)) + margin
      const height = Math.max(180, Math.round(vv.height) - margin * 2)
      const prev = viewportApplyRef.current
      const same = prev.keyboard
        && Math.abs(prev.top - top) < 10
        && Math.abs(prev.height - height) < 10
        && Math.abs(prev.width - width) < 10

      if (same && !options.force) return

      viewportApplyRef.current = { top, height, width, keyboard: true }
      panel.style.left = `${left}px`
      panel.style.right = 'auto'
      panel.style.width = `${width}px`
      panel.style.top = `${top}px`
      panel.style.bottom = 'auto'
      panel.style.height = `${height}px`
      panel.style.maxHeight = `${height}px`
      panel.classList.add('is-keyboard')

      if (options.forceKeyboard || options.revealComposer) {
        window.requestAnimationFrame(ensureComposerVisible)
      }
    }

    const syncMobileViewport = (options = {}) => {
      if (options.forceKeyboard || options.immediate || options.force) {
        if (viewportDebounceRef.current) {
          window.clearTimeout(viewportDebounceRef.current)
          viewportDebounceRef.current = null
        }
        applyMobileViewport(options)
        return
      }
      if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current)
      viewportDebounceRef.current = window.setTimeout(() => {
        viewportDebounceRef.current = null
        applyMobileViewport(options)
      }, 140)
    }

    const blockBackgroundScroll = (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        event.preventDefault()
        return
      }
      // Allow vertical scroll only in chat scroll regions.
      if (target.closest('.hana-chat-messages, .hana-chat-guest-menu, .hana-chat-suggest-popover, textarea')) {
        return
      }
      // Chat is open: don't let the page behind move.
      event.preventDefault()
    }

    syncMobileViewport({ immediate: true })
    syncPanelViewportRef.current = syncMobileViewport
    const vv = window.visualViewport
    const touchMoveOpts = { passive: false }
    // resize only — scroll events on iOS cause constant jitter
    vv?.addEventListener('resize', syncMobileViewport)
    window.addEventListener('resize', syncMobileViewport)
    window.addEventListener('orientationchange', syncMobileViewport)
    document.addEventListener('touchmove', blockBackgroundScroll, touchMoveOpts)
    return () => {
      syncPanelViewportRef.current = () => {}
      if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current)
      vv?.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('orientationchange', syncMobileViewport)
      document.removeEventListener('touchmove', blockBackgroundScroll, touchMoveOpts)
      clearInline()
      lockPageScroll(false)
    }
  }, [hidden, open, mobileFullscreen])

  useEffect(() => {
    if (!open || (!editingId && !replyTo)) return undefined
    const id = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
      syncPanelViewportRef.current({ forceKeyboard: true, revealComposer: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, editingId, replyTo])

  const openChat = () => {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
    if (isMobile) setMobileFullscreen(true)
    setOpen(true)
  }

  const closeChat = () => {
    setOpen(false)
    setSuggestPickerGroup(null)
    setGuestMenuOpen(false)
  }

  const toggleChatOpen = () => {
    if (open) closeChat()
    else openChat()
  }

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
            createdAt: new Date().toISOString(),
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
        rawText: m.rawText,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deleted: m.deleted,
        replyTo: m.replyTo,
        sender: m.sender,
        reactions: m.reactions || {},
      }))
    : aiMessages

  const ownSender = actingAsOwner ? 'hana' : 'guest'
  const reactorId = actingAsOwner
    ? OWNER_PROFILE.key
    : (guestProfile?.key || String(guestKey || '').trim().toLowerCase() || 'guest')
  const canUseReactions = actingAsOwner || guestOnHuman

  const suggestContextKey = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return ''
    const usable = hanaMessages.filter((m) => !m.deleted && String(m.text || '').trim())
    if (usable.length === 0) return `empty:${activeThreadId}`
    const last = usable[usable.length - 1]
    return `${activeThreadId}:${usable.length}:${last.id}:${last.sender}:${String(last.text || '').slice(0, 48)}`
  }, [actingAsOwner, activeThreadId, hanaMessages])

  useEffect(() => {
    if (!actingAsOwner || !activeThreadId || !open) {
      setOwnerSuggestions({ replies: [], topics: [], expressions: [] })
      setSuggestBusy(false)
      return undefined
    }
    const usable = hanaMessages.filter((m) => !m.deleted && String(m.text || '').trim())
    if (usable.length === 0) {
      setOwnerSuggestions({ replies: [], topics: [], expressions: [] })
      return undefined
    }

    const history = usable.slice(-12).map((m) => ({
      role: m.sender === 'hana' ? 'model' : 'user',
      text: m.text,
    }))
    const lastGuest = [...usable].reverse().find((m) => m.sender === 'guest')
    const reqId = ++suggestReqRef.current
    const timer = window.setTimeout(() => {
      setSuggestBusy(true)
      suggestHanaChat({
        history,
        lastReply: lastGuest?.text || '',
        guestName: ownerActiveGuestLabel,
      })
        .then((data) => {
          if (suggestReqRef.current !== reqId) return
          setOwnerSuggestions({
            replies: data.replies?.length ? data.replies : OWNER_FALLBACK_REPLIES.slice(0, 3),
            topics: Array.isArray(data.topics) ? data.topics : [],
            expressions: Array.isArray(data.expressions) ? data.expressions : [],
          })
        })
        .catch(() => {
          if (suggestReqRef.current !== reqId) return
          setOwnerSuggestions({
            replies: OWNER_FALLBACK_REPLIES.slice(0, 3),
            topics: [],
            expressions: [],
          })
        })
        .finally(() => {
          if (suggestReqRef.current === reqId) setSuggestBusy(false)
        })
    }, 450)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    actingAsOwner,
    activeThreadId,
    open,
    suggestContextKey,
    ownerActiveGuestLabel,
    hanaMessages,
  ])

  useEffect(() => {
    setSuggestPickerGroup(null)
    setGuestMenuOpen(false)
  }, [activeThreadId, open])

  useEffect(() => {
    if (!guestMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (!guestMenuRef.current?.contains(event.target)) {
        setGuestMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [guestMenuOpen])

  const ownerReplyChips = ownerSuggestions.replies.length
    ? ownerSuggestions.replies
    : OWNER_FALLBACK_REPLIES
  const ownerTopicChips = [
    ...ownerSuggestions.topics,
    ...OWNER_TOPIC_CHIPS.filter((topic) => !ownerSuggestions.topics.includes(topic)),
  ].slice(0, 8)
  const ownerExpressionChips = [
    ...ownerSuggestions.expressions,
    ...OWNER_EXPRESSION_CHIPS.filter((chip) => !ownerSuggestions.expressions.includes(chip)),
  ]
  const ownerReplyInline = ownerReplyChips.slice(0, 2)
  const ownerTopicInline = ownerTopicChips.slice(0, 2)
  const ownerExpressionInline = ownerExpressionChips.slice(0, 5)
  const suggestPickerTitle = suggestPickerGroup === 'reply'
    ? '返信'
    : suggestPickerGroup === 'topic'
      ? '話題'
      : suggestPickerGroup === 'expr'
        ? '表情'
        : ''
  const suggestPickerChips = suggestPickerGroup === 'reply'
    ? ownerReplyChips
    : suggestPickerGroup === 'topic'
      ? ownerTopicChips
      : suggestPickerGroup === 'expr'
        ? ownerExpressionChips
        : []

  const applyOwnerSuggest = (text) => {
    const next = String(text || '').trim()
    if (!next) return
    setDraft(next)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const appendOwnerExpression = (chip) => {
    const token = String(chip || '')
    if (!token) return
    setDraft((prev) => `${prev}${token}`)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const toggleSuggestPicker = (group) => {
    setSuggestPickerGroup((prev) => (prev === group ? null : group))
  }

  const chooseOwnerSuggest = (chip, kind) => {
    if (kind === 'expr') appendOwnerExpression(chip)
    else applyOwnerSuggest(chip)
    setSuggestPickerGroup(null)
  }

  const notifyCopied = (ok) => {
    setCopyNote(ok ? 'コピーしました' : 'コピーに失敗しました')
    window.setTimeout(() => setCopyNote(''), 1400)
  }

  const resolveDelivery = (message) => {
    if (message.deleted) return null
    if (actingAsOwner || guestOnHuman) {
      const viewer = actingAsOwner ? 'hana' : 'guest'
      const sender = message.sender || (message.role === 'hana' ? 'hana' : 'guest')
      return getMessageDeliveryStatus(
        { sender, createdAt: message.createdAt },
        activeThreadMeta,
        viewer,
      )
    }
    if (message.role === 'guest') return 'sent'
    return null
  }

  const labelForRole = (role) => {
    if (role === 'hanachan') return 'はなちゃん'
    if (role === 'hana') return 'はな'
    // Guest bubble: never 「あなた」 — always the guest's display name.
    if (actingAsOwner) return ownerActiveGuestLabel
    return guestDisplayName
  }

  const labelForMessage = (message) => labelForRole(message.sender || message.role)

  const avatarSrcForProfile = (profileId, displayName) => {
    const id = String(profileId || '').trim().toLowerCase() || 'guest'
    const fallback = id === OWNER_PROFILE.key || id === 'hana' ? hanachanArt : ''
    return resolveAvatarSrc(id, displayName || id, chatProfiles[id]?.avatarUrl || '', fallback)
  }

  const avatarSrcForMessage = (message) => {
    const role = message.sender || message.role
    if (role === 'hanachan') return hanachanArt
    if (role === 'hana') return avatarSrcForProfile(OWNER_PROFILE.key, OWNER_PROFILE.displayName)
    const guestId = actingAsOwner
      ? (ownerActiveGuestKey || 'guest')
      : (guestProfile?.key || sessionProfile.id || 'guest')
    const name = actingAsOwner ? ownerActiveGuestLabel : guestDisplayName
    return avatarSrcForProfile(guestId, name)
  }

  // Header shows the selected guest for owner inbox; guests see Hana / Hanachan.
  const partnerAvatarSrc = (() => {
    if (actingAsOwner) {
      if (!activeThreadId) return hanachanArt
      return avatarSrcForProfile(ownerActiveGuestKey || 'guest', ownerActiveGuestLabel)
    }
    if (channel === 'human') {
      return avatarSrcForProfile(OWNER_PROFILE.key, OWNER_PROFILE.displayName)
    }
    return hanachanArt
  })()

  const clearComposerExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const openOwnerThread = (threadId, label, guestKey = '', canonicalId = '') => {
    clearComposerExtras()
    const key = guestKey || (canonicalId || threadId).replace(/^guest-/, '')
    const canon = canonicalId || (key && GUEST_PROFILES[key] ? `guest-${key}` : '')
    // Open immediately — do not wait on Firestore writes/migration.
    const openId = threadId || canon
    if (!openId) return

    if (openId !== activeThreadId) {
      setHanaMessages([])
      setActiveThreadId(openId)
    }

    const ensureId = (canon && canon.startsWith('guest-')) ? canon : (openId.startsWith('guest-') ? openId : '')
    const alreadyExists = Boolean(
      ensureId && threadsRef.current.some((thread) => thread.id === ensureId),
    )

    void (async () => {
      // Migrate legacy UUID → guest-* only once per pair, and never block opening.
      if (canon && threadId && canon !== threadId) {
        const checkKey = `${canon}←${threadId}`
        if (!migrationCheckedRef.current.has(checkKey)) {
          migrationCheckedRef.current.add(checkKey)
          try {
            const resolved = await migrateLegacyGuestThread({
              canonicalId: canon,
              legacyThreadId: threadId,
              guestLabel: label,
              guestKey: key,
            })
            if (resolved && resolved !== openId) {
              setActiveThreadId(resolved)
            }
          } catch {
            /* ignore — keep showing the opened thread */
          }
        }
      }

      if (ensureId && !alreadyExists) {
        try {
          await ensureChatThread({
            threadId: ensureId,
            guestLabel: label,
            guestKey: key || ensureId.replace(/^guest-/, ''),
          })
        } catch {
          /* ignore */
        }
      }
    })()
  }

  const startReply = (message) => {
    if (message.deleted) return
    setEditingId(null)
    setReplyTo({
      id: message.id,
      text: message.text,
      sender: message.sender || message.role,
      role: message.role,
    })
  }

  const startEdit = (message) => {
    if (!canMutateOwnMessage(message) || message.deleted) return
    setReplyTo(null)
    setEditingId(message.id)
    setDraft(message.rawText || message.text)
  }

  const handleDelete = async (message) => {
    if (!canMutateOwnMessage(message) || message.deleted) return
    if (!window.confirm('このメッセージを削除しますか？')) return
    setError('')
    try {
      if (actingAsOwner || guestOnHuman) {
        const threadId = actingAsOwner ? activeThreadId : guestChatId
        await softDeleteChatMessage({ threadId, messageId: message.id })
      } else {
        setAiMessages((prev) => prev.map((m) => (
          m.id === message.id
            ? { ...m, text: '（削除されたメッセージ）', deleted: true, editedAt: new Date().toISOString() }
            : m
        )))
      }
      if (editingId === message.id) {
        setEditingId(null)
        setDraft('')
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '削除に失敗しました。')
    }
  }

  const handleReact = async (message, emoji) => {
    if (!canUseReactions || message?.deleted || !emoji) return
    const threadId = actingAsOwner ? activeThreadId : guestChatId
    if (!threadId || !message?.id) return
    try {
      await toggleChatReaction({
        threadId,
        messageId: message.id,
        emoji,
        reactorId,
      })
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'リアクションに失敗しました。')
    }
  }

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError('')
    setBusy(true)
    setSpeaking(true)
    const nowIso = new Date().toISOString()
    const pendingReply = replyTo
    const pendingEditId = editingId
    clearComposerExtras()

    try {
      if (pendingEditId) {
        if (actingAsOwner || guestOnHuman) {
          const threadId = actingAsOwner ? activeThreadId : guestChatId
          await updateChatMessage({ threadId, messageId: pendingEditId, text })
        } else {
          setAiMessages((prev) => prev.map((m) => (
            m.id === pendingEditId
              ? { ...m, text, editedAt: nowIso, deleted: false }
              : m
          )))
        }
        return
      }

      if (actingAsOwner) {
        if (!activeThreadId) {
          setError('返信する相手を選んでください。')
          return
        }
        await sendChatMessage({
          threadId: activeThreadId,
          text,
          sender: 'hana',
          replyTo: pendingReply,
        })
      } else if (channel === 'human' || wantsHumanHana(text)) {
        if (channel !== 'human') {
          switchToHuman(HUMAN_SWITCH_INTENT)
        }
        const threadId = guestChatId || ensureGuestChatId(guestKey || 'guest')
        if (!guestChatId) setGuestChatId(threadId)
        await sendChatMessage({
          threadId,
          text,
          sender: 'guest',
          guestLabel: guestThreadLabel,
          guestKey: guestProfile?.key || guestKey || '',
          replyTo: pendingReply,
        })
        setChannel('human')
      } else {
        const history = aiMessages
          .filter((m) => !m.deleted && m.id !== INTRO_ID && m.kind !== 'human-switch' && m.kind !== 'intro')
          .map((m) => ({
            role: m.role === 'guest' ? 'user' : 'model',
            text: m.text,
          }))
        const guestMsg = {
          id: `g-${Date.now()}`,
          role: 'guest',
          text,
          createdAt: nowIso,
          replyTo: pendingReply
            ? {
                id: pendingReply.id,
                text: pendingReply.text,
                sender: pendingReply.sender || pendingReply.role,
              }
            : null,
        }
        setAiMessages((prev) => [...prev, guestMsg])
        const prompt = pendingReply
          ? `（「${String(pendingReply.text).slice(0, 80)}」への返信）\n${text}`
          : text
        const data = await chatWithHanachan({
          message: prompt,
          history,
          guestName: guestDisplayName,
          addressAs: guestAddressAs,
        })
        if (data?.reason === 'quota') {
          switchToHuman(HUMAN_SWITCH_QUOTA)
          const threadId = guestChatId || ensureGuestChatId(guestKey || 'guest')
          if (!guestChatId) setGuestChatId(threadId)
          await sendChatMessage({
            threadId,
            text,
            sender: 'guest',
            guestLabel: guestThreadLabel,
            guestKey: guestProfile?.key || guestKey || '',
            replyTo: pendingReply,
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
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } catch (err) {
      console.error(err)
      const msg = getFirebaseErrorMessage(err) || ''
      const looksQuota = /quota|credit|resource-exhausted|429/i.test(`${err?.code || ''} ${msg} ${err?.message || ''}`)
      if (!actingAsOwner && channel === 'ai' && looksQuota && !pendingEditId) {
        switchToHuman(HUMAN_SWITCH_QUOTA)
        try {
          const threadId = guestChatId || ensureGuestChatId(guestKey || 'guest')
          await sendChatMessage({
            threadId,
            text,
            sender: 'guest',
            guestLabel: guestThreadLabel,
            guestKey: guestProfile?.key || guestKey || '',
            replyTo: pendingReply,
          })
        } catch (sendErr) {
          setError(getFirebaseErrorMessage(sendErr) || '送信に失敗しました。')
        }
      } else {
        setError(msg || '送信に失敗しました。')
        if (!actingAsOwner && channel === 'ai' && !pendingEditId) {
          setAiMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: 'hanachan',
              text: 'ごめんね、いま少し調子が悪いみたい。少ししてからまた話そうね。はな本人と話したいときは「本物のはなと話したい」と送ってね。',
              createdAt: new Date().toISOString(),
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
    ? (activeThreadId ? ownerActiveGuestLabel : 'はな')
    : channel === 'human'
      ? 'はな'
      : 'はなちゃん'
  const modeSub = actingAsOwner
    ? (activeThreadId ? 'ゲストとチャット中' : 'ゲストへの返信')
    : channel === 'human'
      ? 'はな本人'
      : 'はなちゃんとお話し中'
  const presenceLabel = partnerOnline ? 'オンライン' : 'オフライン'

  if (hidden) return null

  return (
    <div className={`hana-chat${open ? ' is-open' : ''}${mobileFullscreen ? ' is-fullscreen' : ''}`}>
      <button
        type="button"
        className={`hana-chat-launcher${unreadLauncher ? ' has-unread' : ''}${speaking ? ' is-speaking' : ''}`}
        onClick={toggleChatOpen}
        aria-expanded={open}
        aria-controls="hana-chat-panel"
        title={open ? 'チャットを閉じる' : 'はなちゃんと話す'}
      >
        <img src={hanachanArt} alt="" className="hana-chat-launcher-art" />
        {unreadLauncher ? (
          <span className="hana-chat-badge" aria-label={`未読 ${unreadLauncher}件`}>
            {unreadLauncher > 99 ? '99+' : unreadLauncher}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          ref={panelRef}
          id="hana-chat-panel"
          className={`hana-chat-panel${mobileFullscreen ? ' is-fullscreen' : ''}`}
          aria-label="はなちゃんチャット"
        >
          <header className="hana-chat-header">
            <div className={`hana-chat-avatar${speaking ? ' is-speaking' : ''}`}>
              <img src={partnerAvatarSrc} alt="" />
              <span
                className={`hana-chat-presence ${partnerOnline ? 'is-online' : 'is-offline'}`}
                title={presenceLabel}
                aria-label={presenceLabel}
              />
            </div>
            <div className="hana-chat-titles">
              {actingAsOwner ? (
                <div className="hana-chat-guest-select" ref={guestMenuRef}>
                  <p className="hana-chat-kicker">{modeSub}</p>
                  <button
                    type="button"
                    className={`hana-chat-guest-select-trigger${guestMenuOpen ? ' is-open' : ''}`}
                    aria-expanded={guestMenuOpen}
                    aria-haspopup="listbox"
                    onClick={() => setGuestMenuOpen((value) => !value)}
                  >
                    <span className="hana-chat-guest-select-name">
                      {activeThreadId ? ownerActiveGuestLabel : 'ゲストを選択'}
                    </span>
                    {unreadLauncher ? (
                      <span className="hana-chat-guest-select-unread" aria-label={`未読 ${unreadLauncher}件`}>
                        {unreadLauncher > 99 ? '99+' : unreadLauncher}
                      </span>
                    ) : null}
                    <span className={`hana-chat-guest-select-caret${guestMenuOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
                  </button>
                  {activeThreadId ? (
                    <p className={`hana-chat-presence-label${partnerOnline ? ' is-online' : ''}`}>
                      {presenceLabel}
                    </p>
                  ) : null}
                  {guestMenuOpen ? (
                    <div className="hana-chat-guest-menu" role="listbox" aria-label="ゲスト一覧">
                      {ownerGuestRoster.length === 0 ? (
                        <p className="hana-chat-guest-menu-empty">まだメッセージはありません。</p>
                      ) : (
                        ownerGuestRoster.map((entry) => {
                          const unreadN = threadUnreadCount(entry.thread, 'hana')
                          const selected = activeThreadId === entry.threadId || activeThreadId === entry.canonicalId
                          return (
                            <button
                              key={`${entry.canonicalId}:${entry.threadId}`}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`hana-chat-guest-option${selected ? ' is-active' : ''}${unreadN ? ' is-unread' : ''}`}
                              onClick={() => {
                                openOwnerThread(
                                  entry.threadId,
                                  entry.label,
                                  entry.guestKey || entry.thread?.guestKey || '',
                                  entry.canonicalId,
                                )
                                setGuestMenuOpen(false)
                              }}
                            >
                              <span className="hana-chat-guest-option-main">
                                <img
                                  className="hana-chat-thread-avatar"
                                  src={avatarSrcForProfile(
                                    entry.guestKey || entry.canonicalId.replace(/^guest-/, '') || 'guest',
                                    entry.label,
                                  )}
                                  alt=""
                                />
                                <span
                                  className={`hana-chat-thread-dot ${isPresenceOnline(entry.thread?.guestOnlineAt, presenceTick) ? 'is-online' : 'is-offline'}`}
                                  aria-hidden="true"
                                />
                                <span className="hana-chat-guest-option-name">{entry.label}</span>
                                {unreadN ? (
                                  <span className="hana-chat-thread-unread" aria-label={`未読 ${unreadN}件`}>
                                    {unreadN > 99 ? '99+' : unreadN}
                                  </span>
                                ) : null}
                              </span>
                              <span className="hana-chat-guest-option-preview">
                                {entry.thread?.lastText || (entry.known ? '（未開始）' : '—')}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="hana-chat-kicker">{modeSub}</p>
                  <div className="hana-chat-heading-row">
                    <h2 className="hana-chat-heading">{modeTitle}</h2>
                    <p className={`hana-chat-presence-label${partnerOnline ? ' is-online' : ''}`}>
                      {presenceLabel}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="hana-chat-header-actions">
              <button
                type="button"
                className="hana-chat-expand"
                onClick={() => setMobileFullscreen((value) => !value)}
                aria-label={mobileFullscreen ? 'チャットを縮小' : 'チャットを全画面'}
                title={mobileFullscreen ? '縮小' : '全画面'}
              >
                {mobileFullscreen ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M7 14H5v5h5v-2H7v-3zm12 5h-5v-2h3v-3h2v5zM7 5h2v3h3v2H5V5h2zm12 5h-5V5h2v3h3v2z"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="hana-chat-close"
                onClick={closeChat}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
          </header>

          {!actingAsOwner && channel === 'human' ? (
            <div className="hana-chat-channel-banner" role="status">
              {humanNotice ? <p>{humanNotice}</p> : <p>はな本人モード</p>}
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
              <p className="hana-chat-empty">上のメニューから返信する相手を選んでね。</p>
            ) : null}
            {!actingAsOwner && guestOnHuman && visibleMessages.length === 0 ? (
              <p className="hana-chat-empty">はなにメッセージを送ると、ここに返信が届きます。</p>
            ) : null}
            {visibleMessages.map((message) => {
              const delivery = resolveDelivery(message)
              const timeLabel = formatChatTimestamp(message.createdAt)
              const isOwn = (message.sender || message.role) === ownSender
                || (!actingAsOwner && !guestOnHuman && message.role === 'guest')
              const mutable = isOwn && canMutateOwnMessage(message)
              const sideClass = isOwn ? 'is-own' : 'is-other'
              const avatarSrc = avatarSrcForMessage(message)
              return (
                <div key={message.id} className={`hana-chat-msg-row ${sideClass}`}>
                  {!isOwn ? (
                    <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
                  ) : null}
                  <ChatSwipeBubble
                    className={`${sideClass} is-${message.role}`}
                    canReply={!message.deleted}
                    canEdit={mutable}
                    canDelete={mutable}
                    canReact={canUseReactions && !message.deleted}
                    reactions={message.reactions || {}}
                    reactorId={reactorId}
                    copyText={message.deleted ? '' : (message.rawText || message.text || '')}
                    onCopy={notifyCopied}
                    onReply={() => startReply(message)}
                    onEdit={() => startEdit(message)}
                    onDelete={() => handleDelete(message)}
                    onReact={(emoji) => { void handleReact(message, emoji) }}
                  >
                    <div
                      className={`hana-chat-bubble ${sideClass} is-${message.role}${message.kind === 'human-switch' || message.kind === 'intro' ? ' is-notice' : ''}${message.deleted ? ' is-deleted' : ''}`}
                    >
                      <span className="hana-chat-bubble-label">
                        {labelForMessage(message)}
                      </span>
                      {message.replyTo ? (
                        <div className="hana-chat-quote">
                          <strong>{labelForRole(message.replyTo.sender || message.replyTo.role)}</strong>
                          <span>{message.replyTo.text}</span>
                        </div>
                      ) : null}
                      <p>{message.text}</p>
                      <div className="hana-chat-bubble-meta">
                        {message.editedAt && !message.deleted ? <span>編集済</span> : null}
                        <time dateTime={message.createdAt || undefined}>
                          {timeLabel || '—'}
                        </time>
                        {isOwn && delivery ? (
                          <span className={`hana-chat-delivery is-${delivery}`}>
                            {deliveryStatusLabel(delivery)}
                          </span>
                        ) : null}
                        {isOwn && !delivery && !message.deleted ? (
                          <span className="hana-chat-delivery is-sent">送信済</span>
                        ) : null}
                      </div>
                    </div>
                  </ChatSwipeBubble>
                  {isOwn ? (
                    <img className="hana-chat-msg-avatar" src={avatarSrc} alt="" />
                  ) : null}
                </div>
              )
            })}
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

          {actingAsOwner && activeThreadId ? (
            <div className="hana-chat-suggest hana-chat-suggest--owner" aria-label="返信のヒント">
              <div className={`hana-chat-suggest-group${suggestPickerGroup === 'reply' ? ' is-open' : ''}`}>
                <span className="hana-chat-suggest-label">返信</span>
                <div className="hana-chat-suggest-chips">
                  {ownerReplyInline.map((chip) => (
                    <button
                      key={`reply-${chip}`}
                      type="button"
                      className="hana-chat-suggest-chip is-reply"
                      disabled={busy || suggestBusy}
                      onClick={() => applyOwnerSuggest(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`hana-chat-suggest-chip is-more${suggestPickerGroup === 'reply' ? ' is-active' : ''}`}
                    disabled={busy}
                    aria-expanded={suggestPickerGroup === 'reply'}
                    aria-label="返信の候補をもっと見る"
                    onClick={() => toggleSuggestPicker('reply')}
                  >
                    …
                  </button>
                </div>
                {suggestPickerGroup === 'reply' ? (
                  <div className="hana-chat-suggest-popover" role="listbox" aria-label="返信の候補">
                    <div className="hana-chat-suggest-popover-head">
                      <strong>{suggestPickerTitle}</strong>
                      <button type="button" onClick={() => setSuggestPickerGroup(null)} aria-label="閉じる">×</button>
                    </div>
                    <div className="hana-chat-suggest-popover-chips">
                      {suggestPickerChips.map((chip) => (
                        <button
                          key={`picker-reply-${chip}`}
                          type="button"
                          className="hana-chat-suggest-chip is-reply"
                          onClick={() => chooseOwnerSuggest(chip, 'reply')}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={`hana-chat-suggest-group${suggestPickerGroup === 'topic' ? ' is-open' : ''}`}>
                <span className="hana-chat-suggest-label">話題</span>
                <div className="hana-chat-suggest-chips">
                  {ownerTopicInline.map((chip) => (
                    <button
                      key={`topic-${chip}`}
                      type="button"
                      className="hana-chat-suggest-chip is-topic"
                      disabled={busy}
                      onClick={() => applyOwnerSuggest(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`hana-chat-suggest-chip is-more${suggestPickerGroup === 'topic' ? ' is-active' : ''}`}
                    disabled={busy}
                    aria-expanded={suggestPickerGroup === 'topic'}
                    aria-label="話題の候補をもっと見る"
                    onClick={() => toggleSuggestPicker('topic')}
                  >
                    …
                  </button>
                </div>
                {suggestPickerGroup === 'topic' ? (
                  <div className="hana-chat-suggest-popover" role="listbox" aria-label="話題の候補">
                    <div className="hana-chat-suggest-popover-head">
                      <strong>{suggestPickerTitle}</strong>
                      <button type="button" onClick={() => setSuggestPickerGroup(null)} aria-label="閉じる">×</button>
                    </div>
                    <div className="hana-chat-suggest-popover-chips">
                      {suggestPickerChips.map((chip) => (
                        <button
                          key={`picker-topic-${chip}`}
                          type="button"
                          className="hana-chat-suggest-chip is-topic"
                          onClick={() => chooseOwnerSuggest(chip, 'topic')}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={`hana-chat-suggest-group${suggestPickerGroup === 'expr' ? ' is-open' : ''}`}>
                <span className="hana-chat-suggest-label">表情</span>
                <div className="hana-chat-suggest-chips">
                  {ownerExpressionInline.map((chip) => (
                    <button
                      key={`expr-${chip}`}
                      type="button"
                      className="hana-chat-suggest-chip is-expr"
                      disabled={busy}
                      onClick={() => appendOwnerExpression(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`hana-chat-suggest-chip is-more${suggestPickerGroup === 'expr' ? ' is-active' : ''}`}
                    disabled={busy}
                    aria-expanded={suggestPickerGroup === 'expr'}
                    aria-label="表情の候補をもっと見る"
                    onClick={() => toggleSuggestPicker('expr')}
                  >
                    …
                  </button>
                </div>
                {suggestPickerGroup === 'expr' ? (
                  <div className="hana-chat-suggest-popover" role="listbox" aria-label="表情の候補">
                    <div className="hana-chat-suggest-popover-head">
                      <strong>{suggestPickerTitle}</strong>
                      <button type="button" onClick={() => setSuggestPickerGroup(null)} aria-label="閉じる">×</button>
                    </div>
                    <div className="hana-chat-suggest-popover-chips is-expr">
                      {suggestPickerChips.map((chip) => (
                        <button
                          key={`picker-expr-${chip}`}
                          type="button"
                          className="hana-chat-suggest-chip is-expr"
                          onClick={() => chooseOwnerSuggest(chip, 'expr')}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {copyNote ? <p className="hana-chat-copy-note" role="status">{copyNote}</p> : null}
          {error ? <p className="hana-chat-error">{error}</p> : null}

          {replyTo || editingId ? (
            <div className="hana-chat-composer-context">
              <div>
                <strong>{editingId ? 'メッセージを編集' : '返信先'}</strong>
                <span>
                  {editingId
                    ? '内容を直して更新できます'
                    : `${labelForRole(replyTo?.sender || replyTo?.role)}: ${String(replyTo?.text || '').slice(0, 60)}`}
                </span>
              </div>
              <button type="button" onClick={clearComposerExtras} aria-label="キャンセル">×</button>
            </div>
          ) : null}

          <form className="hana-chat-composer" ref={composerRef} onSubmit={handleSend}>
            <label className="sr-only" htmlFor="hana-chat-input">
              メッセージ
            </label>
            <textarea
              ref={inputRef}
              id="hana-chat-input"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                // Enter = newline. Ctrl/Cmd+Enter = send.
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault()
                  if (!busy && draft.trim()) {
                    event.currentTarget.form?.requestSubmit?.()
                  }
                }
              }}
              onFocus={() => {
                keyboardPinnedRef.current = true
                syncPanelViewportRef.current({ forceKeyboard: true, revealComposer: true })
                window.setTimeout(() => {
                  syncPanelViewportRef.current({ forceKeyboard: true, force: true })
                }, 280)
              }}
              onBlur={() => {
                keyboardPinnedRef.current = false
                window.setTimeout(() => syncPanelViewportRef.current({ immediate: true }), 180)
              }}
              placeholder={
                editingId
                  ? '編集して更新…'
                  : replyTo
                    ? '返信を書く…'
                    : actingAsOwner
                      ? 'ゲストに返信…'
                      : channel === 'human'
                        ? 'はなに送る…'
                        : 'はなちゃんに話しかける…'
              }
              maxLength={2000}
              disabled={busy || (actingAsOwner && !activeThreadId)}
              autoComplete="off"
              enterKeyHint="enter"
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? '…' : editingId ? '更新' : '送る'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
