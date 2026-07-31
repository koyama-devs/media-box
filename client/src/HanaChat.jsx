import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import hanachanArt from './assets/hanachan.svg'
import {
  addChatReminder,
  dueChatReminders,
  loadChatPins,
  markChatReminderDone,
  remindAtFromChoice,
  toggleChatPin,
  unpinChatMessage,
} from './chatExtras'
import ChatImageLightbox from './ChatImageLightbox'
import { playChatNotifySound, unlockChatNotifySound } from './chatNotifySound'
import {
  readDefaultReaction,
  readEnterToSend,
  readMessageSound,
  readStickerSet,
  writeDefaultReaction,
  writeEnterToSend,
  writeMessageSound,
  writeStickerSet,
} from './chatSettings'
import ChatSwipeBubble, { canMutateOwnMessage } from './ChatSwipeBubble'
import EmotionMomentLayer, { EMOTION_MOMENTS, triggerEmotionMoment } from './EmotionMoment'
import {
  analyzeGuestMessageForOwner,
  broadcastChatEffect,
  CHAT_PRESENCE_MODES,
  CHAT_REACTION_EMOJIS,
  chatWithHanachan,
  deleteChatMessage,
  deliveryStatusLabel,
  ensureChatThread,
  ensureDefaultChatAccounts,
  ensureGuestChatId,
  formatChatTimestamp,
  getFirebaseErrorMessage,
  getGuestProfile,
  getMessageDeliveryStatus,
  isAdminUser,
  listGuestProfiles,
  markThreadRead,
  migrateLegacyGuestThread,
  normalizeChatPresenceMode,
  OWNER_PROFILE,
  pulseChatPresence,
  resolveAvatarSrc,
  resolveChatPresence,
  resolveGuestDisplayName,
  resolveSessionProfile,
  sendChatMessage,
  setChatPresenceStatus,
  setChatProfileStatus,
  setChatTyping,
  subscribeChatAccounts,
  subscribeChatMessages,
  subscribeChatProfiles,
  subscribeChatThreads,
  subscribeOwnChatThread,
  subscribeToAuthUser,
  suggestHanaChat,
  threadUnreadCount,
  toggleChatReaction,
  translateChatMessage,
  updateChatMessage,
  uploadChatImage,
} from './firebase'
import FlowerRainLayer, {
  CHAT_PARTY_REACTION,
  triggerFlowerRain,
  triggerPartyBurst,
} from './FlowerRain'
import './hana-chat.css'
import HanaCall from './HanaCall'
import HanaSticker, {
  HANA_STICKER_SETS,
  isHanaSticker,
  suggestHanaStickers,
} from './HanaStickers'
import OwnerMessageAssist, {
  collectUnansweredOwnerAssistMessages,
  ownerAssistShouldCollapse,
} from './OwnerMessageAssist'

const AI_HISTORY_PREFIX = 'hana-chat-ai-history-'
const CHANNEL_PREFIX = 'hana-chat-channel-'
const OWNER_SUGGEST_PREF_KEY = 'hana-chat-owner-suggest-enabled'
/** Default guest selected in owner (real Hana) inbox. Password alias: gabu → gabusan. */
const DEFAULT_OWNER_GUEST_KEY = 'gabusan'
/** Composer grows with the draft up to this many lines, then scrolls instead. */
const COMPOSER_MAX_LINES = 5
const TYPING_PULSE_MS = 2_000
const OWNER_ASSIST_CACHE_LIMIT = 40

function isOwnerAssistableGuestMessage(message) {
  if (!message || message.deleted || message.pending) return false
  const sender = message.sender || message.role
  if (sender !== 'guest') return false
  if (message.sticker || message.imageUrl || message.effect) return false
  return Boolean(String(message.rawText || message.text || '').trim())
}
const TYPING_IDLE_MS = 3_000
const TYPING_VISIBLE_MS = 6_000

/** True on laptop/desktop with a real keyboard — Enter-to-send only applies here. */
function useDesktopKeyboard() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
  })
  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return desktop
}

/** Keep optimistic (pending) bubbles until the matching Firestore message arrives. */
let stickerSendSeq = 0

function nextStickerPendingId() {
  stickerSendSeq += 1
  return `pending-sticker-${stickerSendSeq}`
}

/** Resolve caption + big-icon emoji for a standalone effect-bar tap. */
function describeStandaloneEffect(payload, defaultReaction) {
  if (payload?.kind === 'moment') {
    const moment = EMOTION_MOMENTS.find((item) => item.id === payload.momentId)
    if (!moment) return null
    return {
      effect: moment.id,
      effectEmoji: moment.emoji,
      text: moment.caption || moment.label,
    }
  }
  if (payload?.kind === 'party') {
    return {
      effect: 'party',
      effectEmoji: CHAT_PARTY_REACTION,
      text: 'パーティー！',
    }
  }
  const emoji = String(payload?.emoji || defaultReaction || '🌸').trim() || '🌸'
  return {
    effect: 'flower',
    effectEmoji: emoji,
    text: '花びらを届けたよ',
  }
}

function mergeServerMessagesWithPending(server, previous) {
  const pending = (previous || []).filter((message) => message?.pending)
  if (!pending.length) return server
  const usedServerIds = new Set()
  const kept = []
  for (const item of pending) {
    const match = server.find((row) => {
      if (usedServerIds.has(row.id)) return false
      if ((row.sender || row.role) !== (item.sender || item.role)) return false
      if (String(row.text || '') !== String(item.text || '')) return false
      if (String(row.sticker || '') !== String(item.sticker || '')) return false
      if (String(row.effect || '') !== String(item.effect || '')) return false
      if (Boolean(row.imageUrl) !== Boolean(item.imageUrl)) return false
      return true
    })
    if (match) usedServerIds.add(match.id)
    else kept.push(item)
  }
  return kept.length ? [...server, ...kept] : server
}

function scrollChatListToLatest(listNode) {
  if (!listNode) return
  const lastRow = listNode.querySelector('.hana-chat-msg-row:last-of-type')
  if (lastRow) {
    try {
      lastRow.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' })
      return
    } catch {
      /* fall through */
    }
  }
  listNode.scrollTop = listNode.scrollHeight
}

function readOwnerSuggestEnabled() {
  try {
    const raw = window.localStorage.getItem(OWNER_SUGGEST_PREF_KEY)
    if (raw == null) return true
    return raw !== '0' && raw !== 'false'
  } catch {
    return true
  }
}

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
    return parsed.filter((m) => m && !m.deleted && typeof m.text === 'string' && m.id)
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
  const [storageReady, setStorageReady] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [presenceTick, setPresenceTick] = useState(() => Date.now())
  const [typingTick, setTypingTick] = useState(() => Date.now())
  const [chatProfiles, setChatProfiles] = useState({})
  const [ownerSuggestions, setOwnerSuggestions] = useState({ replies: [], topics: [], expressions: [] })
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [suggestPickerGroup, setSuggestPickerGroup] = useState(null) // 'reply' | 'topic' | 'expr' | null
  const [ownerSuggestEnabled, setOwnerSuggestEnabled] = useState(() => readOwnerSuggestEnabled())
  const [guestMenuOpen, setGuestMenuOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [stickerSetId, setStickerSetId] = useState(() => readStickerSet({ asOwner: appRole === 'owner' }))
  const activeStickerSet = HANA_STICKER_SETS.find((set) => set.id === stickerSetId) || HANA_STICKER_SETS[0]
  const stickerSuggestions = useMemo(() => suggestHanaStickers(draft, 12), [draft])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultReaction, setDefaultReaction] = useState(() => readDefaultReaction())
  const [enterToSend, setEnterToSend] = useState(() => readEnterToSend())
  const desktopKeyboard = useDesktopKeyboard()
  // Soft-keyboard phones/tablets keep Enter = newline; the toggle is desktop-only.
  const enterSendsMessage = desktopKeyboard && enterToSend
  const [messageSound, setMessageSound] = useState(() => readMessageSound())
  const [chatAccounts, setChatAccounts] = useState(() => listGuestProfiles())
  const [copyNote, setCopyNote] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [pins, setPins] = useState([])
  const [translations, setTranslations] = useState({})
  const [ownerAssist, setOwnerAssist] = useState({})
  const [remindMessage, setRemindMessage] = useState(null)
  const [dueReminders, setDueReminders] = useState([])
  const [previewImage, setPreviewImage] = useState(null)
  const listRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const composerRef = useRef(null)
  const guestMenuRef = useRef(null)
  const stickerRef = useRef(null)
  const imageInputRef = useRef(null)
  const settingsRef = useRef(null)
  const syncPanelViewportRef = useRef(() => {})
  const scrollToLatestRef = useRef(() => {})
  const viewportApplyRef = useRef({ top: 0, height: 0, width: 0, keyboard: false })
  const viewportDebounceRef = useRef(null)
  const keyboardPinnedRef = useRef(false)
  const retainComposerFocusRef = useRef(false)
  const migrationCheckedRef = useRef(new Set())
  const seenEffectRef = useRef(new Set())
  const effectBaselineRef = useRef('')
  const ownerAssistBaselineRef = useRef('')
  const ownerAssistSeenRef = useRef(new Set())
  const ownerAssistOpenedAtRef = useRef(0)
  const ownerAssistSeedRef = useRef('')
  const ownerAssistReqRef = useRef(0)
  const suggestReqRef = useRef(0)
  const typingStateRef = useRef({ threadId: '', role: '', lastPulseAt: 0 })
  const typingPulseTimerRef = useRef(null)
  const typingStopTimerRef = useRef(null)
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  scrollToLatestRef.current = () => {
    const run = () => scrollChatListToLatest(listRef.current)
    run()
    window.requestAnimationFrame(() => {
      run()
      window.requestAnimationFrame(run)
    })
    window.setTimeout(run, 80)
    window.setTimeout(run, 220)
  }

  // chatAccounts is a dep so the name re-resolves once the live list loads.
  const guestProfile = useMemo(() => getGuestProfile(guestKey), [guestKey, chatAccounts])
  const guestDisplayName = guestProfile?.displayName || 'ゲスト'
  const guestAddressAs = guestProfile?.addressAs || guestDisplayName
  const guestThreadLabel = guestProfile?.displayName || guestDisplayName

  const isAdmin = isAdminUser(authUser)
  const actingAsOwner = appRole === 'owner' || isAdmin
  const sessionProfile = useMemo(
    () => resolveSessionProfile(actingAsOwner ? 'owner' : 'guest', guestKey),
    [actingAsOwner, guestKey, chatAccounts],
  )
  const extrasProfileId = sessionProfile?.id || 'guest'

  // Owner ↔ guest roles keep separate sticker-set prefs on this device.
  useEffect(() => {
    setStickerSetId(readStickerSet({ asOwner: actingAsOwner }))
  }, [actingAsOwner])

  useEffect(() => {
    setPins(loadChatPins(extrasProfileId))
    setDueReminders(dueChatReminders(extrasProfileId))
  }, [extrasProfileId, open])

  useEffect(() => {
    if (!open || !actionNote) return undefined
    const timer = window.setTimeout(() => setActionNote(''), 2200)
    return () => window.clearTimeout(timer)
  }, [actionNote, open])

  useEffect(() => {
    if (!open || !copyNote) return undefined
    const timer = window.setTimeout(() => setCopyNote(''), 1800)
    return () => window.clearTimeout(timer)
  }, [copyNote, open])

  const ownerGuestRoster = useMemo(() => {
    if (!actingAsOwner) return []
    const usedIds = new Set()
    const knownProfiles = chatAccounts.length ? chatAccounts : listGuestProfiles()
    const known = knownProfiles.map((profile) => {
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
      .filter((t) => !usedIds.has(t.id) && !knownProfiles.some((p) => (
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
      // Hide anonymous / auto-generated guests (ゲスト桜42, ゲスト蜜15, …).
      .filter((entry) => !/^ゲスト/.test(String(entry.label || '').trim()))
    return [...known, ...extras]
  }, [actingAsOwner, threads, chatAccounts])

  const ownerActiveGuestLabel = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return 'ゲスト'
    // The roster is built from the live account list, so it wins over a thread
    // label that may have been serialized before accounts finished loading.
    const entry = ownerGuestRoster.find((item) => (
      item.threadId === activeThreadId
      || item.canonicalId === activeThreadId
      || item.thread?.id === activeThreadId
    ))
    if (entry?.known && entry.label) return entry.label
    const thread = threads.find((item) => item.id === activeThreadId)
    return resolveGuestDisplayName({
      threadId: activeThreadId,
      guestKey: thread?.guestKey,
      guestLabel: thread?.guestLabel,
    })
  }, [actingAsOwner, activeThreadId, threads, ownerGuestRoster])

  const ownerActiveGuestKey = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return ''
    const thread = threads.find((entry) => entry.id === activeThreadId)
    const fromThread = String(thread?.guestKey || '').trim().toLowerCase()
    if (fromThread) return fromThread
    const known = String(activeThreadId).match(/^guest-([a-z0-9_-]+)$/i)
    return known ? known[1].toLowerCase() : ''
  }, [actingAsOwner, activeThreadId, threads])

  const unreadLauncher = useMemo(() => {
    if (actingAsOwner) {
      const visibleIds = new Set(
        ownerGuestRoster.flatMap((entry) => [entry.threadId, entry.canonicalId, entry.thread?.id].filter(Boolean)),
      )
      return threads.reduce((sum, thread) => (
        visibleIds.has(thread.id) ? sum + threadUnreadCount(thread, 'hana') : sum
      ), 0)
    }
    return threadUnreadCount(ownThread, 'guest')
  }, [actingAsOwner, threads, ownThread, ownerGuestRoster])

  const threadUnreadSnapshotRef = useRef({})
  const guestUnreadSnapshotRef = useRef(null)
  const ownerThreadsReadyRef = useRef(false)

  // Browsers block audio until a gesture; unlock once the user interacts anywhere.
  useEffect(() => {
    if (hidden) return undefined
    const unlock = () => unlockChatNotifySound()
    const opts = { capture: true, passive: true }
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('keydown', unlock, opts)
    return () => {
      window.removeEventListener('pointerdown', unlock, opts)
      window.removeEventListener('keydown', unlock, opts)
    }
  }, [hidden])

  const notifyIncomingMessage = useCallback(() => {
    if (!messageSound) return
    playChatNotifySound()
  }, [messageSound])

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

  // Owner inbox: default to gabusan (gabu) so Hana does not start on "ゲストを選択".
  // Also leave any anonymous ゲスト* thread that is no longer shown in the roster.
  useEffect(() => {
    if (hidden || !actingAsOwner) return

    if (activeThreadId) {
      const stillVisible = ownerGuestRoster.some((item) => (
        item.threadId === activeThreadId
        || item.canonicalId === activeThreadId
        || item.thread?.id === activeThreadId
      ))
      if (stillVisible) return
    }

    const entry = ownerGuestRoster.find((item) => (
      item.guestKey === DEFAULT_OWNER_GUEST_KEY
      || item.canonicalId === `guest-${DEFAULT_OWNER_GUEST_KEY}`
    ))
    const profile = getGuestProfile(DEFAULT_OWNER_GUEST_KEY)
    const threadId = entry?.threadId || `guest-${DEFAULT_OWNER_GUEST_KEY}`
    const canonicalId = entry?.canonicalId || `guest-${DEFAULT_OWNER_GUEST_KEY}`
    const label = entry?.label || profile?.displayName || 'ガブリエル'
    const guestKeyForThread = entry?.guestKey || DEFAULT_OWNER_GUEST_KEY

    setHanaMessages([])
    setActiveThreadId(threadId)

    void ensureChatThread({
      threadId: canonicalId,
      guestLabel: label,
      guestKey: guestKeyForThread,
    }).catch(() => {})
  }, [hidden, actingAsOwner, activeThreadId, ownerGuestRoster])

  // Owner inbox: chime on new unread (panel open or closed), jump only while open.
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
      // Ignore anonymous ゲスト* threads that are hidden from the roster.
      const inRoster = ownerGuestRoster.some((item) => (
        item.threadId === thread.id || item.canonicalId === thread.id || item.thread?.id === thread.id
      ))
      if (!inRoster) return
      if (!newestUpdated || updatedAt >= newestUpdated) {
        newestUpdated = updatedAt
        newestId = thread.id
      }
    })

    threadUnreadSnapshotRef.current = snapshot
    if (newestId) notifyIncomingMessage()
    if (!open || !newestId || newestId === activeThreadId) return

    const entry = ownerGuestRoster.find((item) => (
      item.threadId === newestId || item.canonicalId === newestId || item.thread?.id === newestId
    ))
    if (!entry) return
    setReplyTo(null)
    setEditingId(null)
    setHanaMessages([])
    setActiveThreadId(entry.threadId)
  }, [hidden, actingAsOwner, open, threads, activeThreadId, ownerGuestRoster, notifyIncomingMessage])

  // Guest: soft chime when Hana (or the other party) leaves a new unread message.
  useEffect(() => {
    if (hidden || actingAsOwner || !ownThread) {
      if (!ownThread) guestUnreadSnapshotRef.current = null
      return
    }
    const count = threadUnreadCount(ownThread, 'guest')
    const updatedAt = String(ownThread.updatedAt || '')
    const unread = Boolean(ownThread.unreadByGuest)
    const next = { count, updatedAt, unread }
    const prev = guestUnreadSnapshotRef.current
    if (!prev) {
      guestUnreadSnapshotRef.current = next
      return
    }
    const grew = unread && (
      count > (prev.count || 0)
      || (!prev.unread && unread)
    )
    guestUnreadSnapshotRef.current = next
    if (grew) notifyIncomingMessage()
  }, [hidden, actingAsOwner, ownThread, notifyIncomingMessage])

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
    if (hidden) return undefined
    ensureDefaultChatAccounts().catch(() => {})
    return subscribeChatAccounts(
      (next) => setChatAccounts(listGuestProfiles(next)),
      () => {},
    )
  }, [hidden])

  useEffect(() => {
    if (hidden) {
      setChatProfiles({})
      return undefined
    }
    const ids = [
      OWNER_PROFILE.key,
      ...chatAccounts.map((profile) => profile.key),
      sessionProfile.id,
      ownerActiveGuestKey,
    ].filter(Boolean)
    return subscribeChatProfiles(
      ids,
      (next) => setChatProfiles(next || {}),
      () => {},
    )
  }, [hidden, sessionProfile.id, ownerActiveGuestKey, chatAccounts])

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
        setHanaMessages((prev) => mergeServerMessagesWithPending(next, prev))
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
        setHanaMessages((prev) => mergeServerMessagesWithPending(next, prev))
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

  const requestOwnerAssist = useCallback(async (message, { force = false } = {}) => {
    if (!actingAsOwner || !message?.id) return
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

    const reqId = ++ownerAssistReqRef.current
    const index = hanaMessages.findIndex((item) => item.id === message.id)
    const historySource = (index >= 0 ? hanaMessages.slice(0, index) : hanaMessages)
      .filter((item) => !item.deleted && String(item.text || '').trim())
      .slice(-8)
      .map((item) => ({
        role: item.sender === 'hana' ? 'model' : 'user',
        text: String(item.rawText || item.text || '').trim(),
      }))

    try {
      const data = await analyzeGuestMessageForOwner({
        text,
        guestName: ownerActiveGuestLabel,
        history: historySource,
      })
      if (reqId !== ownerAssistReqRef.current && !force) {
        // Newer requests may have started; still apply if this id is still loading.
      }
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
  }, [actingAsOwner, hanaMessages, ownerActiveGuestLabel])

  // Analyze the unanswered guest streak when Hana opens the thread, then keep
  // analyzing newcomers that arrive afterward. A time baseline (instead of
  // seeding "seen" from the first snapshot) matters because the snapshot can
  // land after the seed step and make the whole history look new, which fired
  // dozens of parallel calls and tripped the API rate limit.
  useEffect(() => {
    if (hidden || !actingAsOwner || !activeThreadId) {
      if (!actingAsOwner) {
        ownerAssistBaselineRef.current = ''
        ownerAssistSeenRef.current = new Set()
        ownerAssistOpenedAtRef.current = 0
        ownerAssistSeedRef.current = ''
      }
      return undefined
    }

    if (ownerAssistBaselineRef.current !== activeThreadId) {
      ownerAssistBaselineRef.current = activeThreadId
      ownerAssistSeenRef.current = new Set()
      ownerAssistOpenedAtRef.current = Date.now()
      ownerAssistSeedRef.current = ''
    }

    // Seed every consecutive unanswered guest text (not only the latest), so a
    // burst of messages waiting for Hana all get translation cards on open.
    if (ownerAssistSeedRef.current !== activeThreadId && hanaMessages.length) {
      ownerAssistSeedRef.current = activeThreadId
      const pending = collectUnansweredOwnerAssistMessages(hanaMessages, {
        isAssistable: isOwnerAssistableGuestMessage,
        max: 8,
      }).filter((item) => !ownerAssistSeenRef.current.has(item.id))
      pending.forEach((item) => ownerAssistSeenRef.current.add(item.id))
      void (async () => {
        for (const item of pending) {
          await requestOwnerAssist(item)
        }
      })()
    }

    const openedAt = ownerAssistOpenedAtRef.current
    const newcomers = hanaMessages.filter((item) => {
      if (!isOwnerAssistableGuestMessage(item)) return false
      if (ownerAssistSeenRef.current.has(item.id)) return false
      // Missing createdAt = server timestamp still resolving; wait for the next snapshot.
      const createdAt = Date.parse(item.createdAt || '')
      return Number.isFinite(createdAt) && createdAt >= openedAt
    })
    newcomers.forEach((item) => {
      ownerAssistSeenRef.current.add(item.id)
      void requestOwnerAssist(item)
    })
    return undefined
  }, [hidden, actingAsOwner, activeThreadId, hanaMessages, requestOwnerAssist])

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

  const messagesScrollKey = useMemo(() => {
    const list = actingAsOwner || guestOnHuman ? hanaMessages : aiMessages
    const last = list[list.length - 1]
    // Ignore reaction-only updates — those should not yank the scroll position.
    return [
      channel,
      activeThreadId || '',
      actingAsOwner ? '1' : '0',
      String(list.length),
      last?.id || '',
      last?.text || '',
      last?.editedAt || '',
      last?.deleted ? '1' : '0',
    ].join('\0')
  }, [actingAsOwner, guestOnHuman, hanaMessages, aiMessages, channel, activeThreadId])

  useEffect(() => {
    if (!open) return undefined
    scrollToLatestRef.current()
    return undefined
  }, [messagesScrollKey, open])

  const activeThreadMeta = useMemo(() => {
    if (actingAsOwner) {
      return threads.find((thread) => thread.id === activeThreadId) || null
    }
    return ownThread
  }, [actingAsOwner, threads, activeThreadId, ownThread])

  const typingThreadId = actingAsOwner ? activeThreadId : guestChatId
  const typingRole = actingAsOwner ? 'hana' : 'guest'
  const typingEligible = Boolean(
    open
    && typingThreadId
    && (actingAsOwner || guestOnHuman),
  )

  // Send a throttled heartbeat while this composer contains text. A separate
  // idle timer clears it quickly; the receiver also applies a freshness limit.
  useEffect(() => {
    window.clearTimeout(typingPulseTimerRef.current)
    window.clearTimeout(typingStopTimerRef.current)

    const current = typingStateRef.current
    const stopCurrent = () => {
      if (!current.threadId || !current.role) return
      setChatTyping(current.threadId, current.role, false).catch(() => {})
      typingStateRef.current = { threadId: '', role: '', lastPulseAt: 0 }
    }

    if (!typingEligible || !draft.trim()) {
      stopCurrent()
      return
    }

    if (current.threadId !== typingThreadId || current.role !== typingRole) {
      stopCurrent()
      typingStateRef.current = { threadId: typingThreadId, role: typingRole, lastPulseAt: 0 }
    }

    const pulse = () => {
      const state = typingStateRef.current
      if (state.threadId !== typingThreadId || state.role !== typingRole) return
      state.lastPulseAt = Date.now()
      setChatTyping(typingThreadId, typingRole, true).catch(() => {})
    }

    const elapsed = Date.now() - typingStateRef.current.lastPulseAt
    if (elapsed >= TYPING_PULSE_MS) {
      pulse()
    } else {
      typingPulseTimerRef.current = window.setTimeout(pulse, TYPING_PULSE_MS - elapsed)
    }
    typingStopTimerRef.current = window.setTimeout(stopCurrent, TYPING_IDLE_MS)
  }, [draft, typingEligible, typingRole, typingThreadId])

  useEffect(() => () => {
    window.clearTimeout(typingPulseTimerRef.current)
    window.clearTimeout(typingStopTimerRef.current)
    const state = typingStateRef.current
    if (state.threadId && state.role) {
      setChatTyping(state.threadId, state.role, false).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setInterval(() => setTypingTick(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [open])

  const partnerTyping = useMemo(() => {
    void typingTick
    if (!open || (!actingAsOwner && !guestOnHuman)) return false
    const value = actingAsOwner
      ? activeThreadMeta?.guestTypingAt
      : activeThreadMeta?.hanaTypingAt
    const at = Date.parse(String(value || ''))
    return Number.isFinite(at) && typingTick - at < TYPING_VISIBLE_MS
  }, [open, actingAsOwner, guestOnHuman, activeThreadMeta, typingTick])

  const partnerTypingLabel = actingAsOwner
    ? `${ownerActiveGuestLabel}が入力中`
    : 'はなが入力中'

  useEffect(() => {
    if (hidden || !open) return undefined
    const timer = window.setInterval(() => setPresenceTick(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [hidden, open])

  /**
   * Replay the effect the other participant just triggered.
   *
   * Freshness is "arrived after we started watching this thread", never a
   * comparison against the sender's clock: the two devices are only loosely in
   * sync, and a few seconds of skew silently swallowed one direction.
   */
  useEffect(() => {
    const threadId = activeThreadMeta?.id || ''
    if (hidden || !open || !threadId) {
      effectBaselineRef.current = ''
      return
    }

    const effect = activeThreadMeta?.lastEffect

    // First snapshot for this thread: whatever is stored is history, not news.
    if (effectBaselineRef.current !== threadId) {
      effectBaselineRef.current = threadId
      if (effect?.nonce) seenEffectRef.current.add(effect.nonce)
      return
    }

    if (!effect?.nonce) return
    if (seenEffectRef.current.has(effect.nonce)) return

    seenEffectRef.current.add(effect.nonce)
    if (seenEffectRef.current.size > 40) {
      seenEffectRef.current = new Set([effect.nonce])
    }

    if (effect.by === (actingAsOwner ? 'hana' : 'guest')) return

    if (effect.kind === 'moment') {
      triggerEmotionMoment(effect.momentId)
    } else if (effect.kind === 'party') {
      triggerPartyBurst({ count: 24 })
    } else {
      triggerFlowerRain({ count: 26, emoji: effect.emoji || defaultReaction })
    }
  }, [hidden, open, activeThreadMeta, actingAsOwner, defaultReaction])

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

  const partnerPresence = useMemo(() => {
    void presenceTick
    if (actingAsOwner) {
      if (!activeThreadId) {
        return resolveChatPresence({})
      }
      return resolveChatPresence({
        onlineAt: activeThreadMeta?.guestOnlineAt,
        status: chatProfiles[ownerActiveGuestKey]?.status || activeThreadMeta?.guestStatus,
      }, presenceTick)
    }
    if (channel === 'ai') {
      return resolveChatPresence({
        onlineAt: new Date(presenceTick).toISOString(),
        status: 'auto',
      }, presenceTick)
    }
    return resolveChatPresence({
      onlineAt: activeThreadMeta?.hanaOnlineAt,
      status: chatProfiles[OWNER_PROFILE.key]?.status || activeThreadMeta?.hanaStatus,
    }, presenceTick)
  }, [actingAsOwner, channel, activeThreadMeta, presenceTick, activeThreadId, chatProfiles, ownerActiveGuestKey])

  // Status is a profile-level setting (same on the main page and in every thread).
  const myPresenceMode = normalizeChatPresenceMode(
    chatProfiles[sessionProfile.id]?.status
    || (actingAsOwner ? activeThreadMeta?.hanaStatus : activeThreadMeta?.guestStatus),
  )

  const myPresence = useMemo(() => {
    if (!open) {
      return resolveChatPresence({ status: myPresenceMode })
    }
    // While this chat is open we are effectively online; mode may still be busy/away.
    return resolveChatPresence({
      onlineAt: new Date(presenceTick).toISOString(),
      status: myPresenceMode,
    }, presenceTick)
  }, [open, myPresenceMode, presenceTick])

  const applyMyPresenceStatus = async (mode) => {
    const threadId = actingAsOwner ? activeThreadId : guestChatId
    const role = actingAsOwner ? 'hana' : 'guest'
    try {
      await setChatProfileStatus(sessionProfile.id, mode)
      // Mirror onto the open thread so older clients reading thread fields stay in sync.
      if (threadId) await setChatPresenceStatus(threadId, role, mode)
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'ステータスを更新できませんでした。')
    }
  }

  useEffect(() => {
    if (hidden || !open) return undefined
    const panel = panelRef.current
    if (!panel) return undefined

    const scrollMessagesToEnd = () => {
      scrollToLatestRef.current()
    }

    const clearInline = ({ keepPinned = false } = {}) => {
      panel.style.left = ''
      panel.style.right = ''
      panel.style.top = ''
      panel.style.bottom = ''
      panel.style.width = ''
      panel.style.height = ''
      panel.style.maxHeight = ''
      panel.classList.remove('is-keyboard')
      if (!keepPinned) keyboardPinnedRef.current = false
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

    const applyMobileViewport = (options = {}) => {
      if (!window.matchMedia('(max-width: 640px)').matches) {
        clearInline()
        lockPageScroll(false)
        return
      }

      // Always lock background page while chat is open on mobile.
      lockPageScroll(true)

      const vv = window.visualViewport
      const inputFocused = document.activeElement === inputRef.current
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0
      const vvHeight = vv ? vv.height : layoutHeight
      const keyboardInset = Math.max(0, layoutHeight - vvHeight - (vv?.offsetTop || 0))
      const vvShrunk = keyboardInset > 80 || (vv && vv.height < layoutHeight - 100)

      if (inputFocused || options.forceKeyboard) keyboardPinnedRef.current = true
      if (!inputFocused && !options.forceKeyboard && !vvShrunk) {
        keyboardPinnedRef.current = false
      }

      const wantKeyboard = Boolean(options.forceKeyboard)
        || keyboardPinnedRef.current
        || inputFocused

      if (!vv) {
        if (wantKeyboard) panel.classList.add('is-keyboard')
        else clearInline()
        return
      }

      // Focused but keyboard not open yet: keep fullscreen CSS (no shrink flash).
      if (wantKeyboard && !vvShrunk) {
        panel.classList.add('is-keyboard')
        // Clear any half-applied shrink from a previous frame.
        if (viewportApplyRef.current.keyboard) {
          panel.style.left = ''
          panel.style.right = ''
          panel.style.top = ''
          panel.style.bottom = ''
          panel.style.width = ''
          panel.style.height = ''
          panel.style.maxHeight = ''
          viewportApplyRef.current = { top: 0, height: 0, width: 0, keyboard: false }
        }
        if (options.revealComposer || options.force) {
          window.requestAnimationFrame(scrollMessagesToEnd)
        }
        return
      }

      if (!wantKeyboard && !vvShrunk) {
        clearInline()
        return
      }

      // Keyboard visible: pin panel to the visual viewport above the keyboard.
      const left = Math.max(0, Math.round(vv.offsetLeft))
      const width = Math.max(240, Math.round(vv.width))
      const top = Math.max(0, Math.round(vv.offsetTop))
      const height = Math.max(180, Math.round(vv.height))
      const prev = viewportApplyRef.current
      const same = prev.keyboard
        && Math.abs(prev.top - top) < 8
        && Math.abs(prev.height - height) < 8
        && Math.abs(prev.width - width) < 8

      if (same && !options.force && !options.revealComposer) return

      viewportApplyRef.current = { top, height, width, keyboard: true }
      panel.style.left = `${left}px`
      panel.style.right = 'auto'
      panel.style.width = `${width}px`
      panel.style.top = `${top}px`
      panel.style.bottom = 'auto'
      panel.style.height = `${height}px`
      panel.style.maxHeight = `${height}px`
      panel.classList.add('is-keyboard')

      // After height settles, keep newest messages in view (not mid-list).
      window.requestAnimationFrame(() => {
        scrollMessagesToEnd()
        window.requestAnimationFrame(scrollMessagesToEnd)
      })
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
      }, 60)
    }

    syncMobileViewport({ immediate: true })
    syncPanelViewportRef.current = syncMobileViewport
    const vv = window.visualViewport
    // resize only — scroll events on iOS cause constant jitter
    vv?.addEventListener('resize', syncMobileViewport)
    window.addEventListener('resize', syncMobileViewport)
    window.addEventListener('orientationchange', syncMobileViewport)
    return () => {
      syncPanelViewportRef.current = () => {}
      if (viewportDebounceRef.current) window.clearTimeout(viewportDebounceRef.current)
      vv?.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('orientationchange', syncMobileViewport)
      clearInline()
      lockPageScroll(false)
    }
  }, [hidden, open])

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
    if (noticeText) {
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
        role: m.sender === 'hana' ? 'hana' : (m.role || 'guest'),
        text: m.text,
        rawText: m.rawText,
        sticker: m.sticker || '',
        effect: m.effect || '',
        effectEmoji: m.effectEmoji || '',
        imageUrl: m.imageUrl || '',
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deleted: m.deleted,
        replyTo: m.replyTo,
        sender: m.sender || m.role,
        reactions: m.reactions || {},
        pending: Boolean(m.pending),
        uploading: Boolean(m.uploading),
      }))
    : aiMessages

  const ownSender = actingAsOwner ? 'hana' : 'guest'
  const reactorId = actingAsOwner
    ? OWNER_PROFILE.key
    : (guestProfile?.key || String(guestKey || '').trim().toLowerCase() || 'guest')
  const canUseReactions = actingAsOwner || guestOnHuman

  const suggestContextKey = useMemo(() => {
    if (!actingAsOwner || !activeThreadId || !ownerSuggestEnabled) return ''
    const usable = hanaMessages.filter((m) => !m.deleted && String(m.text || '').trim())
    if (usable.length === 0) return `empty:${activeThreadId}`
    const last = usable[usable.length - 1]
    return `${activeThreadId}:${usable.length}:${last.id}:${last.sender}:${String(last.text || '').slice(0, 48)}`
  }, [actingAsOwner, activeThreadId, hanaMessages, ownerSuggestEnabled])

  useEffect(() => {
    if (!actingAsOwner || !activeThreadId || !open || !ownerSuggestEnabled) {
      setOwnerSuggestions({ replies: [], topics: [], expressions: [] })
      setSuggestBusy(false)
      setSuggestPickerGroup(null)
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
    ownerSuggestEnabled,
    suggestContextKey,
    ownerActiveGuestLabel,
    hanaMessages,
  ])

  const toggleOwnerSuggest = () => {
    setOwnerSuggestEnabled((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(OWNER_SUGGEST_PREF_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      if (!next) {
        setSuggestPickerGroup(null)
        setOwnerSuggestions({ replies: [], topics: [], expressions: [] })
        setSuggestBusy(false)
      }
      return next
    })
  }

  const applyDefaultReaction = (emoji) => {
    setDefaultReaction(writeDefaultReaction(emoji))
  }

  const toggleEnterToSend = () => {
    setEnterToSend((prev) => writeEnterToSend(!prev))
  }

  const toggleMessageSound = () => {
    setMessageSound((prev) => {
      const next = writeMessageSound(!prev)
      if (next) {
        unlockChatNotifySound()
        playChatNotifySound()
      }
      return next
    })
  }

  // Grow the composer with the draft, then let it scroll once it hits the line cap.
  const resizeComposer = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const styles = window.getComputedStyle(el)
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20
    const borderY = (Number.parseFloat(styles.borderTopWidth) || 0)
      + (Number.parseFloat(styles.borderBottomWidth) || 0)
    const paddingY = (Number.parseFloat(styles.paddingTop) || 0)
      + (Number.parseFloat(styles.paddingBottom) || 0)
    // scrollHeight covers content + padding but never the border on border-box inputs.
    const maxHeight = Math.round((lineHeight * COMPOSER_MAX_LINES) + paddingY + borderY)
    el.style.height = 'auto'
    const contentHeight = el.scrollHeight + borderY
    el.style.height = `${Math.min(contentHeight, maxHeight)}px`
    el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    resizeComposer()
  }, [resizeComposer, draft, open, editingId, replyTo])

  useEffect(() => {
    if (!open) return undefined
    window.addEventListener('resize', resizeComposer)
    return () => window.removeEventListener('resize', resizeComposer)
  }, [open, resizeComposer])

  useEffect(() => {
    setSuggestPickerGroup(null)
    setGuestMenuOpen(false)
    setStickerOpen(false)
    setSettingsOpen(false)
  }, [activeThreadId, open])

  useEffect(() => {
    if (!guestMenuOpen && !settingsOpen && !stickerOpen) return undefined
    const onPointerDown = (event) => {
      if (guestMenuOpen && !guestMenuRef.current?.contains(event.target)) {
        setGuestMenuOpen(false)
      }
      if (stickerOpen && !stickerRef.current?.contains(event.target)) {
        setStickerOpen(false)
      }
      if (settingsOpen && !settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [guestMenuOpen, settingsOpen, stickerOpen])

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
    const canon = canonicalId || (key ? `guest-${key}` : '')
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
        await deleteChatMessage({ threadId, messageId: message.id })
      } else {
        setAiMessages((prev) => prev.filter((m) => m.id !== message.id))
      }
      if (editingId === message.id) {
        setEditingId(null)
        setDraft('')
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || '削除に失敗しました。')
    }
  }

  const myEffectRole = actingAsOwner ? 'hana' : 'guest'
  const effectThreadId = actingAsOwner ? activeThreadId : guestChatId

  // Send my animation to the other side so both screens show the same thing.
  const handleLocalEffect = (payload) => {
    if (!effectThreadId || !canUseReactions) return
    broadcastChatEffect({
      threadId: effectThreadId,
      kind: payload?.kind,
      by: myEffectRole,
      emoji: payload?.emoji,
      momentId: payload?.momentId,
    }).catch(() => {})
  }

  /**
   * Stickers send on tap (no composer round-trip). `text` carries the Japanese
   * label so push notifications and text-only clients still read sensibly.
   */
  const handleSendSticker = async (sticker) => {
    const id = String(sticker?.id || '')
    const label = String(sticker?.label || '').trim()
    if (!id || !label || busy) return
    if (actingAsOwner && !activeThreadId) {
      setError('返信する相手を選んでください。')
      return
    }
    setStickerOpen(false)
    setError('')
    setBusy(true)
    const role = actingAsOwner ? 'hana' : 'guest'
    const pendingId = nextStickerPendingId()
    try {
      const threadId = actingAsOwner
        ? activeThreadId
        : (guestChatId || ensureGuestChatId(guestKey || 'guest'))
      if (!actingAsOwner) {
        if (!guestChatId) setGuestChatId(threadId)
        if (channel !== 'human') switchToHuman(HUMAN_SWITCH_INTENT)
      }

      setHanaMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          pending: true,
          role,
          sender: role,
          text: label,
          rawText: label,
          sticker: id,
          createdAt: new Date().toISOString(),
          replyTo: null,
        },
      ])
      scrollToLatestRef.current()

      await sendChatMessage({
        threadId,
        text: label,
        sender: role,
        sticker: id,
        ...(actingAsOwner
          ? {}
          : {
              guestLabel: guestThreadLabel,
              guestKey: guestProfile?.key || guestKey || '',
            }),
      })
      if (!actingAsOwner) setChannel('human')
    } catch (err) {
      setHanaMessages((prev) => prev.filter((m) => m.id !== pendingId))
      setError(getFirebaseErrorMessage(err) || 'スタンプを送れませんでした。')
    } finally {
      setBusy(false)
      scrollToLatestRef.current()
    }
  }

  /** Pick/take a photo → compress → Storage → chat message with imageUrl. */
  const handleSendImage = async (file) => {
    if (!file || busy) return
    if (actingAsOwner && !activeThreadId) {
      setError('返信する相手を選んでください。')
      return
    }
    setStickerOpen(false)
    setError('')
    setBusy(true)
    const role = actingAsOwner ? 'hana' : 'guest'
    const pendingId = nextStickerPendingId()
    const localUrl = URL.createObjectURL(file)
    try {
      const threadId = actingAsOwner
        ? activeThreadId
        : (guestChatId || ensureGuestChatId(guestKey || 'guest'))
      if (!actingAsOwner) {
        if (!guestChatId) setGuestChatId(threadId)
        if (channel !== 'human') switchToHuman(HUMAN_SWITCH_INTENT)
      }

      setHanaMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          pending: true,
          uploading: true,
          role,
          sender: role,
          text: '写真',
          rawText: '写真',
          imageUrl: localUrl,
          createdAt: new Date().toISOString(),
          replyTo: null,
        },
      ])
      scrollToLatestRef.current()

      const imageUrl = await uploadChatImage(threadId, file)
      setHanaMessages((prev) => prev.map((m) => (
        m.id === pendingId ? { ...m, imageUrl, uploading: false } : m
      )))
      URL.revokeObjectURL(localUrl)
      await sendChatMessage({
        threadId,
        text: '写真',
        sender: role,
        imageUrl,
        ...(actingAsOwner
          ? {}
          : {
              guestLabel: guestThreadLabel,
              guestKey: guestProfile?.key || guestKey || '',
            }),
      })
      if (!actingAsOwner) setChannel('human')
    } catch (err) {
      URL.revokeObjectURL(localUrl)
      setHanaMessages((prev) => prev.filter((m) => m.id !== pendingId))
      setError(getFirebaseErrorMessage(err) || err?.message || '写真を送れませんでした。')
    } finally {
      setBusy(false)
      scrollToLatestRef.current()
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const playStandaloneEffect = async (payload) => {
    if (!canUseReactions) return
    if (actingAsOwner && !activeThreadId) {
      setError('返信する相手を選んでください。')
      return
    }

    const described = describeStandaloneEffect(payload, defaultReaction)
    if (!described) return

    // Play locally right away, then mirror to the other side.
    if (payload?.kind === 'moment') {
      triggerEmotionMoment(payload.momentId)
    } else if (payload?.kind === 'party') {
      triggerPartyBurst({ count: 24 })
    } else {
      triggerFlowerRain({ count: 26, emoji: described.effectEmoji })
    }

    const role = actingAsOwner ? 'hana' : 'guest'
    const pendingId = nextStickerPendingId()
    setError('')
    setBusy(true)
    try {
      const threadId = actingAsOwner
        ? activeThreadId
        : (guestChatId || ensureGuestChatId(guestKey || 'guest'))
      if (!actingAsOwner) {
        if (!guestChatId) setGuestChatId(threadId)
        if (channel !== 'human') switchToHuman(HUMAN_SWITCH_INTENT)
      }

      broadcastChatEffect({
        threadId,
        kind: payload?.kind,
        by: role,
        emoji: described.effectEmoji,
        momentId: payload?.momentId,
      }).catch(() => {})

      setHanaMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          pending: true,
          role,
          sender: role,
          text: described.text,
          rawText: described.text,
          effect: described.effect,
          effectEmoji: described.effectEmoji,
          createdAt: new Date().toISOString(),
          replyTo: null,
        },
      ])
      scrollToLatestRef.current()

      await sendChatMessage({
        threadId,
        text: described.text,
        sender: role,
        effect: described.effect,
        effectEmoji: described.effectEmoji,
        ...(actingAsOwner
          ? {}
          : {
              guestLabel: guestThreadLabel,
              guestKey: guestProfile?.key || guestKey || '',
            }),
      })
      if (!actingAsOwner) setChannel('human')
    } catch (err) {
      setHanaMessages((prev) => prev.filter((m) => m.id !== pendingId))
      setError(getFirebaseErrorMessage(err) || 'エフェクトを送れませんでした。')
    } finally {
      setBusy(false)
      scrollToLatestRef.current()
    }
  }

  const handleReact = async (message, emoji, options = {}) => {
    if (message?.deleted || !emoji) return
    const em = String(emoji || '').trim()
    const rid = String(reactorId || '').trim().toLowerCase() || 'guest'
    if (!em || !rid) return

    // Keep composer focused if the keyboard was already open.
    const keepKb = document.activeElement === inputRef.current || keyboardPinnedRef.current
    if (keepKb) {
      retainComposerFocusRef.current = true
      keyboardPinnedRef.current = true
    }

    // Local AI channel: keep reactions in memory only.
    if (!canUseReactions) {
      setAiMessages((prev) => prev.map((m) => {
        if (m.id !== message.id) return m
        const reactions = { ...(m.reactions || {}) }
        const counts = { ...(reactions[em] || {}) }
        const mine = Number(counts[rid]) || 0
        const mode = options.mode || 'toggle'
        if (mode === 'increment') counts[rid] = Math.min(99, mine + 1)
        else if (mode === 'set') counts[rid] = 1
        else if (mine > 0) delete counts[rid]
        else counts[rid] = 1
        if (Object.keys(counts).length) reactions[em] = counts
        else delete reactions[em]
        return { ...m, reactions }
      }))
      if (keepKb) {
        window.requestAnimationFrame(() => {
          try {
            inputRef.current?.focus({ preventScroll: true })
          } catch {
            inputRef.current?.focus()
          }
        })
      }
      return
    }

    const threadId = actingAsOwner ? activeThreadId : guestChatId
    if (!threadId || !message?.id) {
      setError('リアクションできません（スレッド未接続）。')
      return
    }
    try {
      await toggleChatReaction({
        threadId,
        messageId: message.id,
        emoji: em,
        reactorId: rid,
        mode: options.mode || 'toggle',
      })
    } catch (err) {
      setError(getFirebaseErrorMessage(err) || 'リアクションに失敗しました。')
    } finally {
      if (keepKb) {
        window.requestAnimationFrame(() => {
          try {
            inputRef.current?.focus({ preventScroll: true })
          } catch {
            inputRef.current?.focus()
          }
          syncPanelViewportRef.current({ forceKeyboard: true, force: true })
        })
      }
    }
  }

  const currentThreadId = actingAsOwner ? activeThreadId : (guestOnHuman ? guestChatId : 'ai')

  const notifyAction = (text) => {
    setActionNote(text)
  }

  const handleMenuAction = (actionId, message) => {
    if (!message || message.deleted) return false
    const threadId = currentThreadId || ''

    if (actionId === 'pin') {
      const result = toggleChatPin(extrasProfileId, message, { threadId })
      setPins(result.list)
      notifyAction(result.pinned ? 'ピン留めしました' : 'ピンを外しました')
      return true
    }

    if (actionId === 'remind') {
      setRemindMessage(message)
      return true
    }

    if (actionId === 'translate') {
      const text = String(message.rawText || message.text || '').trim()
      if (!text) {
        notifyAction('翻訳できるテキストがありません')
        return true
      }
      const targetLang = actingAsOwner ? 'vi' : 'ja'
      const langLabel = actingAsOwner ? 'ベトナム語' : '日本語'
      notifyAction(`${langLabel}に翻訳中…`)
      void translateChatMessage({ text, targetLang })
        .then((data) => {
          if (!data.translation) {
            notifyAction(data.reason === 'quota' ? '翻訳クォータ不足です' : '翻訳に失敗しました')
            return
          }
          setTranslations((prev) => ({ ...prev, [message.id]: data.translation }))
          notifyAction(`${langLabel}に翻訳しました`)
        })
        .catch((err) => {
          notifyAction(getFirebaseErrorMessage(err) || '翻訳に失敗しました')
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
    addChatReminder(extrasProfileId, remindMessage, remindAt, {
      threadId: currentThreadId || '',
    })
    setDueReminders(dueChatReminders(extrasProfileId))
    setRemindMessage(null)
    notifyAction('リマインダーをセットしました')
  }

  const handleSend = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError('')
    setBusy(true)
    setSpeaking(true)
    keyboardPinnedRef.current = true
    retainComposerFocusRef.current = true
    // Keep the soft keyboard open after send (don't let submit steal focus).
    const keepComposerFocused = () => {
      const input = inputRef.current
      if (!input || input.disabled) return
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
      syncPanelViewportRef.current({ forceKeyboard: true, force: true, revealComposer: true })
    }
    keepComposerFocused()
    window.requestAnimationFrame(keepComposerFocused)
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
        const pendingId = `pending-${Date.now()}`
        setHanaMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            pending: true,
            role: 'hana',
            sender: 'hana',
            text,
            rawText: text,
            createdAt: nowIso,
            replyTo: pendingReply
              ? {
                  id: pendingReply.id,
                  text: pendingReply.text,
                  sender: pendingReply.sender || pendingReply.role,
                }
              : null,
          },
        ])
        scrollToLatestRef.current()
        await sendChatMessage({
          threadId: activeThreadId,
          text,
          sender: 'hana',
          replyTo: pendingReply,
        })
        scrollToLatestRef.current()
      } else if (channel === 'human' || wantsHumanHana(text)) {
        if (channel !== 'human') {
          switchToHuman(HUMAN_SWITCH_INTENT)
        }
        const threadId = guestChatId || ensureGuestChatId(guestKey || 'guest')
        if (!guestChatId) setGuestChatId(threadId)
        const pendingId = `pending-${Date.now()}`
        setHanaMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            pending: true,
            role: 'guest',
            sender: 'guest',
            text,
            rawText: text,
            createdAt: nowIso,
            replyTo: pendingReply
              ? {
                  id: pendingReply.id,
                  text: pendingReply.text,
                  sender: pendingReply.sender || pendingReply.role,
                }
              : null,
          },
        ])
        scrollToLatestRef.current()
        await sendChatMessage({
          threadId,
          text,
          sender: 'guest',
          guestLabel: guestThreadLabel,
          guestKey: guestProfile?.key || guestKey || '',
          replyTo: pendingReply,
        })
        setChannel('human')
        scrollToLatestRef.current()
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
        scrollToLatestRef.current()
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
          scrollToLatestRef.current()
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
        scrollToLatestRef.current()
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
      keyboardPinnedRef.current = true
      retainComposerFocusRef.current = true
      window.requestAnimationFrame(() => {
        const input = inputRef.current
        if (!input) return
        try {
          input.focus({ preventScroll: true })
        } catch {
          input.focus()
        }
        syncPanelViewportRef.current({ forceKeyboard: true, force: true, revealComposer: true })
        scrollToLatestRef.current()
        window.setTimeout(() => {
          scrollToLatestRef.current()
          retainComposerFocusRef.current = false
        }, 400)
      })
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
      ? ''
      : 'はなちゃんとお話し中'
  const presenceLabel = partnerPresence.label
  const myStatusLabel = myPresence.label

  if (hidden) return null

  // Portal to body so Capacitor / parent stacking never clips the FAB.
  return createPortal(
    <div className={`hana-chat${open ? ' is-open is-fullscreen' : ''}`}>
      <FlowerRainLayer />
      <EmotionMomentLayer />
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
          className="hana-chat-panel is-fullscreen"
          aria-label="はなちゃんチャット"
        >
          <header className="hana-chat-header">
            <div className={`hana-chat-avatar${speaking ? ' is-speaking' : ''}`}>
              <img src={partnerAvatarSrc} alt="" />
              <span
                className={`hana-chat-presence ${partnerPresence.className}`}
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
                    <p className={`hana-chat-presence-label ${partnerPresence.className}`}>
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
                          const guestPresence = resolveChatPresence({
                            onlineAt: entry.thread?.guestOnlineAt,
                            status: entry.thread?.guestStatus,
                          }, presenceTick)
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
                                <span className="hana-chat-thread-avatar-wrap">
                                  <img
                                    className="hana-chat-thread-avatar"
                                    src={avatarSrcForProfile(
                                      entry.guestKey || entry.canonicalId.replace(/^guest-/, '') || 'guest',
                                      entry.label,
                                    )}
                                    alt=""
                                  />
                                  <span
                                    className={`hana-chat-thread-dot ${guestPresence.className}`}
                                    title={guestPresence.label}
                                    aria-hidden="true"
                                  />
                                </span>
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
                  {modeSub ? <p className="hana-chat-kicker">{modeSub}</p> : null}
                  <div className="hana-chat-heading-row">
                    <h2 className="hana-chat-heading">{modeTitle}</h2>
                    <p className={`hana-chat-presence-label ${partnerPresence.className}`}>
                      {presenceLabel}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="hana-chat-header-actions">
              {(actingAsOwner ? activeThreadId : guestOnHuman) ? (
                <HanaCall
                  key={actingAsOwner ? activeThreadId : guestChatId}
                  threadId={actingAsOwner ? activeThreadId : guestChatId}
                  role={actingAsOwner ? 'hana' : 'guest'}
                  partnerName={actingAsOwner ? ownerActiveGuestLabel : 'はな'}
                  compact
                />
              ) : null}
              {!actingAsOwner && channel === 'human' ? (
                <button
                  type="button"
                  className="hana-chat-back-ai"
                  onClick={() => {
                    setChannel('ai')
                  }}
                  title="はなちゃんに戻る"
                >
                  はなちゃんに戻る
                </button>
              ) : null}
              <div className="hana-chat-settings" ref={settingsRef}>
                <button
                  type="button"
                  className={`hana-chat-settings-btn${settingsOpen ? ' is-open' : ''}`}
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  aria-label="チャット設定"
                  title={`設定（自分: ${myStatusLabel}）`}
                  onClick={() => {
                    setGuestMenuOpen(false)
                    setSettingsOpen((value) => !value)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.63 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.75 14.52a.49.49 0 0 0-.12.61l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
                    />
                  </svg>
                  <span className={`hana-chat-settings-status-dot ${myPresence.className}`} aria-hidden="true" />
                </button>
                {settingsOpen ? (
                  <div className="hana-chat-settings-panel" role="dialog" aria-label="チャット設定">
                    <p className="hana-chat-settings-title">設定</p>
                    <div className="hana-chat-settings-section">
                      <p className="hana-chat-settings-label">自分のステータス</p>
                      <p className="hana-chat-settings-hint">今は「{myStatusLabel}」・全員に同じ表示</p>
                      <div className="hana-chat-status-modes" role="listbox" aria-label="自分のステータス">
                        {CHAT_PRESENCE_MODES.map((mode) => {
                          const selected = myPresenceMode === mode.id
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`hana-chat-status-mode${selected ? ' is-active' : ''}`}
                              onClick={() => { void applyMyPresenceStatus(mode.id) }}
                            >
                              <span
                                className={`hana-chat-status-mode-dot ${mode.id === 'auto' ? 'is-online' : `is-${mode.id}`}`}
                                aria-hidden="true"
                              />
                              {mode.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="hana-chat-settings-section">
                      <p className="hana-chat-settings-label">クイックリアクション</p>
                      <p className="hana-chat-settings-hint">相手のメッセージ角に出すワンタップ絵文字</p>
                      <div className="hana-chat-settings-emojis" role="listbox" aria-label="クイックリアクション">
                        {CHAT_REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            role="option"
                            aria-selected={defaultReaction === emoji}
                            className={`hana-chat-settings-emoji${defaultReaction === emoji ? ' is-active' : ''}`}
                            onClick={() => applyDefaultReaction(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    {desktopKeyboard ? (
                      <div className="hana-chat-settings-section">
                        <div className="hana-chat-settings-row">
                          <div>
                            <p className="hana-chat-settings-label">Enterで送信</p>
                            <p className="hana-chat-settings-hint">
                              {enterToSend
                                ? 'Enterで送信・Shift+Enterで改行'
                                : 'Shift+Enterで送信・Enterで改行'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`hana-chat-hint-toggle${enterToSend ? ' is-on' : ''}`}
                            aria-pressed={enterToSend}
                            title={enterToSend ? 'Enter送信をオフ' : 'Enter送信をオン'}
                            onClick={toggleEnterToSend}
                          >
                            <span className="hana-chat-hint-toggle-label">Enter</span>
                            <span className="hana-chat-hint-toggle-track" aria-hidden="true">
                              <span className="hana-chat-hint-toggle-thumb" />
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="hana-chat-settings-section">
                      <div className="hana-chat-settings-row">
                        <div>
                          <p className="hana-chat-settings-label">メッセージ音</p>
                          <p className="hana-chat-settings-hint">
                            {messageSound
                              ? '新しいメッセージで着信音を鳴らす'
                              : '着信音はオフです'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`hana-chat-hint-toggle${messageSound ? ' is-on' : ''}`}
                          aria-pressed={messageSound}
                          title={messageSound ? 'メッセージ音をオフ' : 'メッセージ音をオン'}
                          onClick={toggleMessageSound}
                        >
                          <span className="hana-chat-hint-toggle-label">音</span>
                          <span className="hana-chat-hint-toggle-track" aria-hidden="true">
                            <span className="hana-chat-hint-toggle-thumb" />
                          </span>
                        </button>
                      </div>
                    </div>
                    {actingAsOwner ? (
                      <div className="hana-chat-settings-section">
                        <div className="hana-chat-settings-row">
                          <div>
                            <p className="hana-chat-settings-label">返信ヒント</p>
                            <p className="hana-chat-settings-hint">下に返信案チップを表示</p>
                          </div>
                          <button
                            type="button"
                            className={`hana-chat-hint-toggle${ownerSuggestEnabled ? ' is-on' : ''}`}
                            aria-pressed={ownerSuggestEnabled}
                            title={ownerSuggestEnabled ? 'ヒントをオフ' : 'ヒントをオン'}
                            onClick={toggleOwnerSuggest}
                          >
                            <span className="hana-chat-hint-toggle-label">ヒント</span>
                            <span className="hana-chat-hint-toggle-track" aria-hidden="true">
                              <span className="hana-chat-hint-toggle-thumb" />
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
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

          {dueReminders.length > 0 ? (
            <div className="hana-chat-reminder-banner" role="status">
              {dueReminders.slice(0, 2).map((item) => (
                <div key={item.id} className="hana-chat-reminder-item">
                  <div>
                    <strong>リマインダー</strong>
                    <span>{item.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      markChatReminderDone(extrasProfileId, item.id)
                      setDueReminders(dueChatReminders(extrasProfileId))
                    }}
                  >
                    OK
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {pins.filter((pin) => !currentThreadId || pin.threadId === currentThreadId || (!pin.threadId && currentThreadId === 'ai')).length > 0 ? (
            <div className="hana-chat-pin-strip" aria-label="ピン留め">
              {pins
                .filter((pin) => !currentThreadId || pin.threadId === currentThreadId || (!pin.threadId && currentThreadId === 'ai'))
                .slice(0, 3)
                .map((pin) => (
                  <div key={pin.messageId} className="hana-chat-pin-chip">
                    <span>📌 {pin.text}</span>
                    <button
                      type="button"
                      aria-label="ピンを外す"
                      onClick={() => setPins(unpinChatMessage(extrasProfileId, pin.messageId))}
                    >
                      ×
                    </button>
                  </div>
                ))}
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
              const showsSticker = !message.deleted && isHanaSticker(message.sticker)
              const showsImage = !message.deleted && Boolean(message.imageUrl)
              const effectEmoji = !message.deleted && message.effect
                ? (String(message.effectEmoji || '').trim()
                  || EMOTION_MOMENTS.find((item) => item.id === message.effect)?.emoji
                  || (message.effect === 'party' ? CHAT_PARTY_REACTION : '')
                  || (message.effect === 'flower' ? defaultReaction : ''))
                : ''
              const showsEffect = Boolean(effectEmoji)
              const mutable = isOwn && canMutateOwnMessage(message)
              const sideClass = isOwn ? 'is-own' : 'is-other'
              const avatarSrc = avatarSrcForMessage(message)
              return (
                <div key={message.id} className={`hana-chat-msg-row ${sideClass}`}>
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
                        className={`${sideClass} is-${message.role}`}
                        canReply={!message.deleted}
                        canEdit={mutable && !showsSticker && !showsEffect && !showsImage}
                        canDelete={mutable}
                        canReact={!message.deleted}
                        showFlowerReact={!message.deleted && !isOwn}
                        defaultReaction={defaultReaction}
                        reactions={message.reactions || {}}
                        reactorId={reactorId}
                        copyText={message.deleted || showsImage ? '' : (message.rawText || message.text || '')}
                        onCopy={notifyCopied}
                        onReply={() => startReply(message)}
                        onEdit={() => startEdit(message)}
                        onDelete={() => handleDelete(message)}
                        onReact={(emoji, options) => { void handleReact(message, emoji, options) }}
                        onMenuAction={(actionId) => handleMenuAction(actionId, message)}
                        onEffect={handleLocalEffect}
                      >
                        <div
                          className={`hana-chat-bubble ${sideClass} is-${message.role}${message.kind === 'human-switch' || message.kind === 'intro' ? ' is-notice' : ''}${message.deleted ? ' is-deleted' : ''}${showsSticker ? ' is-sticker' : ''}${showsEffect ? ' is-effect' : ''}${showsImage ? ' is-image' : ''}${message.uploading ? ' is-uploading' : ''}`}
                        >
                          {message.replyTo ? (
                            <div className="hana-chat-quote">
                              <strong>{labelForRole(message.replyTo.sender || message.replyTo.role)}</strong>
                              <span>{message.replyTo.text}</span>
                            </div>
                          ) : null}
                          {showsSticker ? (
                            <HanaSticker id={message.sticker} size={104} title={message.text} />
                          ) : showsImage ? (
                            <button
                              type="button"
                              className="hana-chat-image-link"
                              data-no-bubble-press="true"
                              disabled={Boolean(message.uploading)}
                              aria-label="画像を拡大表示"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                if (message.uploading) return
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
                              {message.uploading ? (
                                <span className="hana-chat-image-status">送信中…</span>
                              ) : null}
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
                      {!isOwn && (timeLabel || (message.editedAt && !message.deleted)) ? (
                        <div className="hana-chat-msg-aside">
                          {timeLabel ? (
                            <time dateTime={message.createdAt || undefined}>{timeLabel}</time>
                          ) : null}
                          {message.editedAt && !message.deleted ? <span className="hana-chat-msg-edited">編集済</span> : null}
                        </div>
                      ) : null}
                    </div>
                    {actingAsOwner && !isOwn && ownerAssist[message.id] ? (
                      <OwnerMessageAssist
                        assist={ownerAssist[message.id]}
                        collapsed={ownerAssistShouldCollapse(message.id, visibleMessages)}
                        onRetry={() => { void requestOwnerAssist(message, { force: true }) }}
                        onUseReply={applyOwnerSuggest}
                      />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          <div
            className={`hana-chat-typing${partnerTyping ? ' is-visible' : ''}`}
            aria-live="polite"
            aria-hidden={!partnerTyping}
          >
            <span className="hana-chat-typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{partnerTyping ? partnerTypingLabel : ''}</span>
          </div>

          {!actingAsOwner && channel === 'ai' ? (
            <div className="hana-chat-suggest">
              <button
                type="button"
                onClick={() => switchToHuman(HUMAN_SWITCH_INTENT)}
              >
                本物のはなと話したい
              </button>
            </div>
          ) : null}

          {actingAsOwner && activeThreadId && ownerSuggestEnabled ? (
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
          {actionNote ? <p className="hana-chat-action-note" role="status">{actionNote}</p> : null}
          {error ? <p className="hana-chat-error">{error}</p> : null}

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

          {canUseReactions && stickerSuggestions.length > 0 && !editingId ? (
            <div className="hana-chat-sticker-suggestions" aria-label="入力に合うスタンプ">
              <div className="hana-chat-sticker-suggestions-head">
                <span>おすすめスタンプ</span>
                <span>{stickerSuggestions.length}件</span>
              </div>
              <div className="hana-chat-sticker-suggestions-list" role="list">
                {stickerSuggestions.map((sticker) => (
                  <button
                    key={`suggested-${sticker.id}`}
                    type="button"
                    role="listitem"
                    title={sticker.label}
                    disabled={busy}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDraft('')
                      void handleSendSticker(sticker)
                    }}
                  >
                    <HanaSticker id={sticker.id} size={76} title="" />
                    <span>{sticker.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {canUseReactions && effectThreadId ? (
            <div className="hana-chat-effect-bar" role="toolbar" aria-label="スタンプとエフェクト">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleSendImage(file)
                }}
              />
              <button
                type="button"
                className="hana-chat-image-trigger"
                title="写真を送る"
                aria-label="写真を送る"
                disabled={busy}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => imageInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5.5A4.5 4.5 0 1 1 7.5 13 4.5 4.5 0 0 1 12 8.5zm0 2A2.5 2.5 0 1 0 14.5 13 2.5 2.5 0 0 0 12 10.5z"
                  />
                </svg>
              </button>
              <div className="hana-chat-sticker" ref={stickerRef}>
                <button
                  type="button"
                  className={`hana-chat-sticker-trigger${stickerOpen ? ' is-open' : ''}`}
                  title={`${activeStickerSet.label}スタンプ`}
                  aria-label={`${activeStickerSet.label}スタンプ`}
                  aria-expanded={stickerOpen}
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setStickerOpen((prev) => !prev)}
                >
                  <HanaSticker id={activeStickerSet.items[0].id} size={26} title="" />
                </button>
                {stickerOpen ? (
                  <div className="hana-chat-sticker-panel" role="menu" aria-label="スタンプ">
                    <div className="hana-chat-sticker-panel-head">
                      <strong>スタンプ</strong>
                      <button type="button" onClick={() => setStickerOpen(false)} aria-label="閉じる">×</button>
                    </div>
                    <div className="hana-chat-sticker-tabs" role="tablist" aria-label="スタンプの種類">
                      {HANA_STICKER_SETS.map((set) => (
                        <button
                          key={set.id}
                          type="button"
                          role="tab"
                          aria-selected={set.id === activeStickerSet.id}
                          className={`hana-chat-sticker-tab${set.id === activeStickerSet.id ? ' is-active' : ''}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setStickerSetId(set.id)
                            writeStickerSet(set.id, { asOwner: actingAsOwner })
                          }}
                        >
                          <HanaSticker id={set.items[0].id} size={20} title="" />
                          <span>{set.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="hana-chat-sticker-grid">
                      {activeStickerSet.items.map((sticker) => (
                        <button
                          key={sticker.id}
                          type="button"
                          role="menuitem"
                          className="hana-chat-sticker-item"
                          title={sticker.label}
                          disabled={busy}
                          onMouseDown={(event) => event.preventDefault()}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => { void handleSendSticker(sticker) }}
                        >
                          <HanaSticker id={sticker.id} size={54} title="" />
                          <span>{sticker.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="hana-chat-effect-bar-items">
                <button
                  type="button"
                  className="hana-chat-effect-shortcut is-flower"
                  title="花びら"
                  aria-label="花びら"
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => { void playStandaloneEffect({ kind: 'flower', emoji: defaultReaction }) }}
                >
                  {defaultReaction}
                </button>
                <button
                  type="button"
                  className="hana-chat-effect-shortcut is-party"
                  title="パーティー"
                  aria-label="パーティー"
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => { void playStandaloneEffect({ kind: 'party', emoji: CHAT_PARTY_REACTION }) }}
                >
                  {CHAT_PARTY_REACTION}
                </button>
                {EMOTION_MOMENTS.map((moment) => (
                  <button
                    key={moment.id}
                    type="button"
                    className={`hana-chat-effect-shortcut is-${moment.theme}`}
                    title={moment.label}
                    aria-label={moment.label}
                    disabled={busy}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => { void playStandaloneEffect({ kind: 'moment', momentId: moment.id }) }}
                  >
                    {moment.emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
              onChange={(event) => {
                setDraft(event.target.value)
                resizeComposer()
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                // Phones/tablets: leave Enter as newline (send via the button).
                if (!desktopKeyboard) return
                // IME composition (Japanese etc.): let Enter confirm the candidate.
                if (event.isComposing || event.keyCode === 229) return

                const sendWithModifier = event.shiftKey || event.ctrlKey || event.metaKey
                const shouldSend = enterToSend
                  ? !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
                  : sendWithModifier

                if (!shouldSend) return
                event.preventDefault()
                if (!busy && draft.trim()) {
                  event.currentTarget.form?.requestSubmit?.()
                }
              }}
              onFocus={() => {
                keyboardPinnedRef.current = true
                syncPanelViewportRef.current({ forceKeyboard: true, revealComposer: true, immediate: true })
                window.setTimeout(() => {
                  syncPanelViewportRef.current({ forceKeyboard: true, force: true, revealComposer: true })
                }, 120)
                window.setTimeout(() => {
                  syncPanelViewportRef.current({ forceKeyboard: true, force: true, revealComposer: true })
                }, 360)
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!open) return
                  if (document.activeElement === inputRef.current) return
                  // After send, reclaim focus so the soft keyboard stays open.
                  if (retainComposerFocusRef.current) {
                    try {
                      inputRef.current?.focus({ preventScroll: true })
                    } catch {
                      inputRef.current?.focus()
                    }
                    return
                  }
                  keyboardPinnedRef.current = false
                  syncPanelViewportRef.current({ immediate: true })
                }, 0)
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
              disabled={actingAsOwner && !activeThreadId}
              autoComplete="off"
              enterKeyHint={enterSendsMessage ? 'send' : 'enter'}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
            >
              {busy ? '…' : editingId ? '更新' : '送る'}
            </button>
          </form>
        </section>
      ) : null}
      {previewImage ? (
        <ChatImageLightbox
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
