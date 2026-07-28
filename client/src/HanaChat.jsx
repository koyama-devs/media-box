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
  pulseChatPresence,
  resolveGuestDisplayName,
  sendChatMessage,
  softDeleteChatMessage,
  subscribeChatMessages,
  subscribeChatThreads,
  subscribeOwnChatThread,
  subscribeToAuthUser,
  threadUnreadCount,
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
  const listRef = useRef(null)
  const panelRef = useRef(null)
  const syncPanelViewportRef = useRef(() => {})

  const guestProfile = useMemo(() => getGuestProfile(guestKey), [guestKey])
  const guestDisplayName = guestProfile?.displayName || 'ゲスト'
  const guestAddressAs = guestProfile?.addressAs || guestDisplayName
  const guestThreadLabel = guestProfile?.displayName || guestDisplayName

  const isAdmin = isAdminUser(authUser)
  const actingAsOwner = appRole === 'owner' || isAdmin

  const ownerActiveGuestLabel = useMemo(() => {
    if (!actingAsOwner || !activeThreadId) return 'ゲスト'
    const thread = threads.find((entry) => entry.id === activeThreadId)
    return resolveGuestDisplayName({
      threadId: activeThreadId,
      guestKey: thread?.guestKey,
      guestLabel: thread?.guestLabel,
    })
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
    const id = ensureGuestChatId(guestKey || 'guest')
    const stored = loadAiMessages(id)
    const savedChannel = loadChannel(id)
    setGuestChatId(id)
    setAiMessages(stored?.length ? stored : defaultIntroMessages(guestProfile))
    setChannel(savedChannel)
    setHumanNotice('')
    setStorageReady(true)
  }, [hidden, guestKey, guestProfile])

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
      return isPresenceOnline(activeThreadMeta?.guestOnlineAt)
    }
    if (channel === 'ai') return true
    return isPresenceOnline(activeThreadMeta?.hanaOnlineAt)
  }, [actingAsOwner, channel, activeThreadMeta, presenceTick])

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
    }

    const syncMobileViewport = () => {
      if (!window.matchMedia('(max-width: 640px)').matches) {
        clearInline()
        return
      }
      const vv = window.visualViewport
      const margin = 10
      if (!vv) {
        clearInline()
        return
      }

      // Keep panel inside the visual viewport (keyboard / iOS focus zoom).
      const keyboardOpen = vv.height < window.innerHeight - 80
      const left = Math.max(0, vv.offsetLeft) + margin
      const width = Math.max(240, vv.width - margin * 2)

      panel.style.left = `${left}px`
      panel.style.right = 'auto'
      panel.style.width = `${width}px`

      if (keyboardOpen) {
        const top = Math.max(0, vv.offsetTop) + margin
        const height = Math.max(180, vv.height - margin * 2)
        panel.style.top = `${top}px`
        panel.style.bottom = 'auto'
        panel.style.height = `${height}px`
        panel.style.maxHeight = `${height}px`
        panel.classList.add('is-keyboard')
      } else {
        panel.style.top = ''
        panel.style.bottom = ''
        panel.style.height = ''
        panel.style.maxHeight = ''
        panel.classList.remove('is-keyboard')
      }
    }

    syncMobileViewport()
    syncPanelViewportRef.current = syncMobileViewport
    const vv = window.visualViewport
    vv?.addEventListener('resize', syncMobileViewport)
    vv?.addEventListener('scroll', syncMobileViewport)
    window.addEventListener('resize', syncMobileViewport)
    window.addEventListener('orientationchange', syncMobileViewport)
    return () => {
      syncPanelViewportRef.current = () => {}
      vv?.removeEventListener('resize', syncMobileViewport)
      vv?.removeEventListener('scroll', syncMobileViewport)
      window.removeEventListener('resize', syncMobileViewport)
      window.removeEventListener('orientationchange', syncMobileViewport)
      clearInline()
    }
  }, [hidden, open])

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
      }))
    : aiMessages

  const ownSender = actingAsOwner ? 'hana' : 'guest'

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

  const clearComposerExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const openOwnerThread = async (threadId, label, guestKey = '', canonicalId = '') => {
    clearComposerExtras()
    setHanaMessages([])
    const key = guestKey || (canonicalId || threadId).replace(/^guest-/, '')
    const canon = canonicalId || (key && GUEST_PROFILES[key] ? `guest-${key}` : '')
    let openId = threadId

    if (canon && threadId && canon !== threadId) {
      try {
        openId = await migrateLegacyGuestThread({
          canonicalId: canon,
          legacyThreadId: threadId,
          guestLabel: label,
          guestKey: key,
        })
      } catch {
        openId = threadId
      }
    }

    setActiveThreadId(openId)

    if (openId.startsWith('guest-')) {
      try {
        await ensureChatThread({
          threadId: openId,
          guestLabel: label,
          guestKey: key || openId.replace(/^guest-/, ''),
        })
      } catch {
        /* ignore */
      }
    }
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
    ? 'はな（返信）'
    : channel === 'human'
      ? 'はな'
      : 'はなちゃん'
  const modeSub = actingAsOwner
    ? 'ゲストへの返信'
    : channel === 'human'
      ? 'はな本人'
      : 'はなちゃんとお話し中'
  const presenceLabel = partnerOnline ? 'オンライン' : 'オフライン'

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
          <span className="hana-chat-badge" aria-label={`未読 ${unreadLauncher}件`}>
            {unreadLauncher > 99 ? '99+' : unreadLauncher}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          ref={panelRef}
          id="hana-chat-panel"
          className="hana-chat-panel"
          aria-label="はなちゃんチャット"
        >
          <header className="hana-chat-header">
            <div className={`hana-chat-avatar${speaking ? ' is-speaking' : ''}`}>
              <img src={hanachanArt} alt="" />
              <span
                className={`hana-chat-presence ${partnerOnline ? 'is-online' : 'is-offline'}`}
                title={presenceLabel}
                aria-label={presenceLabel}
              />
            </div>
            <div className="hana-chat-titles">
              <p className="hana-chat-kicker">{modeSub}</p>
              <div className="hana-chat-heading-row">
                <h2 className="hana-chat-heading">{modeTitle}</h2>
                <p className={`hana-chat-presence-label${partnerOnline ? ' is-online' : ''}`}>
                  {presenceLabel}
                </p>
              </div>
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
              {ownerGuestRoster.length === 0 ? (
                <p className="hana-chat-empty">まだメッセージはありません。</p>
              ) : (
                ownerGuestRoster.map((entry) => {
                  const unreadN = threadUnreadCount(entry.thread, 'hana')
                  return (
                  <button
                    key={`${entry.canonicalId}:${entry.threadId}`}
                    type="button"
                    className={`hana-chat-thread${activeThreadId === entry.threadId || activeThreadId === entry.canonicalId ? ' is-active' : ''}${unreadN ? ' is-unread' : ''}`}
                    onClick={() => openOwnerThread(
                      entry.threadId,
                      entry.label,
                      entry.guestKey || entry.thread?.guestKey || '',
                      entry.canonicalId,
                    )}
                  >
                    <span className="hana-chat-thread-name">
                      <span
                        className={`hana-chat-thread-dot ${isPresenceOnline(entry.thread?.guestOnlineAt, presenceTick) ? 'is-online' : 'is-offline'}`}
                        aria-hidden="true"
                      />
                      {entry.label}
                      {unreadN ? (
                        <span className="hana-chat-thread-unread" aria-label={`未読 ${unreadN}件`}>
                          {unreadN > 99 ? '99+' : unreadN}
                        </span>
                      ) : null}
                    </span>
                    <span className="hana-chat-thread-preview">
                      {entry.thread?.lastText || (entry.known ? '（未開始）' : '—')}
                    </span>
                  </button>
                  )
                })
              )}
            </div>
          ) : null}

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
              <p className="hana-chat-empty">上のリストから返信する相手を選んでね。</p>
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
              return (
                <ChatSwipeBubble
                  key={message.id}
                  className={`${sideClass} is-${message.role}`}
                  canReply={!message.deleted}
                  canEdit={mutable}
                  canDelete={mutable}
                  onReply={() => startReply(message)}
                  onEdit={() => startEdit(message)}
                  onDelete={() => handleDelete(message)}
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

          <form className="hana-chat-composer" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="hana-chat-input">
              メッセージ
            </label>
            <input
              id="hana-chat-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                window.setTimeout(() => syncPanelViewportRef.current(), 50)
                window.setTimeout(() => syncPanelViewportRef.current(), 300)
              }}
              onBlur={() => {
                window.setTimeout(() => syncPanelViewportRef.current(), 50)
                window.setTimeout(() => syncPanelViewportRef.current(), 300)
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
              enterKeyHint="send"
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
