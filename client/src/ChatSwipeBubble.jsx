import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    CHAT_DEFAULT_REACTION,
    CHAT_REACTION_EMOJIS,
    reactionMine,
    reactionTotal,
} from './firebase'

const REPLY_THRESHOLD = 52
const ACTION_THRESHOLD = 56
const MAX_RIGHT = 72
const MAX_LEFT = -108
const HOVER_LEAVE_MS = 180
const LONG_PRESS_MS = 380
const LONG_PRESS_MOVE_PX = 14
const MENU_DISMISS_GUARD_MS = 700
const AXIS_LOCK_PX = 8

const MENU_EXTRA_ACTIONS = [
  { id: 'pin', label: 'ピン', icon: '📌' },
  { id: 'forward', label: '転送', icon: '↪️' },
  { id: 'saveDoc', label: '保存', icon: '📄' },
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
    // Keep in-viewport; iOS often rejects off-screen / display:none nodes.
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

  // Prefer sync legacy first — works inside touchend user-gesture on iOS.
  if (legacyCopy()) return true

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* retry legacy below */
  }

  return legacyCopy()
}

function useTouchSwipeMode() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setEnabled(!media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return enabled
}

/**
 * Touch: swipe-right → reply, swipe-left → actions, long-press → copy.
 * Desktop: hover icon toolbar (react / reply / edit / delete / copy).
 */
export default function ChatSwipeBubble({
  className = '',
  canReply = true,
  canEdit = false,
  canDelete = false,
  canReact = false,
  showFlowerReact = false,
  reactions = null,
  reactorId = '',
  reactionEmojis = CHAT_REACTION_EMOJIS,
  copyText = '',
  onCopy,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onMenuAction,
  children,
}) {
  const swipeMode = useTouchSwipeMode()
  const rootRef = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const locking = useRef(null) // 'h' | 'v' | 'hold' | null
  const offsetRef = useRef(0)
  const actionsOpenRef = useRef(false)
  const leaveTimer = useRef(null)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const suppressMenuDismissUntil = useRef(0)
  const activeTouchId = useRef(null)
  const canReplyRef = useRef(canReply)
  const canSwipeLeftRef = useRef(false)
  const canCopyRef = useRef(false)
  const onReplyRef = useRef(onReply)
  const copyTextRef = useRef(copyText)
  const onCopyRef = useRef(onCopy)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuDismissArmed, setMenuDismissArmed] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [soonNote, setSoonNote] = useState('')

  const canCopy = Boolean(String(copyText || '').trim())
  const canSwipeLeft = canEdit || canDelete || canReact || canCopy
  const hasDesktopActions = canReply || canEdit || canDelete || canCopy || canReact
  const emojiList = Array.isArray(reactionEmojis) && reactionEmojis.length
    ? reactionEmojis
    : CHAT_REACTION_EMOJIS

  canReplyRef.current = canReply
  canSwipeLeftRef.current = canSwipeLeft
  canCopyRef.current = canCopy
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

  const clearLongPressTimer = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
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
      setMenuOpen(false)
      leaveTimer.current = null
    }, HOVER_LEAVE_MS)
  }

  const openActionMenu = (options = {}) => {
    const immediate = Boolean(options.immediate)
    if (immediate) {
      suppressMenuDismissUntil.current = 0
      setMenuDismissArmed(true)
    } else {
      // Ignore the synthetic click / lift that follows a long-press so the modal stays open.
      suppressMenuDismissUntil.current = Date.now() + MENU_DISMISS_GUARD_MS
      setMenuDismissArmed(false)
    }
    setMenuOpen(true)
    setActions(false)
    applyOffset(0)
    setDragging(false)
    if (!swipeMode) setDesktopOpen(true)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
  }

  const closeActionMenu = () => {
    if (!menuDismissArmed) return
    setMenuOpen(false)
    setMenuDismissArmed(false)
    setSoonNote('')
  }

  const openActionMenuRef = useRef(() => {})
  openActionMenuRef.current = openActionMenu

  const pickReaction = (emoji, mode = 'toggle') => {
    setMenuOpen(false)
    setActions(false)
    reset()
    // Defer so the portal unmounts before parent async work / state updates.
    window.setTimeout(() => {
      try {
        onReact?.(emoji, { mode })
      } catch {
        /* parent handles async errors */
      }
    }, 0)
  }

  const handleFlowerTap = () => {
    window.setTimeout(() => {
      try {
        onReact?.(CHAT_DEFAULT_REACTION, { mode: 'increment' })
      } catch {
        /* ignore */
      }
    }, 0)
  }

  const runMenuAction = (actionId) => {
    setMenuOpen(false)
    setSoonNote('')
    reset()
    window.setTimeout(() => {
      try {
        if (actionId === 'copy') {
          void handleCopy()
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

  const handleCopy = async () => {
    await runCopy()
  }

  useEffect(() => () => {
    clearLeaveTimer()
    clearLongPressTimer()
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      setMenuDismissArmed(false)
      return undefined
    }
    const armTimer = window.setTimeout(() => {
      setMenuDismissArmed(true)
      suppressMenuDismissUntil.current = 0
    }, MENU_DISMISS_GUARD_MS)
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setMenuDismissArmed(false)
        setSoonNote('')
      }
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(armTimer)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!swipeMode) {
      applyOffset(0)
      setActions(false)
      locking.current = null
      setDragging(false)
      clearLongPressTimer()
    } else {
      setDesktopOpen(false)
      clearLeaveTimer()
    }
  }, [swipeMode])

  // Long-press (touch) / context-menu (desktop) → action modal.
  // Touch-based on purpose: iOS cancels PointerEvents during selection/scroll.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let pressTimer = null
    let originX = 0
    let originY = 0
    let tracking = false
    let openedByPress = false

    const isIgnoredTarget = (target) => (
      target instanceof Element
      && Boolean(target.closest('button, a, textarea, input, [data-no-bubble-press]'))
    )

    const clearPress = () => {
      if (pressTimer != null) {
        window.clearTimeout(pressTimer)
        pressTimer = null
      }
      root.classList.remove('is-long-pressing')
    }

    const fireMenu = () => {
      openedByPress = true
      longPressFired.current = true
      locking.current = 'hold'
      setActions(false)
      applyOffset(0)
      setDragging(false)
      openActionMenuRef.current()
      try {
        navigator.vibrate?.(16)
      } catch {
        /* ignore */
      }
    }

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return
      if (isIgnoredTarget(event.target)) return
      const touch = event.touches[0]
      tracking = true
      openedByPress = false
      originX = touch.clientX
      originY = touch.clientY
      clearPress()
      longPressFired.current = false
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
      const dx = touch.clientX - originX
      const dy = touch.clientY - originY
      const moved = Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX

      // While finger is still (pending long-press), block scroll from stealing the gesture.
      if (pressTimer && !moved) {
        event.preventDefault()
        return
      }

      if (pressTimer && moved) {
        clearPress()
        tracking = false
      }
    }

    const onTouchEnd = () => {
      clearPress()
      tracking = false
      if (openedByPress) {
        openedByPress = false
        window.setTimeout(() => {
          longPressFired.current = false
          if (locking.current === 'hold') locking.current = null
        }, MENU_DISMISS_GUARD_MS)
      }
    }

    const onContextMenu = (event) => {
      if (isIgnoredTarget(event.target)) return
      event.preventDefault()
      clearPress()
      fireMenu()
    }

    // Mouse long-press for desktop (no reliable touch).
    let mouseTimer = null
    const clearMouse = () => {
      if (mouseTimer != null) {
        window.clearTimeout(mouseTimer)
        mouseTimer = null
      }
    }
    const onMouseDown = (event) => {
      if (event.button !== 0) return
      if (isIgnoredTarget(event.target)) return
      // Touch devices also synthesize mouse events — ignore those.
      if (event.sourceCapabilities?.firesTouchEvents) return
      clearMouse()
      mouseTimer = window.setTimeout(() => {
        mouseTimer = null
        fireMenu()
      }, LONG_PRESS_MS)
    }
    const onMouseUp = () => clearMouse()

    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd, { passive: true })
    root.addEventListener('touchcancel', onTouchEnd, { passive: true })
    root.addEventListener('contextmenu', onContextMenu)
    root.addEventListener('mousedown', onMouseDown)
    root.addEventListener('mouseup', onMouseUp)
    root.addEventListener('mouseleave', onMouseUp)
    return () => {
      clearPress()
      clearMouse()
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchEnd)
      root.removeEventListener('contextmenu', onContextMenu)
      root.removeEventListener('mousedown', onMouseDown)
      root.removeEventListener('mouseup', onMouseUp)
      root.removeEventListener('mouseleave', onMouseUp)
    }
  }, [])

  // Native non-passive touch listeners for reliable left/right swipe on mobile.
  useEffect(() => {
    if (!swipeMode) return undefined
    const root = rootRef.current
    if (!root) return undefined

    const clampOffset = (dx) => {
      let next = dx
      if (next > 0 && !canReplyRef.current) next = 0
      if (next < 0 && !canSwipeLeftRef.current) next = 0
      return Math.max(MAX_LEFT, Math.min(MAX_RIGHT, next))
    }

    const openMenuFromGesture = () => {
      openActionMenuRef.current()
    }

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return
      const target = event.target
      if (target instanceof Element && target.closest('button, a, textarea, input, [data-no-bubble-press]')) {
        return
      }
      const touch = event.touches[0]
      startX.current = touch.clientX
      startY.current = touch.clientY
      locking.current = null
      longPressFired.current = false
      activeTouchId.current = touch.identifier
      if (actionsOpenRef.current) {
        setActions(false)
        applyOffset(0)
      }
    }

    const onTouchMove = (event) => {
      if (longPressFired.current || locking.current === 'hold') return
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (activeTouchId.current != null && touch.identifier !== activeTouchId.current) return

      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current

      if (!locking.current) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        locking.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        if (locking.current === 'h') setDragging(true)
      }

      if (locking.current !== 'h') return
      event.preventDefault()
      applyOffset(clampOffset(dx))
    }

    const finishTouch = () => {
      activeTouchId.current = null
      if (longPressFired.current || locking.current === 'hold') {
        locking.current = null
        setDragging(false)
        applyOffset(0)
        return
      }
      if (locking.current === 'h') {
        const current = offsetRef.current
        if (current >= REPLY_THRESHOLD && canReplyRef.current) {
          onReplyRef.current?.()
          try {
            navigator.vibrate?.(10)
          } catch {
            /* ignore */
          }
          setActions(false)
          reset()
          return
        }
        if (current <= -ACTION_THRESHOLD && canSwipeLeftRef.current) {
          openMenuFromGesture()
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
    return () => {
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', finishTouch)
      root.removeEventListener('touchcancel', finishTouch)
    }
  }, [swipeMode])

  const modeClass = swipeMode ? 'is-touch' : 'is-desktop'
  const desktopClass = !swipeMode && desktopOpen ? ' is-desktop-open' : ''
  const copiedClass = copiedFlash ? ' is-copied' : ''
  const menuClass = menuOpen ? ' is-menu-open' : ''
  const draggingClass = dragging ? ' is-dragging' : ''
  const replyReady = offset >= REPLY_THRESHOLD
  const actionReady = offset <= -ACTION_THRESHOLD
  const showReplyHint = swipeMode && canReply && offset > 8
  const showActionHint = swipeMode && canSwipeLeft && (offset < -8 || actionsOpen)

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
          <div className={`chat-swipe-bubble-wrap${canReact && showFlowerReact ? ' has-flower' : ''}`}>
            {children}
            {canReact && showFlowerReact ? (
              <FlowerReactionButton
                total={reactionTotal(reactions?.[CHAT_DEFAULT_REACTION])}
                mine={reactionMine(reactions?.[CHAT_DEFAULT_REACTION], reactorId)}
                onTap={handleFlowerTap}
                onLongPress={openActionMenu}
              />
            ) : null}
            <button
              type="button"
              className="chat-bubble-menu-btn"
              data-no-bubble-press="true"
              aria-label="メニュー"
              title="メニュー"
              onPointerUp={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openActionMenu({ immediate: true })
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openActionMenu({ immediate: true })
              }}
            >
              <IconMore />
            </button>
          </div>
          {canReact || (reactions && Object.keys(reactions).length > 0) ? (
            <ChatReactionChips
              reactions={reactions}
              reactorId={reactorId}
              includeDefaultReaction={!showFlowerReact}
              disabled={!canReact}
              onToggle={canReact ? (emoji) => onReact?.(emoji, { mode: 'toggle' }) : undefined}
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
                  onClick={() => { void handleCopy() }}
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

      {menuOpen
        ? createPortal(
          <div
            className={`chat-msg-menu-overlay${menuDismissArmed ? ' is-armed' : ' is-arming'}`}
            role="presentation"
            onClick={(event) => {
              if (!menuDismissArmed) return
              if (event.target === event.currentTarget) closeActionMenu()
            }}
          >
            <div
              className="chat-msg-menu is-modal"
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
                    className={`chat-msg-menu-react${emoji === CHAT_DEFAULT_REACTION ? ' is-default' : ''}`}
                    onClick={() => pickReaction(emoji, emoji === CHAT_DEFAULT_REACTION ? 'increment' : 'set')}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="chat-msg-menu-actions">
                {canCopy ? (
                  <button type="button" className="chat-msg-menu-action" onClick={() => runMenuAction('copy')}>
                    <span className="chat-msg-menu-icon" aria-hidden="true">📋</span>
                    <span>コピー</span>
                  </button>
                ) : null}
                {canReply ? (
                  <button type="button" className="chat-msg-menu-action" onClick={() => runMenuAction('reply')}>
                    <span className="chat-msg-menu-icon" aria-hidden="true">↩️</span>
                    <span>返信</span>
                  </button>
                ) : null}
                {MENU_EXTRA_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="chat-msg-menu-action"
                    onClick={() => runMenuAction(action.id)}
                  >
                    <span className="chat-msg-menu-icon" aria-hidden="true">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
                {canEdit ? (
                  <button type="button" className="chat-msg-menu-action" onClick={() => runMenuAction('edit')}>
                    <span className="chat-msg-menu-icon" aria-hidden="true">✏️</span>
                    <span>編集</span>
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="chat-msg-menu-action is-danger" onClick={() => runMenuAction('delete')}>
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
        : null}
    </div>
  )
}

export const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000

export function canMutateOwnMessage(message, now = Date.now()) {
  if (!message?.createdAt || message.deleted) return false
  const created = new Date(message.createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now - created <= MESSAGE_EDIT_WINDOW_MS
}

/** Other reactions under a bubble (flower FAB is separate on the bubble corner). */
export function ChatReactionChips({
  reactions = {},
  reactorId = '',
  onToggle,
  includeDefaultReaction = false,
  disabled = false,
}) {
  const rid = String(reactorId || '').trim().toLowerCase()
  const otherEntries = Object.entries(reactions || {}).filter(([emoji, counts]) => {
    if (!includeDefaultReaction && emoji === CHAT_DEFAULT_REACTION) return false
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
            className={`hana-chat-reaction${mine ? ' is-mine' : ''}${emoji === CHAT_DEFAULT_REACTION ? ' is-flower-chip' : ''}`}
            disabled={disabled || !onToggle}
            aria-pressed={mine > 0}
            title={mine ? 'リアクションを取り消す' : 'リアクションする'}
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

function FlowerReactionButton({ total = 0, mine = 0, disabled = false, onTap, onLongPress }) {
  const timerRef = useRef(null)
  const longRef = useRef(false)
  const originRef = useRef({ x: 0, y: 0 })
  const filled = mine > 0 || total > 0

  const clear = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clear(), [])

  return (
    <button
      type="button"
      className={`hana-chat-flower-fab${filled ? ' is-filled' : ' is-outline'}${mine ? ' is-mine' : ''}`}
      disabled={disabled}
      data-no-bubble-press="true"
      aria-label="花のリアクション"
      title="タップで🌸 / 長押しでメニュー"
      onTouchStart={(event) => {
        event.stopPropagation()
        if (disabled || event.touches.length !== 1) return
        const touch = event.touches[0]
        originRef.current = { x: touch.clientX, y: touch.clientY }
        longRef.current = false
        clear()
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          longRef.current = true
          onLongPress?.()
          try {
            navigator.vibrate?.(10)
          } catch {
            /* ignore */
          }
        }, LONG_PRESS_MS)
      }}
      onTouchMove={(event) => {
        if (!timerRef.current || event.touches.length !== 1) return
        const touch = event.touches[0]
        const dx = touch.clientX - originRef.current.x
        const dy = touch.clientY - originRef.current.y
        if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
          clear()
        }
      }}
      onTouchEnd={(event) => {
        event.stopPropagation()
        const wasLong = longRef.current
        clear()
        if (!wasLong) onTap?.()
        longRef.current = false
      }}
      onTouchCancel={() => {
        clear()
        longRef.current = false
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        clear()
        longRef.current = true
        onLongPress?.()
      }}
      onClick={(event) => {
        // Desktop / mouse fallback (touch already handled above).
        if (event.detail === 0) return
        if ('ontouchstart' in window) return
        if (disabled) return
        onTap?.()
      }}
    >
      <span className="hana-chat-flower-fab-icon" aria-hidden="true">{CHAT_DEFAULT_REACTION}</span>
      {total > 1 ? <span className="hana-chat-reaction-badge">{total}</span> : null}
    </button>
  )
}
