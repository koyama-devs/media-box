import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EMOTION_MOMENTS, triggerEmotionMoment } from './EmotionMoment'
import {
    CHAT_DEFAULT_REACTION,
    CHAT_REACTION_EMOJIS,
    reactionMine,
    reactionTotal,
} from './firebase'
import { CHAT_PARTY_REACTION, triggerFlowerRain, triggerPartyBurst } from './FlowerRain'

const REPLY_THRESHOLD = 52
const ACTION_THRESHOLD = 56
const MAX_RIGHT = 72
const MAX_LEFT = -108
const HOVER_LEAVE_MS = 180
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 28
const MENU_ARM_MS = 280
const MENU_DISMISS_GUARD_MS = 700
// Decide the axis only after a movement long enough to be meaningful: at a few
// pixels dx and dy are still noise, and picking 'v' there silently kills the swipe.
const AXIS_LOCK_PX = 12
// A scroll drag cancels the pending long press, but stay above finger jitter so
// simply holding a bubble still opens the menu.
const PRESS_CANCEL_MOVE_PX = 16
// Horizontal must lead, otherwise vertical scrolling wins the gesture.
const HORIZONTAL_DOMINANCE = 1.15

const MENU_EXTRA_ACTIONS = [
  { id: 'pin', label: 'ピン', icon: '📌' },
  { id: 'remind', label: 'リマインド', icon: '⏰' },
  { id: 'translate', label: '翻訳', icon: '🌐' },
]

function IconReply() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10 9V5L3 12l7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"
      />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
      />
    </svg>
  )
}

function IconDelete() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
      />
    </svg>
  )
}

function IconReact() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-3.5-7.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm7 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zM12 17.2c-1.9 0-3.5-1-4.2-2.4-.2-.4.1-.8.5-.8h7.4c.4 0 .7.4.5.8-.7 1.4-2.3 2.4-4.2 2.4z"
      />
    </svg>
  )
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
      />
    </svg>
  )
}

async function copyTextToClipboard(text) {
  const value = String(text || '')
  if (!value) return false

  const legacyCopy = () => {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.setAttribute('contenteditable', 'true')
    area.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:1px',
      'height:1px',
      'padding:0',
      'margin:0',
      'border:0',
      'outline:none',
      'box-shadow:none',
      'background:transparent',
      'opacity:0.01',
      'z-index:99999',
      'caret-color:transparent',
    ].join(';')
    document.body.appendChild(area)
    area.focus({ preventScroll: true })
    area.select()
    try {
      area.setSelectionRange(0, value.length)
    } catch {
      /* ignore */
    }
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.blur()
    area.remove()
    return ok
  }

  if (legacyCopy()) return true
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* retry */
  }
  return legacyCopy()
}

function computeIsCoarsePointer() {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window
    || (navigator.maxTouchPoints || 0) > 0
    || window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(hover: none)').matches
    || !window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

/** One shared matchMedia listener for the whole app (not per bubble). */
let sharedCoarsePointer = null
let sharedCoarseMedia = null
const sharedCoarseSubscribers = new Set()

function ensureSharedCoarsePointer() {
  if (typeof window === 'undefined') return false
  if (sharedCoarseMedia) return sharedCoarsePointer
  sharedCoarsePointer = computeIsCoarsePointer()
  sharedCoarseMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
  const sync = () => {
    sharedCoarsePointer = computeIsCoarsePointer()
    sharedCoarseSubscribers.forEach((fn) => {
      try { fn(sharedCoarsePointer) } catch { /* ignore */ }
    })
  }
  sharedCoarseMedia.addEventListener('change', sync)
  return sharedCoarsePointer
}

/**
 * Coarse-pointer / touch detection. Prefer calling once in the chat shell and
 * passing `coarsePointer` into bubbles so rows do not each subscribe.
 */
export function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(() => ensureSharedCoarsePointer())

  useEffect(() => {
    ensureSharedCoarsePointer()
    const onChange = (next) => setCoarse(next)
    sharedCoarseSubscribers.add(onChange)
    setCoarse(sharedCoarsePointer)
    return () => { sharedCoarseSubscribers.delete(onChange) }
  }, [])

  return coarse
}

/** Parent override skips per-row subscription; otherwise use shared listener. */
function useSwipeMode(coarsePointer) {
  const needsDetect = typeof coarsePointer !== 'boolean'
  const [coarse, setCoarse] = useState(() => (
    needsDetect ? ensureSharedCoarsePointer() : coarsePointer
  ))
  useEffect(() => {
    if (!needsDetect) return undefined
    ensureSharedCoarsePointer()
    const onChange = (next) => setCoarse(next)
    sharedCoarseSubscribers.add(onChange)
    setCoarse(sharedCoarsePointer)
    return () => { sharedCoarseSubscribers.delete(onChange) }
  }, [needsDetect])
  return needsDetect ? coarse : coarsePointer
}

function isIgnoredPressTarget(target) {
  if (!(target instanceof Element)) return false
  // Image bubbles are a full-surface <button class="hana-chat-image-link">.
  // Allow swipe-to-reply / long-press menu; short tap still opens the preview.
  if (target.closest('.hana-chat-image-link')) return false
  return Boolean(target.closest(
    'button, a, textarea, input, [data-no-bubble-press], .hana-chat-reactions, .chat-desktop-actions, .chat-msg-menu',
  ))
}

/** Soft device vibration when supported (Android Chrome, etc.). */
function haptic(kind = 'tap') {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (kind === 'longpress') {
      // Double pulse — easy to feel under the fingertip when the menu opens.
      navigator.vibrate([12, 40, 32])
      return
    }
    if (kind === 'menu') {
      navigator.vibrate(16)
      return
    }
    if (kind === 'reply') {
      navigator.vibrate(10)
      return
    }
    navigator.vibrate(8)
  } catch {
    /* unsupported / denied */
  }
}

/**
 * Touch: swipe right → reply, swipe left → menu; long-press → menu.
 * Desktop: hover toolbar + right-click / long-press → fixed center menu.
 */
function ChatSwipeBubble({
  className = '',
  canReply = true,
  canEdit = false,
  canDelete = false,
  canReact = false,
  showFlowerReact = false,
  defaultReaction = CHAT_DEFAULT_REACTION,
  reactions = null,
  reactorId = '',
  reactionEmojis = CHAT_REACTION_EMOJIS,
  copyText = '',
  /** When boolean, skips per-row detection (hoist from chat shell). */
  coarsePointer = null,
  onCopy,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onMenuAction,
  onEffect,
  children,
}) {
  const swipeMode = useSwipeMode(coarsePointer)
  const rootRef = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const locking = useRef(null) // 'h' | 'v' | 'hold' | null
  const offsetRef = useRef(0)
  const actionsOpenRef = useRef(false)
  const leaveTimer = useRef(null)
  const longPressFired = useRef(false)
  const suppressMenuDismissUntil = useRef(0)
  const suppressClickRef = useRef(false)
  const activeTouchId = useRef(null)
  const canReplyRef = useRef(canReply)
  const canSwipeLeftRef = useRef(false)
  const onReplyRef = useRef(onReply)
  const copyTextRef = useRef(copyText)
  const onCopyRef = useRef(onCopy)

  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuArmed, setMenuArmed] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [soonNote, setSoonNote] = useState('')

  const canCopy = Boolean(String(copyText || '').trim())
  // Left swipe opens the action menu (extras always available).
  const canSwipeLeft = true
  const hasDesktopActions = canReply || canEdit || canDelete || canCopy || canReact
  const emojiList = Array.isArray(reactionEmojis) && reactionEmojis.length
    ? reactionEmojis
    : CHAT_REACTION_EMOJIS

  canReplyRef.current = canReply
  canSwipeLeftRef.current = canSwipeLeft
  onReplyRef.current = onReply
  copyTextRef.current = copyText
  onCopyRef.current = onCopy

  const applyOffset = (next) => {
    offsetRef.current = next
    setOffset(next)
  }

  const setActions = (open) => {
    actionsOpenRef.current = open
    setActionsOpen(open)
  }

  const reset = () => {
    applyOffset(0)
    locking.current = null
    setDragging(false)
  }

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }

  const runCopy = async () => {
    const ok = await copyTextToClipboard(copyTextRef.current)
    if (!ok) {
      setCopiedFlash(false)
      onCopyRef.current?.(false)
      return
    }
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
    setCopiedFlash(true)
    window.setTimeout(() => setCopiedFlash(false), 700)
    onCopyRef.current?.(true)
  }

  const openDesktopActions = () => {
    if (swipeMode || !hasDesktopActions) return
    clearLeaveTimer()
    setDesktopOpen(true)
  }

  const scheduleCloseDesktopActions = () => {
    if (swipeMode) return
    clearLeaveTimer()
    leaveTimer.current = window.setTimeout(() => {
      setDesktopOpen(false)
      leaveTimer.current = null
    }, HOVER_LEAVE_MS)
  }

  const openActionMenu = (options = {}) => {
    const immediate = Boolean(options.immediate)
    if (immediate) {
      suppressMenuDismissUntil.current = 0
      setMenuArmed(true)
      haptic('menu')
    } else {
      suppressMenuDismissUntil.current = Date.now() + MENU_DISMISS_GUARD_MS
      setMenuArmed(false)
      haptic('longpress')
    }
    setMenuOpen(true)
    setActions(false)
    applyOffset(0)
    setDragging(false)
    if (!swipeMode) setDesktopOpen(true)
  }

  const closeActionMenu = () => {
    if (!menuArmed) return
    setMenuOpen(false)
    setMenuArmed(false)
    setSoonNote('')
  }

  const openActionMenuRef = useRef(() => {})
  openActionMenuRef.current = openActionMenu

  const quickReaction = String(defaultReaction || CHAT_DEFAULT_REACTION).trim() || CHAT_DEFAULT_REACTION

  // Mirror the animation to the other participant.
  const announceEffect = (payload) => {
    try {
      onEffect?.(payload)
    } catch {
      /* broadcast is best-effort */
    }
  }

  const pickReaction = (emoji, mode = 'toggle') => {
    setMenuOpen(false)
    setMenuArmed(false)
    setActions(false)
    reset()
    if (emoji === quickReaction && (mode === 'increment' || mode === 'set')) {
      triggerFlowerRain({ count: 26, emoji: quickReaction })
      announceEffect({ kind: 'flower', emoji: quickReaction })
    } else if (emoji === CHAT_PARTY_REACTION && (mode === 'increment' || mode === 'set')) {
      triggerPartyBurst({ count: 24 })
      announceEffect({ kind: 'party' })
    }
    window.setTimeout(() => {
      try {
        onReact?.(emoji, { mode })
      } catch {
        /* parent handles */
      }
    }, 0)
  }

  const playEmotionMoment = (moment) => {
    setMenuOpen(false)
    setMenuArmed(false)
    setActions(false)
    reset()
    haptic('longpress')
    // Let the action menu unmount first so the moment sits above the chat.
    window.setTimeout(() => {
      triggerEmotionMoment(moment.id)
      announceEffect({ kind: 'moment', momentId: moment.id })
      if (moment.reaction && canReact) {
        try {
          onReact?.(moment.reaction, { mode: 'set' })
        } catch {
          /* parent handles */
        }
      }
    }, 40)
  }

  const handleFlowerTap = (origin) => {
    triggerFlowerRain({
      x: origin?.x,
      y: origin?.y,
      count: 30,
      emoji: quickReaction,
    })
    announceEffect({ kind: 'flower', emoji: quickReaction })
    window.setTimeout(() => {
      try {
        onReact?.(quickReaction, { mode: 'increment' })
      } catch {
        /* ignore */
      }
    }, 0)
  }

  const runMenuAction = (actionId) => {
    setMenuOpen(false)
    setMenuArmed(false)
    setSoonNote('')
    reset()
    window.setTimeout(() => {
      try {
        if (actionId === 'copy') {
          void runCopy()
          return
        }
        if (actionId === 'reply') {
          onReply?.()
          return
        }
        if (actionId === 'edit') {
          onEdit?.()
          return
        }
        if (actionId === 'delete') {
          onDelete?.()
          return
        }
        const handled = onMenuAction?.(actionId)
        if (!handled) {
          setSoonNote('準備中です')
          window.setTimeout(() => setSoonNote(''), 1400)
        }
      } catch {
        setSoonNote('操作に失敗しました')
        window.setTimeout(() => setSoonNote(''), 1600)
      }
    }, 0)
  }

  useEffect(() => () => {
    clearLeaveTimer()
  }, [])

  // Fixed center menu via portal — always fully visible regardless of bubble position.
  useEffect(() => {
    if (!menuOpen) {
      setMenuArmed(false)
      return undefined
    }
    const armTimer = window.setTimeout(() => {
      setMenuArmed(true)
      suppressMenuDismissUntil.current = 0
    }, MENU_ARM_MS)
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setMenuArmed(false)
        setSoonNote('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(armTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!swipeMode) {
      applyOffset(0)
      setActions(false)
      locking.current = null
      setDragging(false)
    } else {
      setDesktopOpen(false)
      clearLeaveTimer()
    }
  }, [swipeMode])

  // Unified touch: long-press opens menu; horizontal swipe for reply / menu.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let pressTimer = null
    let originX = 0
    let originY = 0
    let tracking = false
    let openedByPress = false

    const clearPress = () => {
      if (pressTimer != null) {
        window.clearTimeout(pressTimer)
        pressTimer = null
      }
      root.classList.remove('is-long-pressing')
    }

    const clampOffset = (dx) => {
      let next = dx
      if (next > 0 && !canReplyRef.current) next = 0
      if (next < 0 && !canSwipeLeftRef.current) next = 0
      return Math.max(MAX_LEFT, Math.min(MAX_RIGHT, next))
    }

    const fireMenu = (options = {}) => {
      openedByPress = true
      longPressFired.current = true
      suppressClickRef.current = true
      locking.current = 'hold'
      setActions(false)
      applyOffset(0)
      setDragging(false)
      clearPress()
      root.classList.add('is-press-ack')
      window.setTimeout(() => root.classList.remove('is-press-ack'), 280)
      openActionMenuRef.current(options)
    }

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return
      if (isIgnoredPressTarget(event.target)) return
      const touch = event.touches[0]
      tracking = true
      openedByPress = false
      originX = touch.clientX
      originY = touch.clientY
      startX.current = touch.clientX
      startY.current = touch.clientY
      locking.current = null
      longPressFired.current = false
      activeTouchId.current = touch.identifier
      if (actionsOpenRef.current) {
        setActions(false)
        applyOffset(0)
      }
      clearPress()
      root.classList.add('is-long-pressing')
      pressTimer = window.setTimeout(() => {
        pressTimer = null
        fireMenu()
      }, LONG_PRESS_MS)
    }

    const onTouchMove = (event) => {
      if (!tracking) return
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (activeTouchId.current != null && touch.identifier !== activeTouchId.current) return

      const dx = touch.clientX - originX
      const dy = touch.clientY - originY

      // Menu already open — the gesture belongs to the menu, not the scroller.
      if (longPressFired.current || locking.current === 'hold') {
        event.preventDefault()
        return
      }

      // Never preventDefault while merely waiting for the long press: doing so
      // cancels the browser's scroll gesture and the list becomes hard to drag.
      if (pressTimer && (Math.abs(dx) > PRESS_CANCEL_MOVE_PX || Math.abs(dy) > PRESS_CANCEL_MOVE_PX)) {
        clearPress()
      }

      if (!swipeMode) return

      const swipeDx = touch.clientX - startX.current
      const swipeDy = touch.clientY - startY.current

      if (!locking.current) {
        if (Math.abs(swipeDx) < AXIS_LOCK_PX && Math.abs(swipeDy) < AXIS_LOCK_PX) return
        locking.current = Math.abs(swipeDx) > Math.abs(swipeDy) * HORIZONTAL_DOMINANCE ? 'h' : 'v'
        if (locking.current === 'h') {
          clearPress()
          setDragging(true)
        } else {
          // Vertical scroll: stop tracking so nothing fights the scroller.
          clearPress()
          tracking = false
          activeTouchId.current = null
          return
        }
      }

      if (locking.current !== 'h') return
      if (event.cancelable) event.preventDefault()
      applyOffset(clampOffset(swipeDx))
    }

    const finishTouch = () => {
      clearPress()
      tracking = false
      activeTouchId.current = null

      if (openedByPress || longPressFired.current || locking.current === 'hold') {
        openedByPress = false
        window.setTimeout(() => {
          longPressFired.current = false
          if (locking.current === 'hold') locking.current = null
        }, MENU_DISMISS_GUARD_MS)
        setDragging(false)
        applyOffset(0)
        return
      }

      if (swipeMode && locking.current === 'h') {
        const current = offsetRef.current
        // Any committed horizontal swipe should not also fire the image tap.
        if (Math.abs(current) > 8) suppressClickRef.current = true
        if (current >= REPLY_THRESHOLD && canReplyRef.current) {
          onReplyRef.current?.()
          haptic('reply')
          setActions(false)
          reset()
          return
        }
        if (current <= -ACTION_THRESHOLD && canSwipeLeftRef.current) {
          fireMenu({ immediate: true })
          locking.current = null
          setDragging(false)
          applyOffset(0)
          return
        }
      }
      if (!actionsOpenRef.current) reset()
      else {
        applyOffset(MAX_LEFT + 12)
        setDragging(false)
        locking.current = null
      }
    }

    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', finishTouch, { passive: true })
    root.addEventListener('touchcancel', finishTouch, { passive: true })
    const onClickCapture = (event) => {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }
    root.addEventListener('click', onClickCapture, true)
    return () => {
      clearPress()
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', finishTouch)
      root.removeEventListener('touchcancel', finishTouch)
      root.removeEventListener('click', onClickCapture, true)
    }
  }, [swipeMode])

  // Desktop: right-click + mouse long-press → action menu.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const fireMenu = () => {
      longPressFired.current = true
      suppressClickRef.current = true
      locking.current = 'hold'
      setActions(false)
      applyOffset(0)
      setDragging(false)
      root.classList.add('is-press-ack')
      window.setTimeout(() => root.classList.remove('is-press-ack'), 280)
      openActionMenuRef.current()
      window.setTimeout(() => {
        longPressFired.current = false
        if (locking.current === 'hold') locking.current = null
      }, MENU_DISMISS_GUARD_MS)
    }

    const onContextMenu = (event) => {
      if (isIgnoredPressTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      fireMenu()
    }

    let mouseTimer = null
    let origin = { x: 0, y: 0 }
    const clearMouse = () => {
      if (mouseTimer != null) {
        window.clearTimeout(mouseTimer)
        mouseTimer = null
      }
    }
    const onMouseDown = (event) => {
      if (swipeMode) return
      if (event.button !== 0) return
      if (isIgnoredPressTarget(event.target)) return
      if (event.sourceCapabilities?.firesTouchEvents) return
      origin = { x: event.clientX, y: event.clientY }
      clearMouse()
      mouseTimer = window.setTimeout(() => {
        mouseTimer = null
        fireMenu()
      }, LONG_PRESS_MS)
    }
    const onMouseMove = (event) => {
      if (!mouseTimer) return
      const dx = event.clientX - origin.x
      const dy = event.clientY - origin.y
      if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
        clearMouse()
      }
    }
    const onMouseUp = () => clearMouse()

    root.addEventListener('contextmenu', onContextMenu)
    root.addEventListener('mousedown', onMouseDown)
    root.addEventListener('mousemove', onMouseMove)
    root.addEventListener('mouseup', onMouseUp)
    root.addEventListener('mouseleave', onMouseUp)
    return () => {
      clearMouse()
      root.removeEventListener('contextmenu', onContextMenu)
      root.removeEventListener('mousedown', onMouseDown)
      root.removeEventListener('mousemove', onMouseMove)
      root.removeEventListener('mouseup', onMouseUp)
      root.removeEventListener('mouseleave', onMouseUp)
    }
  }, [swipeMode])

  const flowerCount = reactionTotal(reactions?.[quickReaction])
  const showFlowerFab = Boolean(showFlowerReact || flowerCount > 0)
  const modeClass = swipeMode ? 'is-touch' : 'is-desktop'
  const desktopClass = !swipeMode && desktopOpen ? ' is-desktop-open' : ''
  const copiedClass = copiedFlash ? ' is-copied' : ''
  const menuClass = menuOpen ? ' is-menu-open' : ''
  const draggingClass = dragging ? ' is-dragging' : ''
  const replyReady = offset >= REPLY_THRESHOLD
  const actionReady = offset <= -ACTION_THRESHOLD
  const showReplyHint = swipeMode && canReply && offset > 8
  const showActionHint = swipeMode && canSwipeLeft && (offset < -8 || actionsOpen)

  const menuPortal = menuOpen
    ? createPortal(
      <div
        className={`chat-msg-menu-overlay${menuArmed ? ' is-armed' : ' is-arming'}`}
        role="presentation"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) event.preventDefault()
        }}
        onClick={(event) => {
          if (!menuArmed) return
          if (Date.now() < suppressMenuDismissUntil.current) return
          if (event.target === event.currentTarget) closeActionMenu()
        }}
      >
        <div
          className="chat-msg-menu is-fixed"
          role="dialog"
          aria-modal="true"
          aria-label="メッセージメニュー"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <div className="chat-msg-menu-reacts" role="listbox" aria-label="リアクション">
            {emojiList.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`chat-msg-menu-react${emoji === quickReaction ? ' is-default' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickReaction(emoji, emoji === quickReaction ? 'increment' : 'set')}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="chat-msg-menu-moments" role="group" aria-label="スペシャルエフェクト">
            <p className="chat-msg-menu-moments-label">スペシャル</p>
            <div className="chat-msg-menu-moments-row">
              {EMOTION_MOMENTS.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  className={`chat-msg-menu-moment is-${moment.theme}`}
                  title={moment.label}
                  aria-label={moment.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => playEmotionMoment(moment)}
                >
                  <span className="chat-msg-menu-moment-emoji" aria-hidden="true">{moment.emoji}</span>
                  <span className="chat-msg-menu-moment-text">{moment.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="chat-msg-menu-actions">
            {canCopy ? (
              <button
                type="button"
                className="chat-msg-menu-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runMenuAction('copy')}
              >
                <span className="chat-msg-menu-icon" aria-hidden="true">📋</span>
                <span>コピー</span>
              </button>
            ) : null}
            {canReply ? (
              <button
                type="button"
                className="chat-msg-menu-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runMenuAction('reply')}
              >
                <span className="chat-msg-menu-icon" aria-hidden="true">↩️</span>
                <span>返信</span>
              </button>
            ) : null}
            {MENU_EXTRA_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="chat-msg-menu-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runMenuAction(action.id)}
              >
                <span className="chat-msg-menu-icon" aria-hidden="true">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
            {canEdit ? (
              <button
                type="button"
                className="chat-msg-menu-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runMenuAction('edit')}
              >
                <span className="chat-msg-menu-icon" aria-hidden="true">✏️</span>
                <span>編集</span>
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                className="chat-msg-menu-action is-danger"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runMenuAction('delete')}
              >
                <span className="chat-msg-menu-icon" aria-hidden="true">🗑️</span>
                <span>削除</span>
              </button>
            ) : null}
          </div>
          {soonNote ? <p className="chat-msg-menu-note" role="status">{soonNote}</p> : null}
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div
      ref={rootRef}
      className={`chat-swipe ${modeClass}${desktopClass}${actionsOpen ? ' is-actions' : ''}${menuClass}${copiedClass}${draggingClass}${className ? ` ${className}` : ''}`}
      onMouseEnter={openDesktopActions}
      onMouseLeave={scheduleCloseDesktopActions}
    >
      <div className="chat-swipe-track">
        {swipeMode && canReply ? (
          <div
            className={`chat-swipe-hint is-reply${showReplyHint ? ' is-visible' : ''}${replyReady ? ' is-ready' : ''}`}
            aria-hidden="true"
          >
            <span className="chat-swipe-hint-icon">
              <IconReply />
            </span>
          </div>
        ) : null}
        {swipeMode && canSwipeLeft ? (
          <div
            className={`chat-swipe-hint is-actions-hint${showActionHint ? ' is-visible' : ''}${actionReady || actionsOpen ? ' is-ready' : ''}`}
            aria-hidden="true"
          >
            <span className="chat-swipe-hint-icon">
              <IconMore />
            </span>
          </div>
        ) : null}

        <div
          className="chat-swipe-sheet"
          style={swipeMode ? { transform: `translateX(${offset}px)` } : undefined}
        >
          <div className={`chat-swipe-bubble-wrap${showFlowerFab ? ' has-flower' : ''}`}>
            {children}
            {showFlowerFab ? (
              <FlowerReactionButton
                emoji={quickReaction}
                total={flowerCount}
                mine={reactionMine(reactions?.[quickReaction], reactorId)}
                disabled={!canReact}
                onTap={canReact ? handleFlowerTap : undefined}
                onLongPress={openActionMenu}
              />
            ) : null}
          </div>
          {canReact || (reactions && Object.keys(reactions).length > 0) ? (
            <ChatReactionChips
              reactions={reactions}
              reactorId={reactorId}
              defaultReaction={quickReaction}
              // When the corner flower FAB is hidden (e.g. own message),
              // still show default reaction chips so taps are visible.
              includeDefaultReaction={!showFlowerFab}
              disabled={!canReact}
              onToggle={canReact ? (emoji) => {
                if (
                  emoji === CHAT_PARTY_REACTION
                  && !reactionMine(reactions?.[CHAT_PARTY_REACTION], reactorId)
                ) {
                  triggerPartyBurst({ count: 20 })
                  announceEffect({ kind: 'party' })
                }
                onReact?.(emoji, { mode: 'toggle' })
              } : undefined}
            />
          ) : null}
          {!swipeMode && hasDesktopActions ? (
            <div className="chat-desktop-actions" role="toolbar" aria-label="メッセージ操作">
              <button
                type="button"
                className={`chat-desktop-action is-react${menuOpen ? ' is-active' : ''}`}
                title="メニュー"
                aria-label="メニュー"
                aria-expanded={menuOpen}
                onClick={() => {
                  clearLeaveTimer()
                  setMenuOpen((open) => !open)
                }}
              >
                <IconReact />
              </button>
              {canCopy ? (
                <button
                  type="button"
                  className="chat-desktop-action is-copy"
                  title="コピー"
                  aria-label="コピー"
                  onClick={() => { void runCopy() }}
                >
                  <IconCopy />
                </button>
              ) : null}
              {canReply ? (
                <button
                  type="button"
                  className="chat-desktop-action is-reply"
                  title="返信"
                  aria-label="返信"
                  onClick={() => onReply?.()}
                >
                  <IconReply />
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="chat-desktop-action is-edit"
                  title="編集"
                  aria-label="編集"
                  onClick={() => onEdit?.()}
                >
                  <IconEdit />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="chat-desktop-action is-delete"
                  title="削除"
                  aria-label="削除"
                  onClick={() => onDelete?.()}
                >
                  <IconDelete />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {menuPortal}
    </div>
  )
}

export const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000

export function canMutateOwnMessage(message, nowOrOptions = Date.now()) {
  const options = typeof nowOrOptions === 'number'
    ? { now: nowOrOptions }
    : (nowOrOptions || {})
  const now = options.now ?? Date.now()
  const unreadByPartner = Boolean(options.unreadByPartner)
  const windowMs = options.windowMs == null
    ? MESSAGE_EDIT_WINDOW_MS
    : Number(options.windowMs)

  if (!message?.createdAt || message.deleted) return false
  // Partner has not read yet → edit/delete freely.
  if (unreadByPartner) return true
  // Unlimited after-read window (admin setting = 0 minutes).
  if (!Number.isFinite(windowMs) || windowMs === Infinity) return true
  if (windowMs <= 0) return true
  const created = new Date(message.createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now - created <= windowMs
}

/** Other reactions under a bubble (flower FAB is separate on the bubble corner). */
export function ChatReactionChips({
  reactions = {},
  reactorId = '',
  onToggle,
  defaultReaction = CHAT_DEFAULT_REACTION,
  includeDefaultReaction = false,
  disabled = false,
}) {
  const rid = String(reactorId || '').trim().toLowerCase()
  const exclude = String(defaultReaction || CHAT_DEFAULT_REACTION).trim() || CHAT_DEFAULT_REACTION
  const otherEntries = Object.entries(reactions || {}).filter(([emoji, counts]) => {
    if (!includeDefaultReaction && emoji === exclude) return false
    return reactionTotal(counts) > 0
  })

  if (!otherEntries.length) return null

  const stopBubble = (event) => {
    event.stopPropagation()
  }

  return (
    <div
      className="hana-chat-reactions"
      role="group"
      aria-label="リアクション"
      onPointerDown={stopBubble}
      onPointerMove={stopBubble}
      onPointerUp={stopBubble}
      onTouchStart={stopBubble}
    >
      {otherEntries.map(([emoji, counts]) => {
        const total = reactionTotal(counts)
        const mine = reactionMine(counts, rid)
        return (
          <button
            key={emoji}
            type="button"
            className={`hana-chat-reaction${mine ? ' is-mine' : ''}${emoji === exclude ? ' is-flower-chip' : ''}`}
            disabled={disabled || !onToggle}
            aria-pressed={mine > 0}
            title={mine ? 'リアクションを取り消す' : 'リアクションする'}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              event.preventDefault()
              stopBubble(event)
            }}
            onClick={() => onToggle?.(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
            {total > 1 ? <span className="hana-chat-reaction-count">{total}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function FlowerReactionButton({ emoji = CHAT_DEFAULT_REACTION, total = 0, mine = 0, disabled = false, onTap, onLongPress }) {
  const timerRef = useRef(null)
  const bloomTimerRef = useRef(null)
  const longRef = useRef(false)
  const originRef = useRef({ x: 0, y: 0 })
  const [blooming, setBlooming] = useState(false)
  const filled = mine > 0 || total > 0

  const clear = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => {
    clear()
    if (bloomTimerRef.current != null) window.clearTimeout(bloomTimerRef.current)
  }, [])

  const playBloom = () => {
    setBlooming(true)
    if (bloomTimerRef.current != null) window.clearTimeout(bloomTimerRef.current)
    bloomTimerRef.current = window.setTimeout(() => {
      bloomTimerRef.current = null
      setBlooming(false)
    }, 560)
  }

  return (
    <button
      type="button"
      className={`hana-chat-flower-fab${filled ? ' is-filled' : ' is-outline'}${mine ? ' is-mine' : ''}${blooming ? ' is-bloom' : ''}`}
      disabled={disabled}
      data-no-bubble-press="true"
      aria-label="クイックリアクション"
      title={`タップで${emoji} / 長押しでメニュー`}
      onPointerDown={(event) => {
        // Keep the soft keyboard open — don't let this button steal focus from the composer.
        event.preventDefault()
        event.stopPropagation()
        if (disabled) return
        if (event.pointerType === 'mouse' && event.button !== 0) return
        originRef.current = { x: event.clientX, y: event.clientY }
        longRef.current = false
        clear()
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          longRef.current = true
          onLongPress?.()
        }, LONG_PRESS_MS)
      }}
      onPointerMove={(event) => {
        if (!timerRef.current) return
        const dx = event.clientX - originRef.current.x
        const dy = event.clientY - originRef.current.y
        if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
          clear()
        }
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const wasLong = longRef.current
        clear()
        if (!wasLong) {
          playBloom()
          onTap?.({ x: event.clientX, y: event.clientY })
        }
        longRef.current = false
      }}
      onPointerCancel={() => {
        clear()
        longRef.current = false
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        clear()
        longRef.current = true
        onLongPress?.()
      }}
    >
      <span className="hana-chat-flower-fab-icon" aria-hidden="true">{emoji}</span>
      {total > 1 ? <span className="hana-chat-reaction-badge">{total}</span> : null}
    </button>
  )
}

export default memo(ChatSwipeBubble)
