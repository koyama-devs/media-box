import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { setAppUnreadBadge } from './appBadge'
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
import ChatNatsuFireworks from './ChatNatsuFireworks'
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
    applyReactionLocally,
    broadcastChatEffect,
    CHAT_PRESENCE_MODES,
    CHAT_REACTION_EMOJIS,
    chatWithHanachan,
    DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES,
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
    messageEditWindowMsFromMinutes,
    migrateLegacyGuestThread,
    normalizeChatPresenceMode,
    OWNER_PROFILE,
    pulseChatPresence,
    resolveAvatarSrc,
    resolveChatPresence,
    resolveGuestDisplayName,
    resolveGuestThreadWithHistory,
    resolveSessionProfile,
    sendChatMessage,
    setChatPresenceStatus,
    setChatProfileStatus,
    setChatTyping,
    sortChatMessages,
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
    uploadChatAttachment,
    getChatMessageAttachment,
    formatChatFileSize,
    classifyChatAttachment,
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
import NatsuKingyo from './NatsuKingyo'
import OwnerMessageAssist, {
    collectUnansweredOwnerAssistMessages,
    ownerAssistShouldCollapse,
} from './OwnerMessageAssist'
import { bindForegroundPush, ensureWebPush } from './webPush'

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
  if (message.sticker || message.imageUrl || message.fileUrl || message.effect) return false
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

/** Phone/tablet: LINE-style sticker dock (not floating popover). */
function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 640px), (pointer: coarse)').matches
  })
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px), (pointer: coarse)')
    const sync = () => setNarrow(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return narrow
}

/** Keep optimistic (pending) bubbles until the matching Firestore message arrives. */
let chatSendSeq = 0

function nextChatPendingId(kind = 'msg') {
  chatSendSeq += 1
  return `pending-${kind}-${Date.now()}-${chatSendSeq}`
}

function nextStickerPendingId() {
  return nextChatPendingId('sticker')
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
    const itemClientId = String(item.clientId || item.id || '')
    const itemServerId = String(item.serverId || '')
    const pendingTs = Date.parse(item.createdAtIso || item.createdAt || '') || 0
    const match = server.find((row) => {
      if (usedServerIds.has(row.id)) return false
      if (itemServerId && row.id === itemServerId) return true
      if (itemClientId && row.clientId && row.clientId === itemClientId) return true
      // Pending sends always carry clientId — never content-match (that drops the
      // optimistic bubble against an older same-text message before the new doc
      // appears in the snapshot, which looks like a "missing last message").
      if (itemServerId || itemClientId) return false
      if ((row.sender || row.role) !== (item.sender || item.role)) return false
      if (String(row.text || '') !== String(item.text || '')) return false
      if (String(row.sticker || '') !== String(item.sticker || '')) return false
      if (String(row.effect || '') !== String(item.effect || '')) return false
      if (Boolean(row.imageUrl) !== Boolean(item.imageUrl)) return false
      if (Boolean(row.fileUrl) !== Boolean(item.fileUrl)) return false
      if (String(row.fileKind || '') !== String(item.fileKind || '')) return false
      if (pendingTs) {
        const rowTs = Date.parse(row.createdAtIso || row.createdAt || '') || 0
        if (rowTs && Math.abs(rowTs - pendingTs) > 90_000) return false
      }
      return true
    })
    if (match) usedServerIds.add(match.id)
    else kept.push(item)
  }
  return sortChatMessages(kept.length ? [...server, ...kept] : server)
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
  /** True after first Firestore snapshot for the open human thread. */
  const [messagesHydrated, setMessagesHydrated] = useState(false)
  /** Summer décor waits until messages have painted. */
  const [showSummerFx, setShowSummerFx] = useState(false)
  const [threads, setThreads] = useState([])
  const [ownThread, setOwnThread] = useState(null)
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [chatProfiles, setChatProfiles] = useState({})
  const [ownerSuggestions, setOwnerSuggestions] = useState({ replies: [], topics: [], expressions: [] })
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [suggestPickerGroup, setSuggestPickerGroup] = useState(null) // 'reply' | 'topic' | 'expr' | null
  const [ownerSuggestEnabled, setOwnerSuggestEnabled] = useState(() => readOwnerSuggestEnabled())
  const [guestMenuOpen, setGuestMenuOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [stickerSetId, setStickerSetId] = useState(() => readStickerSet({ asOwner: appRole === 'owner' }))
  const activeStickerSet = HANA_STICKER_SETS.find((set) => set.id === stickerSetId) || HANA_STICKER_SETS[0]
  const stickerSuggestions = useMemo(() => suggestHanaStickers(draft, 12), [draft])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultReaction, setDefaultReaction] = useState(() => readDefaultReaction())
  const [enterToSend, setEnterToSend] = useState(() => readEnterToSend())
  const desktopKeyboard = useDesktopKeyboard()
  const narrowScreen = useNarrowScreen()
  // Soft-keyboard phones/tablets keep Enter = newline; the toggle is desktop-only.
  const enterSendsMessage = desktopKeyboard && enterToSend
  const [messageSound, setMessageSound] = useState(() => readMessageSound())
  const [notifyPermission, setNotifyPermission] = useState(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ))
  const [incomingBanner, setIncomingBanner] = useState(null)
  const incomingBannerTimerRef = useRef(null)
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
  const headerRef = useRef(null)
  const inputRef = useRef(null)
  const composerRef = useRef(null)
  const guestMenuRef = useRef(null)
  const stickerRef = useRef(null)
  const stickerTriggerRef = useRef(null)
  const imageInputRef = useRef(null)
  const settingsRef = useRef(null)
  const callButtonsHostRef = useRef(null)
  const [callButtonsHost, setCallButtonsHost] = useState(null)
  const syncPanelViewportRef = useRef(() => {})
  const resetPanelViewportInlineRef = useRef(() => {})
  const scrollToLatestRef = useRef(() => {})
  const viewportApplyRef = useRef({ top: 0, height: 0, width: 0, keyboard: false })
  const viewportDebounceRef = useRef(null)
  const keyboardPinnedRef = useRef(false)
  const keyboardHeightRef = useRef(280)
  /** Full-screen layout height (no keyboard). */
  const baselineLayoutRef = useRef(0)
  /** Half-screen dock height for the sticker tray. */
  const stableChromeHRef = useRef(0)
  /**
   * Sticker dock bottom strip (px). 0 = idle or keyboard mode.
   * Composer always sits directly above this strip (or above the soft keyboard).
   */
  const [bottomChromePx, setBottomChromePx] = useState(0)
  const bottomChromePxRef = useRef(0)
  bottomChromePxRef.current = bottomChromePx
  /** Phone width: bottom half sticker dock (not the floating popover). */
  const stickerDockMode = narrowScreen
  const stickerDockOpenRef = useRef(false)
  /** Freeze dock chrome after first open so keyboard overlay never resizes layout. */
  const lockedDockChromeRef = useRef(0)
  /** Icon blur must not close dock — only 完了 / outside tap should. */
  const skipDockCloseOnNextBlurRef = useRef(false)
  stickerDockOpenRef.current = Boolean(stickerOpen && stickerDockMode)
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
  /** Keep last snapshot per thread so open/switch never flashes an empty list. */
  const messageCacheRef = useRef(new Map())
  /** Ids removed locally while Firestore delete is in flight (blocks snapshot revive). */
  const deletingIdsRef = useRef(new Set())
  const [editWindowMs, setEditWindowMs] = useState(() => (
    messageEditWindowMsFromMinutes(DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES)
  ))

  const showThreadMessages = useCallback((threadId, relatedIds = []) => {
    if (!threadId) {
      setHanaMessages([])
      return
    }
    const ids = [threadId, ...relatedIds].filter(Boolean)
    for (const id of ids) {
      const cached = messageCacheRef.current.get(id)
      if (Array.isArray(cached) && cached.length > 0) {
        // Alias cache under the thread we are about to open so subscribe merges cleanly.
        messageCacheRef.current.set(threadId, cached)
        setHanaMessages(cached)
        return
      }
    }
    const cached = messageCacheRef.current.get(threadId)
    setHanaMessages(Array.isArray(cached) ? cached : [])
  }, [])

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
    const knownProfiles = (chatAccounts.length ? chatAccounts : listGuestProfiles())
      .filter((profile) => profile.accountActive !== false)
    const known = knownProfiles.map((profile) => {
      const canonicalId = `guest-${profile.key}`
      const matches = threads.filter((t) => (
        t.id === canonicalId
        || t.guestKey === profile.key
        || t.guestLabel === profile.displayName
        || String(t.guestLabel || '').trim() === String(profile.addressAs || '').trim()
      ))
      const thread = [...matches].sort((a, b) => {
        const score = (entry) => {
          const hasText = String(entry.lastText || '').trim() ? 40 : 0
          // Prefer a keyed non-canonical thread over an empty guest-{key} shell.
          const legacyHint = entry.guestKey === profile.key && entry.id !== canonicalId
            && String(entry.lastText || '').trim()
            ? 12
            : (entry.guestKey === profile.key && entry.id !== canonicalId ? 6 : 0)
          const canonHit = entry.id === canonicalId ? 2 : 0
          const keyHit = entry.guestKey === profile.key ? 1 : 0
          return hasText + legacyHint + canonHit + keyHit
        }
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
      .filter((entry) => {
        if (/^ゲスト/.test(String(entry.label || '').trim())) return false
        const key = String(entry.guestKey || '').trim().toLowerCase()
        if (!key) return true
        const account = (chatAccounts.length ? chatAccounts : listGuestProfiles())
          .find((profile) => profile.key === key)
        return !account || account.accountActive !== false
      })
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

  const callListenThreadIds = useMemo(() => {
    if (actingAsOwner) {
      const ids = new Set()
      // All live threads — not only the active roster — so a guest call still rings
      // even if the profile was filtered out of the combobox.
      threads.forEach((thread) => {
        if (thread?.id) ids.add(thread.id)
      })
      ownerGuestRoster.forEach((entry) => {
        ;[entry.threadId, entry.canonicalId, entry.thread?.id].filter(Boolean).forEach((id) => ids.add(id))
      })
      return [...ids]
    }
    // Guest: always watch the human thread so Hana's call rings even on AI channel.
    return guestChatId ? [guestChatId] : []
  }, [actingAsOwner, threads, ownerGuestRoster, guestChatId])

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

  useEffect(() => {
    if (hidden) {
      setAppUnreadBadge(0)
      return
    }
    setAppUnreadBadge(unreadLauncher)
  }, [hidden, unreadLauncher])

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

  const dismissIncomingBanner = useCallback(() => {
    if (incomingBannerTimerRef.current) {
      window.clearTimeout(incomingBannerTimerRef.current)
      incomingBannerTimerRef.current = null
    }
    setIncomingBanner(null)
  }, [])

  const notifyIncomingMessage = useCallback((payload = {}) => {
    const title = String(payload.title || '').trim() || '新しいメッセージ'
    const body = String(payload.body || '').trim() || 'メッセージが届きました'
    const threadId = String(payload.threadId || '').trim()
    const showBanner = payload.showBanner !== false

    if (messageSound) playChatNotifySound()

    if (!showBanner) return
    // Skip banner when already looking at that conversation.
    if (open && (!threadId || threadId === activeThreadId)) return

    setIncomingBanner({ title, body, threadId })
    if (incomingBannerTimerRef.current) window.clearTimeout(incomingBannerTimerRef.current)
    incomingBannerTimerRef.current = window.setTimeout(() => {
      setIncomingBanner(null)
      incomingBannerTimerRef.current = null
    }, 6500)
  }, [activeThreadId, messageSound, open])
  useEffect(() => {
    if (hidden) return undefined
    bindForegroundPush()
    const onPush = (event) => {
      const detail = event?.detail || {}
      if (detail.type && detail.type !== 'chat') return
      notifyIncomingMessage({
        title: detail.title,
        body: detail.body,
        threadId: detail.threadId,
      })
    }
    window.addEventListener('hana-chat-push', onPush)
    return () => window.removeEventListener('hana-chat-push', onPush)
  }, [hidden, notifyIncomingMessage])


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
    // Wait until roster has entries — an empty interim list used to clear
    // the open thread and wipe the bubble list (looked like "no messages").
    if (!ownerGuestRoster.length) return

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

    if (activeThreadId !== threadId) {
      showThreadMessages(threadId, [canonicalId, entry?.thread?.id].filter(Boolean))
      setMessagesHydrated(false)
      setActiveThreadId(threadId)
    } else if (!activeThreadId) {
      setActiveThreadId(threadId)
    }

    void ensureChatThread({
      threadId: canonicalId,
      guestLabel: label,
      guestKey: guestKeyForThread,
    }).catch(() => {})
  }, [hidden, actingAsOwner, activeThreadId, ownerGuestRoster, showThreadMessages])

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
    if (newestId) {
        const thread = threads.find((item) => item.id === newestId)
        const entry = ownerGuestRoster.find((item) => (
          item.threadId === newestId
          || item.canonicalId === newestId
          || item.thread?.id === newestId
        ))
        notifyIncomingMessage({
          title: entry?.label || thread?.guestLabel || 'ゲスト',
          body: String(thread?.lastText || '').trim() || '新しいメッセージ',
          threadId: newestId,
        })
      }
    if (!open || !newestId || newestId === activeThreadId) return

    const entry = ownerGuestRoster.find((item) => (
      item.threadId === newestId || item.canonicalId === newestId || item.thread?.id === newestId
    ))
    if (!entry) return
    setReplyTo(null)
    setEditingId(null)
    showThreadMessages(entry.threadId, [entry.canonicalId, entry.thread?.id, newestId].filter(Boolean))
    setMessagesHydrated(false)
    setActiveThreadId(entry.threadId)
  }, [hidden, actingAsOwner, open, threads, activeThreadId, ownerGuestRoster, notifyIncomingMessage, showThreadMessages])

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
    if (grew) {
      notifyIncomingMessage({
        title: 'はな',
        body: String(ownThread?.lastText || '').trim() || '新しいメッセージ',
        threadId: ownThread?.id || guestChatId || '',
      })
    }
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

  // Messages first: reset summer FX whenever the open conversation changes.
  useEffect(() => {
    if (!open) {
      setMessagesHydrated(false)
      setShowSummerFx(false)
      return undefined
    }
    if (!actingAsOwner && channel === 'ai') {
      setMessagesHydrated(true)
      return undefined
    }
    setMessagesHydrated(false)
    setShowSummerFx(false)
    return undefined
  }, [open, actingAsOwner, channel, activeThreadId, guestChatId, guestOnHuman])

  // Only start chat summer décor after messages are hydrated and the list has painted.
  useEffect(() => {
    if (!open || !messagesHydrated) {
      setShowSummerFx(false)
      return undefined
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      const enable = () => {
        if (cancelled) return
        setShowSummerFx(true)
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(enable, { timeout: 900 })
          } else {
            enable()
          }
        })
      })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, messagesHydrated])

  useEffect(() => {
    if (hidden || actingAsOwner || !guestChatId) {
      return undefined
    }
    if (!guestOnHuman) return undefined
    const unsub = subscribeChatMessages(
      guestChatId,
      (next) => {
        const filtered = next.filter((m) => !deletingIdsRef.current.has(m.id))
        messageCacheRef.current.set(guestChatId, filtered)
        setHanaMessages((prev) => mergeServerMessagesWithPending(filtered, prev))
        setMessagesHydrated(true)
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
        const filtered = next.filter((m) => !deletingIdsRef.current.has(m.id))
        messageCacheRef.current.set(activeThreadId, filtered)
        setHanaMessages((prev) => mergeServerMessagesWithPending(filtered, prev))
        setMessagesHydrated(true)
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
      const ok = Boolean(data.translationVi || data.readingHiragana)
      setOwnerAssist((prev) => ({
        ...prev,
        [message.id]: {
          status: ok ? 'ready' : 'error',
          translationVi: data.translationVi || '',
          readingHiragana: data.readingHiragana || '',
          replies: [],
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
        max: 3,
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
    if (!open) {
      setCallButtonsHost(null)
      return undefined
    }
    setCallButtonsHost(callButtonsHostRef.current)
    return undefined
  }, [open, actingAsOwner, activeThreadId, guestOnHuman, channel])

  useEffect(() => {
    if (open) document.documentElement.dataset.hanaChatOpen = '1'
    else delete document.documentElement.dataset.hanaChatOpen
    return () => { delete document.documentElement.dataset.hanaChatOpen }
  }, [open])

  const [partnerTyping, setPartnerTyping] = useState(false)
  useEffect(() => {
    if (!open || (!actingAsOwner && !guestOnHuman)) {
      setPartnerTyping(false)
      return undefined
    }
    const value = actingAsOwner
      ? activeThreadMeta?.guestTypingAt
      : activeThreadMeta?.hanaTypingAt
    const at = Date.parse(String(value || ''))
    if (!Number.isFinite(at)) {
      setPartnerTyping(false)
      return undefined
    }
    const remaining = TYPING_VISIBLE_MS - (Date.now() - at)
    if (remaining <= 0) {
      setPartnerTyping(false)
      return undefined
    }
    setPartnerTyping(true)
    const timer = window.setTimeout(() => setPartnerTyping(false), remaining)
    return () => window.clearTimeout(timer)
  }, [open, actingAsOwner, guestOnHuman, activeThreadMeta?.guestTypingAt, activeThreadMeta?.hanaTypingAt])


  const partnerTypingLabel = actingAsOwner
    ? `${ownerActiveGuestLabel}が入力中`
    : 'はなが入力中'

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
    if (actingAsOwner) {
      if (!activeThreadId) {
        return resolveChatPresence({})
      }
      return resolveChatPresence({
        onlineAt: activeThreadMeta?.guestOnlineAt,
        status: chatProfiles[ownerActiveGuestKey]?.status || activeThreadMeta?.guestStatus,
      }, Date.now())
    }
    if (channel === 'ai') {
      return resolveChatPresence({
        onlineAt: new Date().toISOString(),
        status: 'auto',
      }, Date.now())
    }
    return resolveChatPresence({
      onlineAt: activeThreadMeta?.hanaOnlineAt,
      status: chatProfiles[OWNER_PROFILE.key]?.status || activeThreadMeta?.hanaStatus,
    }, Date.now())
  }, [actingAsOwner, channel, activeThreadMeta, activeThreadId, chatProfiles, ownerActiveGuestKey])

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
      onlineAt: new Date().toISOString(),
      status: myPresenceMode,
    }, Date.now())
  }, [open, myPresenceMode])

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

    const clearInline = () => {
      panel.style.left = ''
      panel.style.right = ''
      panel.style.top = ''
      panel.style.bottom = ''
      panel.style.width = ''
      panel.style.height = ''
      panel.style.maxHeight = ''
      panel.style.minHeight = ''
      panel.style.paddingBottom = ''
      panel.style.removeProperty('--hana-vv-top')
      panel.classList.remove('is-keyboard')
      const header = headerRef.current
      if (header) {
        header.style.removeProperty('top')
        header.style.removeProperty('transform')
      }
      const root = panel.closest('.hana-chat')
      if (root) {
        root.style.removeProperty('height')
        root.style.removeProperty('max-height')
        root.style.removeProperty('min-height')
        root.style.removeProperty('top')
        root.style.removeProperty('bottom')
      }
      keyboardPinnedRef.current = false
      viewportApplyRef.current = { top: 0, height: 0, width: 0, keyboard: false }
    }
    resetPanelViewportInlineRef.current = clearInline

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

    const getFullLayoutH = () => {
      const inner = window.innerHeight || document.documentElement.clientHeight || 0
      const vv = window.visualViewport
      let fromVv = 0
      if (vv) {
        const inset = Math.max(0, inner - vv.height - (vv.offsetTop || 0))
        fromVv = Math.round(vv.height + inset)
      }
      return Math.max(baselineLayoutRef.current || 0, inner, fromVv)
    }

    const lockShellHeight = () => {
      const root = panel.closest('.hana-chat')
      if (!root) return
      const h = Math.max(
        baselineLayoutRef.current || 0,
        window.innerHeight || 0,
        Math.round(window.visualViewport?.height || 0),
      )
      if (h > 0) baselineLayoutRef.current = Math.max(baselineLayoutRef.current || 0, h)
      const locked = baselineLayoutRef.current || h
      root.style.setProperty('height', `${locked}px`, 'important')
      root.style.setProperty('max-height', `${locked}px`, 'important')
      root.style.setProperty('min-height', `${locked}px`, 'important')
      root.style.setProperty('top', '0px', 'important')
      root.style.setProperty('bottom', 'auto', 'important')
    }

    /**
     * Nail the header to the visible screen top.
     * While typing, match visualViewport.offsetTop so iOS shift does not hide it.
     * When idle, always force top:0 (完了 must not leave a huge offset).
     */
    const pinHeaderFixed = (options = {}) => {
      const header = headerRef.current
      if (!header) return
      const vv = window.visualViewport
      const inputFocused = document.activeElement === inputRef.current
      const forceZero = options.forceZero || (!inputFocused && !keyboardPinnedRef.current)
      const y = forceZero ? 0 : (vv ? Math.round(vv.offsetTop || 0) : 0)
      header.style.setProperty('position', 'fixed', 'important')
      header.style.setProperty('top', `${y}px`, 'important')
      header.style.setProperty('left', '0px', 'important')
      header.style.setProperty('right', '0px', 'important')
      header.style.setProperty('width', '100%', 'important')
      header.style.setProperty('transform', 'translateZ(0)', 'important')
      header.style.setProperty('transition', 'none', 'important')
      header.style.setProperty('z-index', '10100', 'important')
    }

    const setDockChrome = (px) => {
      const chrome = Math.max(0, Math.round(px) || 0)
      if (bottomChromePxRef.current !== chrome) {
        flushSync(() => setBottomChromePx(chrome))
      }
      if (chrome > 0) {
        panel.style.setProperty('--hana-bottom-chrome-h', `${chrome}px`)
        panel.style.setProperty('--hana-sticker-dock-h', `${chrome}px`)
      } else {
        panel.style.removeProperty('--hana-bottom-chrome-h')
        panel.style.removeProperty('--hana-sticker-dock-h')
      }
    }

    const pinMessagesToLatest = () => {
      const list = listRef.current
      if (!list) return
      list.scrollTop = list.scrollHeight
    }

    /** Idle / after 完了: full-screen panel, composer visible at the bottom. */
    const restoreIdleLayout = () => {
      const fullH = Math.max(baselineLayoutRef.current || 0, getFullLayoutH())
      if (fullH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = fullH
      setDockChrome(0)
      lockShellHeight()
      keyboardPinnedRef.current = false
      panel.style.left = '0px'
      panel.style.right = 'auto'
      panel.style.width = '100%'
      panel.style.top = '0px'
      panel.style.bottom = 'auto'
      panel.style.minHeight = '0px'
      panel.style.height = `${fullH}px`
      panel.style.maxHeight = `${fullH}px`
      panel.style.paddingBottom = ''
      panel.style.removeProperty('--hana-vv-top')
      panel.classList.remove('is-keyboard')
      viewportApplyRef.current = { top: 0, height: fullH, width: 0, keyboard: false }
      pinHeaderFixed({ forceZero: true })
      if (window.scrollY) window.scrollTo(0, 0)
      pinMessagesToLatest()
      window.requestAnimationFrame(pinMessagesToLatest)
    }

    /**
     * Sticker dock mid-slot.
     * Keep a fixed full-screen panel + locked bottom chrome.
     * Soft keyboard is an overlay — never shrink this layout to visualViewport.
     */
    const applyStickerDock = () => {
      const layoutH = Math.max(
        baselineLayoutRef.current || 0,
        window.innerHeight || 0,
        getFullLayoutH(),
      )
      if (layoutH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = layoutH

      const boxH = layoutH
      // Prefer remembered real IME height; else ~52% screen (typical phone IME).
      const rememberedKb = Math.max(0, Math.round(keyboardHeightRef.current || 0))
      const preferred = Math.max(
        200,
        Math.round(layoutH * 0.46),
        rememberedKb > 120 ? Math.min(rememberedKb, Math.round(layoutH * 0.48)) : 0,
      )
      const chrome = lockedDockChromeRef.current > 0
        ? lockedDockChromeRef.current
        : preferred
      lockedDockChromeRef.current = chrome
      stableChromeHRef.current = chrome

      setDockChrome(chrome)
      lockShellHeight()
      pinHeaderFixed({ forceZero: true })
      panel.style.left = '0px'
      panel.style.right = 'auto'
      panel.style.width = '100%'
      panel.style.top = '0px'
      panel.style.bottom = 'auto'
      panel.style.minHeight = '0px'
      panel.style.height = `${boxH}px`
      panel.style.maxHeight = `${boxH}px`
      panel.style.paddingBottom = '0px'
      panel.style.removeProperty('--hana-vv-top')
      panel.classList.remove('is-keyboard')
      keyboardPinnedRef.current = false
      viewportApplyRef.current = { top: 0, height: boxH, width: chrome, keyboard: false }
      if (window.scrollY) window.scrollTo(0, 0)
      pinMessagesToLatest()
      window.requestAnimationFrame(pinMessagesToLatest)
    }

    /**
     * Typing / IME: shrink panel from layout top (top stays 0).
     * Height is clamped to the layout screen so 完了 cannot leave a panel taller
     * than the screen (composer buried below the fold).
     */
    const applyVisualKeyboardPin = () => {
      // Sticker dock wins — never pin-to-keyboard over an open dock.
      if (stickerDockOpenRef.current) {
        applyStickerDock()
        return
      }
      const vv = window.visualViewport
      const inner = window.innerHeight || document.documentElement.clientHeight || 0
      const layoutH = Math.max(baselineLayoutRef.current || 0, getFullLayoutH())
      const vvTop = vv ? Math.round(vv.offsetTop || 0) : 0
      const vvH = vv ? Math.max(1, Math.round(vv.height)) : inner
      // Clamp: during IME dismiss, offsetTop can linger while height grows,
      // and offsetTop+vvH would exceed the screen → composer vanishes below.
      const pinH = Math.max(1, Math.min(layoutH, vvH))
      lockShellHeight()
      pinHeaderFixed()
      const prev = viewportApplyRef.current
      if (
        prev.keyboard
        && prev.top === 0
        && prev.height === pinH
        && bottomChromePxRef.current === 0
      ) {
        pinMessagesToLatest()
        return
      }
      setDockChrome(0)
      panel.style.left = '0px'
      panel.style.right = 'auto'
      panel.style.width = '100%'
      panel.style.top = '0px'
      panel.style.bottom = 'auto'
      panel.style.minHeight = '0px'
      panel.style.height = `${pinH}px`
      panel.style.maxHeight = `${pinH}px`
      panel.style.paddingBottom = '0px'
      panel.style.removeProperty('--hana-vv-top')
      panel.classList.add('is-keyboard')
      keyboardPinnedRef.current = true
      keyboardHeightRef.current = Math.max(0, layoutH - pinH)
      viewportApplyRef.current = { top: 0, height: pinH, width: 0, keyboard: true }
      if (window.scrollY) window.scrollTo(0, 0)
      pinMessagesToLatest()
      window.requestAnimationFrame(pinMessagesToLatest)
    }

    const halfChromePx = () => {
      const fullH = Math.max(baselineLayoutRef.current || 0, getFullLayoutH())
      return Math.round(fullH * 0.5)
    }

    let keyboardLatched = false
    const applyMobileViewport = () => {
      if (!window.matchMedia('(max-width: 640px), (pointer: coarse)').matches) {
        setDockChrome(0)
        clearInline()
        lockPageScroll(false)
        keyboardLatched = false
        return
      }

      lockPageScroll(true)
      lockShellHeight()

      const inner = window.innerHeight || document.documentElement.clientHeight || 0
      const vv = window.visualViewport
      const vvInset = vv
        ? Math.max(0, Math.max(inner, baselineLayoutRef.current || 0) - vv.height - (vv.offsetTop || 0))
        : Math.max(0, (baselineLayoutRef.current || 0) - inner)
      const inputFocused = document.activeElement === inputRef.current

      if (!keyboardLatched && vvInset > 100) keyboardLatched = true
      if (keyboardLatched && (vvInset < 40 || (!inputFocused && vvInset < 120))) {
        keyboardLatched = false
      }
      // Sticker dock owns the bottom half — never keep IME latch fighting it.
      if (stickerDockOpenRef.current) keyboardLatched = false
      const keyboardOpen = keyboardLatched

      if (!stickerDockOpenRef.current && !inputFocused && !keyboardOpen) {
        baselineLayoutRef.current = Math.max(baselineLayoutRef.current || 0, inner)
      } else if (vvInset > 0 && inputFocused && !stickerDockOpenRef.current) {
        const fullH = Math.max(baselineLayoutRef.current || 0, inner + Math.round(vvInset))
        if (fullH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = fullH
      }

      if (stickerDockOpenRef.current) {
        applyStickerDock()
        return
      }

      // Mobile dock mode: while the composer is focused, always keep the
      // fixed dock geometry. Never pin-shrink the panel to visualViewport
      // (that buries the composer on the 2nd open after dismiss).
      if (stickerDockMode && inputFocused) {
        stickerDockOpenRef.current = true
        applyStickerDock()
        return
      }

      if (inputFocused || keyboardOpen) {
        applyVisualKeyboardPin()
        return
      }

      restoreIdleLayout()
    }

    const syncMobileViewport = (options = {}) => {
      const runNow = () => {
        if (viewportDebounceRef.current) {
          window.cancelAnimationFrame(viewportDebounceRef.current)
          viewportDebounceRef.current = null
        }
        applyMobileViewport()
      }
      if (options.immediate || options.force || options.forceKeyboard) {
        runNow()
        return
      }
      if (viewportDebounceRef.current) return
      viewportDebounceRef.current = window.requestAnimationFrame(() => {
        viewportDebounceRef.current = null
        applyMobileViewport()
      })
    }

    if (!baselineLayoutRef.current) {
      baselineLayoutRef.current = window.innerHeight || document.documentElement.clientHeight || 0
    }
    lockShellHeight()
    pinHeaderFixed()
    syncMobileViewport({ immediate: true })
    syncPanelViewportRef.current = syncMobileViewport
    const vv = window.visualViewport
    // Header must track vv.offsetTop with zero delay (not via rAF), or it
    // visibly flies up then snaps back when the keyboard opens on iOS.
    vv?.addEventListener('resize', pinHeaderFixed)
    vv?.addEventListener('scroll', pinHeaderFixed)
    vv?.addEventListener('resize', syncMobileViewport)
    vv?.addEventListener('scroll', syncMobileViewport)
    window.addEventListener('resize', syncMobileViewport)
    window.addEventListener('orientationchange', syncMobileViewport)
    return () => {
      resetPanelViewportInlineRef.current = () => {}
      syncPanelViewportRef.current = () => {}
      if (viewportDebounceRef.current) {
        window.cancelAnimationFrame(viewportDebounceRef.current)
        viewportDebounceRef.current = null
      }
      vv?.removeEventListener('resize', pinHeaderFixed)
      vv?.removeEventListener('scroll', pinHeaderFixed)
      vv?.removeEventListener('resize', syncMobileViewport)
      vv?.removeEventListener('scroll', syncMobileViewport)
      window.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('orientationchange', syncMobileViewport)
      clearInline()
      lockPageScroll(false)
    }
  }, [hidden, open, stickerDockMode])

  useEffect(() => {
    if (!open || (!editingId && !replyTo)) return undefined
    const id = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
      syncPanelViewportRef.current({ immediate: true, force: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, editingId, replyTo])

  const openChat = () => {
    setOpen(true)
  }

  const closeChat = () => {
    // Clear mobile/fullscreen inline viewport styles immediately so the
    // launcher returns to its anchored floating position on this same tick.
    resetPanelViewportInlineRef.current()
    lockedDockChromeRef.current = 0
    skipDockCloseOnNextBlurRef.current = false
    setOpen(false)
    setSuggestPickerGroup(null)
    setGuestMenuOpen(false)
    setBottomChromePx(0)
    setStickerOpen(false)
    setComposerFocused(false)
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
        serverId: m.serverId || '',
        clientId: m.clientId || '',
        role: m.sender === 'hana' ? 'hana' : (m.role || 'guest'),
        text: m.text,
        rawText: m.rawText,
        sticker: m.sticker || '',
        effect: m.effect || '',
        effectEmoji: m.effectEmoji || '',
        imageUrl: m.imageUrl || '',
        fileUrl: m.fileUrl || '',
        fileName: m.fileName || '',
        fileMime: m.fileMime || '',
        fileKind: m.fileKind || '',
        fileSize: m.fileSize || 0,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deleted: m.deleted,
        replyTo: m.replyTo,
        sender: m.sender || m.role,
        reactions: m.reactions || {},
        pending: Boolean(m.pending),
        uploading: Boolean(m.uploading),
        kind: m.kind || '',
        callLog: m.callLog || null,
      }))
    : aiMessages

  const ownerAssistCollapseById = useMemo(() => {
    const map = Object.create(null)
    if (!actingAsOwner) return map
    for (const message of visibleMessages) {
      if (ownerAssist[message.id]) {
        map[message.id] = ownerAssistShouldCollapse(message.id, visibleMessages)
      }
    }
    return map
  }, [actingAsOwner, visibleMessages, ownerAssist])

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

  const togglePushNotifications = () => {
    if (typeof Notification === 'undefined' || window.__HANA_CAPACITOR__) return
    const pushKey = sessionProfile?.key || (actingAsOwner ? 'hana' : '')
    if (!pushKey) return
    if (Notification.permission === 'granted') {
      void ensureWebPush(pushKey)
      setNotifyPermission('granted')
      return
    }
    if (Notification.permission === 'denied') {
      setNotifyPermission('denied')
      return
    }
    void ensureWebPush(pushKey, { requestPermission: true }).then(() => {
      setNotifyPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    })
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
    stickerDockOpenRef.current = false
    lockedDockChromeRef.current = 0
    skipDockCloseOnNextBlurRef.current = false
    setStickerOpen(false)
    setComposerFocused(false)
    setBottomChromePx(0)
    setSettingsOpen(false)
  }, [activeThreadId, open])

  useEffect(() => {
    if (!guestMenuOpen && !settingsOpen && !stickerOpen) return undefined
    const onPointerDown = (event) => {
      if (guestMenuOpen && !guestMenuRef.current?.contains(event.target)) {
        setGuestMenuOpen(false)
      }
      if (stickerOpen) {
        const inPanel = stickerRef.current?.contains(event.target)
        const inTrigger = stickerTriggerRef.current?.contains(event.target)
        const inComposer = composerRef.current?.contains(event.target)
        if (!inPanel && !inTrigger && !inComposer) {
          // Dismiss IME first so viewport sync restores idle (not keyboard-pin).
          skipDockCloseOnNextBlurRef.current = false
          lockedDockChromeRef.current = 0
          stickerDockOpenRef.current = false
          try { inputRef.current?.blur() } catch { /* ignore */ }
          flushSync(() => {
            setStickerOpen(false)
            setBottomChromePx(0)
            setComposerFocused(false)
          })
          syncPanelViewportRef.current({ immediate: true, force: true })
        }
      }
      if (settingsOpen && !settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [guestMenuOpen, settingsOpen, stickerOpen])

  const halfScreenDockPx = useCallback(() => {
    if (typeof window === 'undefined') return stableChromeHRef.current || 320
    const inner = window.innerHeight || document.documentElement.clientHeight || 0
    const fullH = Math.max(baselineLayoutRef.current || 0, inner)
    if (fullH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = fullH
    const rememberedKb = Math.max(0, Math.round(keyboardHeightRef.current || 0))
    // Slightly under half-screen so IME overlays dock without lifting composer too high.
    const chrome = Math.max(
      200,
      Math.round(fullH * 0.46),
      rememberedKb > 120 ? Math.min(rememberedKb, Math.round(fullH * 0.48)) : 0,
    )
    stableChromeHRef.current = chrome
    return chrome
  }, [])

  const revealComposerKeyboard = useCallback(() => {
    const layoutH = Math.max(
      baselineLayoutRef.current || 0,
      typeof window !== 'undefined' ? (window.innerHeight || 0) : 0,
    )
    if (layoutH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = layoutH
    const h = lockedDockChromeRef.current > 0
      ? lockedDockChromeRef.current
      : (bottomChromePxRef.current > 0 ? bottomChromePxRef.current : halfScreenDockPx())
    lockedDockChromeRef.current = h
    // Keep dock fixed; only slide soft keyboard up as an overlay.
    stickerDockOpenRef.current = true
    keyboardPinnedRef.current = false
    flushSync(() => {
      setStickerOpen(true)
      setBottomChromePx(h)
      setComposerFocused(true)
    })
    const panel = panelRef.current
    if (panel) {
      // Restore full layout immediately (clears leftover is-keyboard shrink).
      panel.classList.remove('is-keyboard')
      panel.style.top = '0px'
      panel.style.bottom = 'auto'
      panel.style.height = `${layoutH}px`
      panel.style.maxHeight = `${layoutH}px`
      panel.style.minHeight = '0px'
      panel.style.setProperty('--hana-sticker-dock-h', `${h}px`)
      panel.style.setProperty('--hana-bottom-chrome-h', `${h}px`)
    }
    const input = inputRef.current
    if (input) {
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
    }
    syncPanelViewportRef.current({ immediate: true, force: true })
  }, [halfScreenDockPx])

  const closeStickerTray = useCallback((options = {}) => {
    // Keyboard icon while dock is open → reveal IME overlay, keep dock.
    if (options.focusInput && stickerDockMode) {
      revealComposerKeyboard()
      return
    }
    lockedDockChromeRef.current = 0
    skipDockCloseOnNextBlurRef.current = false
    stickerDockOpenRef.current = false
    flushSync(() => {
      setStickerOpen(false)
      setBottomChromePx(0)
      setComposerFocused(false)
    })
    syncPanelViewportRef.current({ immediate: true, force: true })
  }, [stickerDockMode, revealComposerKeyboard])

  /**
   * Same idea as tapping Send while 未確定: commit composition, then run「完了」
   * dismiss (hide IME + sticker dock).
   */
  const kakuteiThenKanryouDismiss = useCallback(() => {
    const input = inputRef.current
    if (input) {
      try {
        input.dispatchEvent(new CompositionEvent('compositionend', {
          bubbles: true,
          cancelable: true,
        }))
      } catch { /* ignore */ }
      // Controlled React state can lag behind the live composing value.
      const live = String(input.value || '')
      setDraft(live)
      try { input.blur() } catch { /* ignore */ }
    }
    setComposerFocused(false)
    keyboardPinnedRef.current = false
    if (stickerDockMode && (stickerDockOpenRef.current || bottomChromePxRef.current > 0)) {
      closeStickerTray()
      return
    }
    syncPanelViewportRef.current({ immediate: true, force: true })
  }, [closeStickerTray, stickerDockMode])

  const openStickerTray = useCallback(() => {
    if (stickerDockMode) {
      stickerDockOpenRef.current = true
      keyboardPinnedRef.current = false
      const layoutH = Math.max(
        baselineLayoutRef.current || 0,
        typeof window !== 'undefined' ? (window.innerHeight || 0) : 0,
      )
      if (layoutH > (baselineLayoutRef.current || 0)) baselineLayoutRef.current = layoutH
      const h = halfScreenDockPx()
      lockedDockChromeRef.current = h
      flushSync(() => {
        setBottomChromePx(h)
        setStickerOpen(true)
      })
      const panel = panelRef.current
      if (panel) {
        panel.classList.remove('is-keyboard')
        panel.style.top = '0px'
        panel.style.height = `${layoutH}px`
        panel.style.maxHeight = `${layoutH}px`
        panel.style.setProperty('--hana-sticker-dock-h', `${h}px`)
        panel.style.setProperty('--hana-bottom-chrome-h', `${h}px`)
      }
      try { inputRef.current?.blur() } catch { /* ignore */ }
      syncPanelViewportRef.current({ immediate: true, force: true })
      return
    }
    setStickerOpen(true)
  }, [halfScreenDockPx, stickerDockMode])

  const toggleStickerTray = useCallback(() => {
    // Fixed dock: icon only toggles soft-keyboard overlay up/down.
    if (stickerDockMode && stickerOpen) {
      const inputFocused = document.activeElement === inputRef.current
      if (inputFocused) {
        skipDockCloseOnNextBlurRef.current = true
        keyboardPinnedRef.current = false
        try { inputRef.current?.blur() } catch { /* ignore */ }
        syncPanelViewportRef.current({ immediate: true, force: true })
        return
      }
      revealComposerKeyboard()
      return
    }
    if (stickerOpen) {
      closeStickerTray({ focusInput: stickerDockMode })
    } else {
      openStickerTray()
    }
  }, [closeStickerTray, openStickerTray, revealComposerKeyboard, stickerDockMode, stickerOpen])

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

  /** Unread by partner → free edit/delete; after read → admin window. */
  const canMutateMessage = useCallback((message) => {
    if (!message || message.deleted) return false
    const delivery = (() => {
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
    })()
    return canMutateOwnMessage(message, {
      unreadByPartner: delivery === 'sent',
      windowMs: editWindowMs,
    })
  }, [actingAsOwner, guestOnHuman, activeThreadMeta, editWindowMs])

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
    const localMatches = threadsRef.current.filter((t) => (
      t.id === threadId
      || (canon && t.id === canon)
      || (key && t.guestKey === key)
      || (label && t.guestLabel === label)
    ))
    const relatedIds = localMatches.map((t) => t.id).filter(Boolean)
    const localBest = [...localMatches].sort((a, b) => {
      const score = (entry) => {
        const hasText = String(entry.lastText || '').trim() ? 40 : 0
        const legacyHint = key && entry.guestKey === key && entry.id !== canon
          ? (String(entry.lastText || '').trim() ? 12 : 6)
          : 0
        return hasText + legacyHint
          + (entry.id === canon ? 2 : 0)
          + (entry.guestKey === key ? 1 : 0)
      }
      const diff = score(b) - score(a)
      if (diff !== 0) return diff
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    })[0]
    const openId = localBest?.id || threadId || canon
    if (!openId) return

    if (openId !== activeThreadId) {
      showThreadMessages(openId, [...relatedIds, canon, threadId])
      setMessagesHydrated(false)
      setShowSummerFx(false)
      setActiveThreadId(openId)
    }

    const ensureId = (canon && canon.startsWith('guest-')) ? canon : (openId.startsWith('guest-') ? openId : '')
    const alreadyExists = Boolean(
      ensureId && threadsRef.current.some((thread) => thread.id === ensureId),
    )

    void (async () => {
      try {
        const resolved = await resolveGuestThreadWithHistory({
          guestKey: key,
          canonicalId: canon,
          guestLabel: label,
          preferredId: openId,
        })
        if (resolved && resolved !== openId) {
          showThreadMessages(resolved, [...relatedIds, openId, canon, threadId])
          setMessagesHydrated(false)
          setShowSummerFx(false)
          setActiveThreadId(resolved)
        }
      } catch {
        /* ignore */
      }

      if (canon && openId && canon !== openId) {
        const checkKey = `${canon}←${openId}`
        if (!migrationCheckedRef.current.has(checkKey)) {
          migrationCheckedRef.current.add(checkKey)
          try {
            const migrated = await migrateLegacyGuestThread({
              canonicalId: canon,
              legacyThreadId: openId,
              guestLabel: label,
              guestKey: key,
            })
            if (migrated && migrated !== openId) {
              showThreadMessages(migrated, [...relatedIds, openId, canon])
              setActiveThreadId(migrated)
            }
          } catch {
            /* ignore */
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
    const raw = String(message.rawText || message.text || '').trim()
    const replyText = raw
      || (message.imageUrl ? '写真' : '')
      || (message.fileKind === 'video' || String(message.fileMime || '').startsWith('video/')
        ? '動画'
        : '')
      || (message.sticker ? 'スタンプ' : '')
      || (message.fileUrl ? (message.fileName || 'ファイル') : '')
      || 'メッセージ'
    setReplyTo({
      id: message.id,
      text: replyText,
      sender: message.sender || message.role,
      role: message.role,
    })
  }

  const startEdit = (message) => {
    if (!canMutateMessage(message) || message.deleted) return
    setReplyTo(null)
    setEditingId(message.id)
    setDraft(message.rawText || message.text)
  }

  const handleDelete = async (message) => {
    if (!canMutateMessage(message) || message.deleted) return
    if (!window.confirm('このメッセージを削除しますか？')) return
    setError('')
    const messageId = String(message.serverId || message.id || '').trim()
    const threadId = actingAsOwner ? activeThreadId : guestChatId

    // AI channel: local only.
    if (!actingAsOwner && !guestOnHuman) {
      setAiMessages((prev) => prev.filter((m) => m.id !== message.id))
      if (editingId === message.id) {
        setEditingId(null)
        setDraft('')
      }
      return
    }

    if (!threadId || !messageId) return

    // Optimistic: hide immediately; block snapshot from reviving until server confirms.
    deletingIdsRef.current.add(messageId)
    if (message.id && message.id !== messageId) deletingIdsRef.current.add(message.id)
    const dropLocal = (list) => (list || []).filter((m) => (
      m.id !== message.id
      && m.id !== messageId
      && m.serverId !== messageId
    ))
    setHanaMessages((prev) => dropLocal(prev))
    const cached = messageCacheRef.current.get(threadId)
    if (cached) messageCacheRef.current.set(threadId, dropLocal(cached))
    if (editingId === message.id || editingId === messageId) {
      setEditingId(null)
      setDraft('')
    }

    try {
      await deleteChatMessage({ threadId, messageId })
      deletingIdsRef.current.delete(messageId)
      if (message.id) deletingIdsRef.current.delete(message.id)
    } catch (err) {
      deletingIdsRef.current.delete(messageId)
      if (message.id) deletingIdsRef.current.delete(message.id)
      // Snapshot will restore; nudge a local put-back if still missing.
      setHanaMessages((prev) => {
        if (prev.some((m) => m.id === message.id || m.id === messageId)) return prev
        return sortChatMessages([...prev, message])
      })
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
    // Desktop popup closes after send; mobile dock stays open (LINE-style).
    if (!stickerDockMode) setStickerOpen(false)
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
          clientId: pendingId,
          pending: true,
          role,
          sender: role,
          text: label,
          rawText: label,
          sticker: id,
          createdAt: new Date().toISOString(),
          createdAtIso: new Date().toISOString(),
          replyTo: null,
        },
      ])
      scrollToLatestRef.current()

      const serverId = await sendChatMessage({
        threadId,
        text: label,
        sender: role,
        sticker: id,
        clientId: pendingId,
        ...(actingAsOwner
          ? {}
          : {
              guestLabel: guestThreadLabel,
              guestKey: guestProfile?.key || guestKey || '',
            }),
      })
      if (serverId) {
        setHanaMessages((prev) => prev.map((m) => (
          m.id === pendingId ? { ...m, serverId } : m
        )))
      }
      if (!actingAsOwner) setChannel('human')
    } catch (err) {
      setHanaMessages((prev) => prev.filter((m) => m.id !== pendingId))
      setError(getFirebaseErrorMessage(err) || 'スタンプを送れませんでした。')
    } finally {
      setBusy(false)
      scrollToLatestRef.current()
    }
  }

  /** Pick photo/video → Storage → chat message(s). */
  const handleSendMedia = async (fileOrFiles) => {
    const files = (
      Array.isArray(fileOrFiles) || (typeof FileList !== 'undefined' && fileOrFiles instanceof FileList)
        ? [...fileOrFiles]
        : [fileOrFiles]
    ).filter((file) => {
      if (!file) return false
      const kind = classifyChatAttachment(file)
      return kind === 'image' || kind === 'video'
    })
    if (!files.length || busy) return
    if (actingAsOwner && !activeThreadId) {
      setError('返信する相手を選んでください。')
      return
    }
    // Cap a single picker batch so Storage / UI stay responsive.
    const batch = files.slice(0, 12)
    stickerDockOpenRef.current = false
    setStickerOpen(false)
    setBottomChromePx(0)
    setError('')
    setBusy(true)
    const role = actingAsOwner ? 'hana' : 'guest'
    const threadId = actingAsOwner
      ? activeThreadId
      : (guestChatId || ensureGuestChatId(guestKey || 'guest'))
    if (!actingAsOwner) {
      if (!guestChatId) setGuestChatId(threadId)
      if (channel !== 'human') switchToHuman(HUMAN_SWITCH_INTENT)
    }

    const guestMeta = actingAsOwner
      ? {}
      : {
          guestLabel: guestThreadLabel,
          guestKey: guestProfile?.key || guestKey || '',
        }

    let failed = 0
    try {
      for (const file of batch) {
        const pendingId = nextStickerPendingId()
        const localUrl = URL.createObjectURL(file)
        const kind = classifyChatAttachment(file)
        const label = kind === 'video' ? '動画' : '写真'
        try {
          setHanaMessages((prev) => [
            ...prev,
            {
              id: pendingId,
              clientId: pendingId,
              pending: true,
              uploading: true,
              role,
              sender: role,
              text: label,
              rawText: label,
              imageUrl: kind === 'image' ? localUrl : '',
              fileUrl: kind === 'video' ? localUrl : '',
              fileKind: kind,
              fileName: file.name || label,
              fileMime: String(file.type || ''),
              fileSize: Math.max(0, Number(file.size) || 0),
              createdAt: new Date().toISOString(),
              createdAtIso: new Date().toISOString(),
              replyTo: null,
            },
          ])
          scrollToLatestRef.current()

          const uploaded = await uploadChatAttachment(threadId, file)
          const imageUrl = uploaded.kind === 'image' ? uploaded.url : ''
          const fileUrl = uploaded.kind === 'image' ? '' : uploaded.url
          setHanaMessages((prev) => prev.map((m) => (
            m.id === pendingId
              ? {
                  ...m,
                  imageUrl,
                  fileUrl,
                  fileKind: uploaded.kind,
                  fileName: uploaded.fileName,
                  fileMime: uploaded.fileMime,
                  fileSize: uploaded.fileSize,
                  uploading: false,
                }
              : m
          )))
          URL.revokeObjectURL(localUrl)
          const serverId = await sendChatMessage({
            threadId,
            text: label,
            sender: role,
            ...(imageUrl ? { imageUrl } : {}),
            ...(fileUrl ? { fileUrl } : {}),
            fileKind: uploaded.kind,
            fileName: uploaded.fileName,
            fileMime: uploaded.fileMime,
            fileSize: uploaded.fileSize,
            clientId: pendingId,
            ...guestMeta,
          })
          if (serverId) {
            setHanaMessages((prev) => prev.map((m) => (
              m.id === pendingId ? { ...m, serverId } : m
            )))
          }
        } catch (err) {
          failed += 1
          URL.revokeObjectURL(localUrl)
          setHanaMessages((prev) => prev.filter((m) => m.id !== pendingId))
          if (batch.length === 1) {
            setError(getFirebaseErrorMessage(err) || err?.message || 'メディアを送れませんでした。')
          }
        }
      }
      if (!actingAsOwner) setChannel('human')
      if (failed > 0 && batch.length > 1) {
        setError(`${failed}件のメディアを送れませんでした。`)
      }
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
          clientId: pendingId,
          pending: true,
          role,
          sender: role,
          text: described.text,
          rawText: described.text,
          effect: described.effect,
          effectEmoji: described.effectEmoji,
          createdAt: new Date().toISOString(),
          createdAtIso: new Date().toISOString(),
          replyTo: null,
        },
      ])
      scrollToLatestRef.current()

      const serverId = await sendChatMessage({
        threadId,
        text: described.text,
        sender: role,
        effect: described.effect,
        effectEmoji: described.effectEmoji,
        clientId: pendingId,
        ...(actingAsOwner
          ? {}
          : {
              guestLabel: guestThreadLabel,
              guestKey: guestProfile?.key || guestKey || '',
            }),
      })
      if (serverId) {
        setHanaMessages((prev) => prev.map((m) => (
          m.id === pendingId ? { ...m, serverId } : m
        )))
      }
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
    const mode = options.mode || 'toggle'

    // Keep composer focused if the keyboard was already open.
    const keepKb = document.activeElement === inputRef.current || keyboardPinnedRef.current
    if (keepKb) {
      retainComposerFocusRef.current = true
      keyboardPinnedRef.current = true
    }

    const patchLocal = (prev) => prev.map((m) => {
      if (m.id !== message.id && m.serverId !== message.id && m.id !== message.serverId) return m
      return {
        ...m,
        reactions: applyReactionLocally(m.reactions, em, rid, mode),
      }
    })

    // Local AI channel: keep reactions in memory only.
    if (!canUseReactions) {
      setAiMessages(patchLocal)
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
    const messageId = String(message.serverId || message.id || '').trim()
    if (!threadId || !messageId) {
      setError('リアクションできません（スレッド未接続）。')
      return
    }
    if (message.pending && !message.serverId) {
      setError('送信が終わるまでリアクションできません。')
      return
    }

    // Show the chip immediately; Firestore snapshot will confirm/reconcile.
    setHanaMessages(patchLocal)
    setError('')
    try {
      await toggleChatReaction({
        threadId,
        messageId,
        emoji: em,
        reactorId: rid,
        mode,
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
    // Keep the soft keyboard only if it was already open. After 完了, do not reopen it.
    const keepKeyboard = document.activeElement === inputRef.current || keyboardPinnedRef.current
    keyboardPinnedRef.current = keepKeyboard
    retainComposerFocusRef.current = keepKeyboard
    const keepComposerFocused = () => {
      if (!keepKeyboard) return
      const input = inputRef.current
      if (!input || input.disabled) return
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
      syncPanelViewportRef.current({ forceKeyboard: true, force: true, revealComposer: true })
    }
    if (keepKeyboard) {
      keepComposerFocused()
      window.requestAnimationFrame(keepComposerFocused)
    }
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
        const pendingId = nextChatPendingId('msg')
        setHanaMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            clientId: pendingId,
            pending: true,
            role: 'hana',
            sender: 'hana',
            text,
            rawText: text,
            createdAt: nowIso,
            createdAtIso: nowIso,
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
        const serverId = await sendChatMessage({
          threadId: activeThreadId,
          text,
          sender: 'hana',
          clientId: pendingId,
          replyTo: pendingReply,
        })
        if (serverId) {
          setHanaMessages((prev) => prev.map((m) => (
            m.id === pendingId ? { ...m, serverId } : m
          )))
        }
        scrollToLatestRef.current()
      } else if (channel === 'human' || wantsHumanHana(text)) {
        if (channel !== 'human') {
          switchToHuman(HUMAN_SWITCH_INTENT)
        }
        const threadId = guestChatId || ensureGuestChatId(guestKey || 'guest')
        if (!guestChatId) setGuestChatId(threadId)
        const pendingId = nextChatPendingId('msg')
        setHanaMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            clientId: pendingId,
            pending: true,
            role: 'guest',
            sender: 'guest',
            text,
            rawText: text,
            createdAt: nowIso,
            createdAtIso: nowIso,
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
        const serverId = await sendChatMessage({
          threadId,
          text,
          sender: 'guest',
          guestLabel: guestThreadLabel,
          guestKey: guestProfile?.key || guestKey || '',
          clientId: pendingId,
          replyTo: pendingReply,
        })
        if (serverId) {
          setHanaMessages((prev) => prev.map((m) => (
            m.id === pendingId ? { ...m, serverId } : m
          )))
        }
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
      if (keepKeyboard) {
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
      } else {
        keyboardPinnedRef.current = false
        retainComposerFocusRef.current = false
        inputRef.current?.blur()
        syncPanelViewportRef.current({ immediate: true, force: true })
        scrollToLatestRef.current()
      }
    }
  }

  const modeTitle = actingAsOwner
    ? (activeThreadId ? ownerActiveGuestLabel : 'はな')
    : channel === 'human'
      ? 'はな'
      : 'はなちゃん'
  const modeSub = actingAsOwner || channel === 'human'
    ? ''
    : 'はなちゃんとお話し中'
  const presenceLabel = partnerPresence.label
  const myStatusLabel = myPresence.label

  if (hidden) return null

  // Portal to body so Capacitor / parent stacking never clips the FAB.
  return createPortal(
    <div className={`hana-chat${open ? ' is-open is-fullscreen' : ''}`}>
      <FlowerRainLayer />
      {incomingBanner ? (
        <button
          type="button"
          className="hana-chat-incoming-banner"
          onClick={() => {
            const threadId = incomingBanner.threadId
            dismissIncomingBanner()
            setOpen(true)
            if (actingAsOwner && threadId) {
              const entry = ownerGuestRoster.find((item) => (
                item.threadId === threadId
                || item.canonicalId === threadId
                || item.thread?.id === threadId
              ))
              if (entry) {
                openOwnerThread(
                  entry.threadId,
                  entry.label,
                  entry.guestKey || '',
                  entry.canonicalId || entry.threadId,
                )
              }
            } else if (!actingAsOwner) {
              setChannel('human')
            }
          }}
        >
          <span className="hana-chat-incoming-banner-kicker">新しいメッセージ</span>
          <strong className="hana-chat-incoming-banner-title">{incomingBanner.title}</strong>
          <span className="hana-chat-incoming-banner-body">{incomingBanner.body}</span>
        </button>
      ) : null}

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
      {!hidden ? (
        <HanaCall
          threadId={actingAsOwner ? activeThreadId : guestChatId}
          listenThreadIds={callListenThreadIds}
          role={actingAsOwner ? 'hana' : 'guest'}
          partnerName={actingAsOwner ? ownerActiveGuestLabel : 'はな'}
          canStart={Boolean(open && (actingAsOwner ? activeThreadId : guestChatId))}
          compact
          buttonsHost={callButtonsHost}
          onBeforeStart={() => {
            if (!actingAsOwner) setChannel('human')
          }}
          onIncoming={(incoming) => {
            setOpen(true)
            if (!actingAsOwner) {
              setChannel('human')
              return
            }
            if (!incoming?.threadId) return
            const entry = ownerGuestRoster.find((item) => (
              item.threadId === incoming.threadId
              || item.canonicalId === incoming.threadId
              || item.thread?.id === incoming.threadId
            ))
            if (entry) {
              openOwnerThread(
                entry.threadId,
                entry.label,
                entry.guestKey || '',
                entry.canonicalId,
              )
            } else {
              setActiveThreadId(incoming.threadId)
            }
          }}
        />
      ) : null}

      {open ? (
        <section
          ref={panelRef}
          id="hana-chat-panel"
          className={`hana-chat-panel is-fullscreen${stickerOpen && stickerDockMode ? ' is-sticker-dock' : ''}${bottomChromePx > 0 ? ' is-bottom-chrome' : ''}${composerFocused ? ' is-composer-focused' : ''}`}
          aria-label="はなちゃんチャット"
        >
          <div className="hana-chat-natsu-decor" aria-hidden="true">
            {showSummerFx ? (
              <>
                <span className="hana-chat-natsu-lantern is-a" />
                <span className="hana-chat-natsu-lantern is-b" />
                <span className="hana-chat-natsu-fish"><NatsuKingyo gradientId="chat" /></span>
                <ChatNatsuFireworks />
              </>
            ) : null}
          </div>
          <header className="hana-chat-header" ref={headerRef}>
            {!actingAsOwner && channel === 'human' ? (
              <button
                type="button"
                className={`hana-chat-avatar is-back-ai${speaking ? ' is-speaking' : ''}`}
                onClick={() => setChannel('ai')}
                title="はなちゃんに戻る"
                aria-label="はなちゃんに戻る"
              >
                <img src={partnerAvatarSrc} alt="" />
                <span
                  className={`hana-chat-presence ${partnerPresence.className}`}
                  title={presenceLabel}
                  aria-hidden="true"
                />
                <span className="hana-chat-avatar-back-badge" aria-hidden="true">
                  <img src={hanachanArt} alt="" />
                </span>
              </button>
            ) : (
              <div className={`hana-chat-avatar${speaking ? ' is-speaking' : ''}`}>
                <img src={partnerAvatarSrc} alt="" />
                <span
                  className={`hana-chat-presence ${partnerPresence.className}`}
                  title={presenceLabel}
                  aria-label={presenceLabel}
                />
              </div>
            )}
            <div className="hana-chat-titles">
              {actingAsOwner ? (
                <div className="hana-chat-guest-select" ref={guestMenuRef}>
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
                          }, Date.now())
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
                  </div>
                </>
              )}
            </div>
            <div className="hana-chat-header-actions">
              <div
                className="hana-chat-call-slot"
                ref={(node) => {
                  callButtonsHostRef.current = node
                  if (open) setCallButtonsHost(node)
                }}
              />
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
                          <p className="hana-chat-settings-label">プッシュ通知</p>
                          <p className="hana-chat-settings-hint">
                            {typeof window !== 'undefined' && window.__HANA_CAPACITOR__
                              ? 'アプリの通知設定から変更できます'
                              : notifyPermission === 'granted'
                                ? '新しいメッセージをバナーでお知らせ'
                                : notifyPermission === 'denied'
                                  ? 'ブラウザ設定で通知を許可してください'
                                  : 'タップして通知をオンにします'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`hana-chat-hint-toggle${notifyPermission === 'granted' ? ' is-on' : ''}`}
                          aria-pressed={notifyPermission === 'granted'}
                          title="プッシュ通知"
                          disabled={typeof window !== 'undefined' && (window.__HANA_CAPACITOR__ || notifyPermission === 'denied' || notifyPermission === 'unsupported')}
                          onClick={togglePushNotifications}
                        >
                          <span className="hana-chat-hint-toggle-label">通知</span>
                          <span className="hana-chat-hint-toggle-track" aria-hidden="true">
                            <span className="hana-chat-hint-toggle-thumb" />
                          </span>
                        </button>
                      </div>
                    </div>
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
              const attachment = !message.deleted ? getChatMessageAttachment(message) : null
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
              const mutable = isOwn && canMutateMessage(message)
              const sideClass = isOwn ? 'is-own' : 'is-other'
              const avatarSrc = avatarSrcForMessage(message)
              if (message.kind === 'call-log' || message.callLog) {
                const callStatus = message.callLog?.status || ''
                const callDur = Number(message.callLog?.durationSec) || 0
                return (
                  <div key={message.id} className="hana-chat-msg-row is-call-log">
                    <div className={`hana-chat-call-log is-${callStatus || 'ended'}`} role="status">
                      <span className="hana-chat-call-log-icon" aria-hidden="true">📞</span>
                      <span className="hana-chat-call-log-text">{message.text}</span>
                      {timeLabel ? <time dateTime={message.createdAt || undefined}>{timeLabel}</time> : null}
                      {callStatus === 'ended' && callDur > 0 ? (
                        <span className="hana-chat-call-log-meta">完了</span>
                      ) : null}
                      {callStatus === 'missed' ? (
                        <span className="hana-chat-call-log-meta is-missed">不在</span>
                      ) : null}
                    </div>
                  </div>
                )
              }
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
                        canEdit={mutable && !showsSticker && !showsEffect && !showsMedia}
                        canDelete={mutable}
                        canReact={!message.deleted}
                        showFlowerReact={!message.deleted && !isOwn}
                        defaultReaction={defaultReaction}
                        reactions={message.reactions || {}}
                        reactorId={reactorId}
                        copyText={message.deleted || showsMedia ? '' : (message.rawText || message.text || '')}
                        onCopy={notifyCopied}
                        onReply={() => startReply(message)}
                        onEdit={() => startEdit(message)}
                        onDelete={() => handleDelete(message)}
                        onReact={(emoji, options) => { void handleReact(message, emoji, options) }}
                        onMenuAction={(actionId) => handleMenuAction(actionId, message)}
                        onEffect={handleLocalEffect}
                      >
                        <div
                          className={`hana-chat-bubble ${sideClass} is-${message.role}${message.kind === 'human-switch' || message.kind === 'intro' ? ' is-notice' : ''}${message.deleted ? ' is-deleted' : ''}${showsSticker ? ' is-sticker' : ''}${showsEffect ? ' is-effect' : ''}${showsImage ? ' is-image' : ''}${showsVideo ? ' is-video' : ''}${showsFile ? ' is-file' : ''}${message.uploading ? ' is-uploading' : ''}`}
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
                              disabled={Boolean(message.uploading)}
                              aria-label="画像を拡大表示"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                if (message.uploading) return
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
                              {message.uploading ? (
                                <span className="hana-chat-image-status">送信中…</span>
                              ) : null}
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
                              {message.uploading ? (
                                <span className="hana-chat-image-status">送信中…</span>
                              ) : null}
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
                        collapsed={Boolean(ownerAssistCollapseById[message.id])}
                        onRetry={() => { void requestOwnerAssist(message, { force: true }) }}
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

          {/* Disabled: Android/touch ghost-taps were auto-sending ファイト/オッケー while typing (guest + owner). */}
          {false && canUseReactions && stickerSuggestions.length > 0 && !editingId ? (
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
            <div className={`hana-chat-composer-field${canUseReactions && effectThreadId ? ' has-sticker' : ''}`}>
              {canUseReactions && effectThreadId ? (
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(event) => {
                    const picked = event.target.files
                    if (picked?.length) void handleSendMedia(picked)
                  }}
                />
              ) : null}
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
                onPointerDown={() => {
                  if (!stickerDockMode) return
                  // First tap on input: raise fixed sticker dock under the IME.
                  // Later taps: keep dock and ensure keyboard overlay is focused.
                  revealComposerKeyboard()
                }}
                onFocus={() => {
                  setComposerFocused(true)
                  if (stickerDockMode) {
                    // Focus without pointerdown (e.g. programmatic): still raise dock.
                    if (!stickerDockOpenRef.current) {
                      revealComposerKeyboard()
                    }
                    return
                  }
                  syncPanelViewportRef.current({ immediate: true, force: true })
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (!open) return
                    if (skipDockCloseOnNextBlurRef.current) {
                      skipDockCloseOnNextBlurRef.current = false
                      setComposerFocused(false)
                      // Icon dismissed IME only — keep fixed dock layout.
                      syncPanelViewportRef.current({ immediate: true, force: true })
                      return
                    }
                    if (retainComposerFocusRef.current) {
                      try {
                        inputRef.current?.focus({ preventScroll: true })
                      } catch {
                        inputRef.current?.focus()
                      }
                      return
                    }
                    // Spurious IME blur while still typing: keep dock/keyboard.
                    const vv = window.visualViewport
                    const layoutH = Math.max(
                      baselineLayoutRef.current || 0,
                      window.innerHeight || 0,
                    )
                    const inset = vv
                      ? Math.max(0, layoutH - vv.height - (vv.offsetTop || 0))
                      : 0
                    if (document.activeElement === inputRef.current && inset > 100) return

                    // Like Send while 未確定: kakutei, then「完了」dismiss dock+IME.
                    kakuteiThenKanryouDismiss()
                  }, 80)
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
              {canUseReactions && effectThreadId ? (
                <div className="hana-chat-sticker">
                  {(() => {
                    // Dock visible + IME down → keyboard icon. IME up → sticker icon.
                    const showKeyboardIcon = Boolean(stickerDockMode && stickerOpen && !composerFocused)
                    return (
                  <button
                    ref={stickerTriggerRef}
                    type="button"
                    className={`hana-chat-sticker-trigger${stickerOpen ? ' is-open' : ''}${showKeyboardIcon ? ' is-keyboard' : ''}`}
                    title={showKeyboardIcon ? 'キーボード' : 'スタンプ・エフェクト'}
                    aria-label={showKeyboardIcon ? 'キーボードを表示' : 'スタンプ・エフェクト'}
                    aria-expanded={stickerOpen}
                    disabled={busy}
                    onMouseDown={(event) => {
                      // Always preventDefault: otherwise the first tap only dismisses the
                      // soft keyboard and never fires click / never opens the sticker dock.
                      event.preventDefault()
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault()
                    }}
                    onClick={toggleStickerTray}
                  >
                    {showKeyboardIcon ? (
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                        <path
                          fill="currentColor"
                          d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm1.25 2.5v1.75h1.75V8.5H5.25zm3.25 0v1.75h1.75V8.5H8.5zm3.25 0v1.75h1.75V8.5h-1.75zm3.25 0v1.75H18V8.5h-1.75zm3.25 0V10H20V8.5h-1.5zM5.25 12v1.75h1.75V12H5.25zm3.25 0v1.75h8.5V12h-8.5zm10 0V13.75H20V12h-1.5zM7 15.75v1.25h10v-1.25H7z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="hana-chat-sticker-face"
                        viewBox="0 0 24 24"
                        width="28"
                        height="28"
                        aria-hidden="true"
                        focusable="false"
                      >
                        {/* Soft Hana smile — same palette as stickers */}
                        <circle cx="12" cy="13" r="8.2" fill="#ffe8dc" />
                        <path
                          d="M4.2 13c.45-7.1 4.3-10.6 7.8-10.6s7.35 3.5 7.8 10.6c-1.05-2.45-3.1-3.9-7.8-3.9S5.25 10.55 4.2 13z"
                          fill="#3a2420"
                        />
                        <path
                          d="M9 6.15c1.05 2.1 1.85 3.15 2.25 4.55.4-1.9.85-3.35 1.9-4.85-1.5-.4-2.95-.35-4.15.3z"
                          fill="#2a1814"
                        />
                        <ellipse
                          cx="18.15"
                          cy="7.15"
                          rx="2.25"
                          ry="1.55"
                          transform="rotate(28 18.15 7.15)"
                          fill="#e89aaa"
                        />
                        <circle cx="18.75" cy="6.35" r="1" fill="#f2b8c4" />
                        <circle cx="7.85" cy="14.7" r="1.65" fill="#f4a89a" opacity="0.55" />
                        <circle cx="16.15" cy="14.7" r="1.65" fill="#f4a89a" opacity="0.55" />
                        <ellipse cx="9.25" cy="12.55" rx="1.2" ry="1.45" fill="#2a1814" />
                        <ellipse cx="14.75" cy="12.55" rx="1.2" ry="1.45" fill="#2a1814" />
                        <circle cx="9.6" cy="12.1" r="0.38" fill="#fff" />
                        <circle cx="15.1" cy="12.1" r="0.38" fill="#fff" />
                        <path
                          d="M10.35 15.65c.55 1.15 2.75 1.15 3.3 0"
                          stroke="#c47a6e"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                    )}
                  </button>
                    )
                  })()}
                  {stickerOpen && !stickerDockMode ? (
                    <div className="hana-chat-sticker-panel" ref={stickerRef} role="menu" aria-label="スタンプとエフェクト">
                      <div className="hana-chat-effect-picker">
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
                      <div className="hana-chat-sticker-tabs" role="tablist" aria-label="スタンプの種類">
                        {HANA_STICKER_SETS.map((set) => (
                          <button
                            key={set.id}
                            type="button"
                            role="tab"
                            title={set.label}
                            aria-label={set.label}
                            aria-selected={set.id === activeStickerSet.id}
                            className={`hana-chat-sticker-tab is-icon${set.id === activeStickerSet.id ? ' is-active' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setStickerSetId(set.id)
                              writeStickerSet(set.id, { asOwner: actingAsOwner })
                            }}
                          >
                            <HanaSticker id={set.items[0].id} size={26} title="" />
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
              ) : null}
            </div>
            {canUseReactions && effectThreadId && !editingId && !draft.trim() ? (
              <button
                type="button"
                className="hana-chat-composer-action is-camera"
                title="写真・動画を送る（複数可）"
                aria-label="写真・動画を送る（複数可）"
                disabled={busy || (actingAsOwner && !activeThreadId)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => imageInputRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 8.2A2.2 2.2 0 0 1 6.2 6h1.1l1-1.5A1.4 1.4 0 0 1 9.45 3.8h5.1a1.4 1.4 0 0 1 1.15.7l1 1.5h1.1A2.2 2.2 0 0 1 20 8.2v7.6A2.2 2.2 0 0 1 17.8 18H6.2A2.2 2.2 0 0 1 4 15.8V8.2Z"
                  />
                  <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                className="hana-chat-composer-action is-send"
                disabled={busy || !draft.trim() || (actingAsOwner && !activeThreadId)}
                title={editingId ? '更新' : '送る'}
                aria-label={busy ? '送信中' : editingId ? '更新' : '送る'}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
              >
                {busy ? (
                  <span aria-hidden="true">…</span>
                ) : (
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M4.2 19.6 20.5 12 4.2 4.4l-.05 5.9L14.8 12l-10.65 1.7.05 5.9Z"
                    />
                  </svg>
                )}
              </button>
            )}
          </form>
          {bottomChromePx > 0 && stickerDockMode ? (
            <div
              className={`hana-chat-bottom-chrome${stickerOpen ? ' has-dock' : ''}`}
              style={{
                height: bottomChromePx,
                flex: `0 0 ${bottomChromePx}px`,
              }}
              aria-hidden={!stickerOpen}
            >
              {stickerOpen && canUseReactions && effectThreadId ? (
            <div
              className="hana-chat-sticker-dock"
              ref={stickerRef}
              role="menu"
              aria-label="スタンプとエフェクト"
            >
              <div className="hana-chat-effect-picker">
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
              <div className="hana-chat-sticker-tabs" role="tablist" aria-label="スタンプの種類">
                {HANA_STICKER_SETS.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    role="tab"
                    title={set.label}
                    aria-label={set.label}
                    aria-selected={set.id === activeStickerSet.id}
                    className={`hana-chat-sticker-tab is-icon${set.id === activeStickerSet.id ? ' is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setStickerSetId(set.id)
                      writeStickerSet(set.id, { asOwner: actingAsOwner })
                    }}
                  >
                    <HanaSticker id={set.items[0].id} size={26} title="" />
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
          ) : null}
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
