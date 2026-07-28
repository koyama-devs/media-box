import { useEffect, useRef, useState } from 'react'
import { CHAT_REACTION_EMOJIS } from './firebase'

const REPLY_THRESHOLD = 52
const ACTION_THRESHOLD = 56
const MAX_RIGHT = 72
const MAX_LEFT = -108
const HOVER_LEAVE_MS = 180
const LONG_PRESS_MS = 480
const LONG_PRESS_MOVE_PX = 10
const AXIS_LOCK_PX = 8

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
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fallback below */
  }
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
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
  reactions = null,
  reactorId = '',
  reactionEmojis = CHAT_REACTION_EMOJIS,
  copyText = '',
  onCopy,
  onReply,
  onEdit,
  onDelete,
  onReact,
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
  const [reactOpen, setReactOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)

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
      setReactOpen(false)
      leaveTimer.current = null
    }, HOVER_LEAVE_MS)
  }

  const openReactPicker = () => {
    setReactOpen(true)
    setActions(false)
    if (!swipeMode) setDesktopOpen(true)
  }

  const pickReaction = (emoji) => {
    onReact?.(emoji)
    setReactOpen(false)
    setActions(false)
    reset()
  }

  const handleCopy = async () => {
    await runCopy()
  }

  useEffect(() => () => {
    clearLeaveTimer()
    clearLongPressTimer()
  }, [])

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

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      startX.current = touch.clientX
      startY.current = touch.clientY
      locking.current = null
      longPressFired.current = false
      activeTouchId.current = touch.identifier
      clearLongPressTimer()
      setReactOpen(false)
      if (actionsOpenRef.current) {
        setActions(false)
        applyOffset(0)
      }

      if (canCopyRef.current) {
        longPressTimer.current = window.setTimeout(() => {
          longPressTimer.current = null
          longPressFired.current = true
          locking.current = 'hold'
          setActions(false)
          setReactOpen(false)
          applyOffset(0)
          setDragging(false)
          void runCopy()
        }, LONG_PRESS_MS)
      }
    }

    const onTouchMove = (event) => {
      if (longPressFired.current || locking.current === 'hold') return
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (activeTouchId.current != null && touch.identifier !== activeTouchId.current) return

      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current

      if (longPressTimer.current && (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX)) {
        clearLongPressTimer()
      }

      if (!locking.current) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
        locking.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        if (locking.current === 'h') {
          clearLongPressTimer()
          setDragging(true)
        }
      }

      if (locking.current !== 'h') return
      event.preventDefault()
      applyOffset(clampOffset(dx))
    }

    const finishTouch = () => {
      clearLongPressTimer()
      activeTouchId.current = null
      if (longPressFired.current) {
        longPressFired.current = false
        reset()
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
          setActions(true)
          applyOffset(MAX_LEFT + 12)
          locking.current = null
          setDragging(false)
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
  const reactClass = reactOpen ? ' is-react-open' : ''
  const draggingClass = dragging ? ' is-dragging' : ''
  const replyReady = offset >= REPLY_THRESHOLD
  const actionReady = offset <= -ACTION_THRESHOLD
  const showReplyHint = swipeMode && canReply && offset > 8
  const showActionHint = swipeMode && canSwipeLeft && (offset < -8 || actionsOpen)

  return (
    <div
      ref={rootRef}
      className={`chat-swipe ${modeClass}${desktopClass}${actionsOpen ? ' is-actions' : ''}${reactClass}${copiedClass}${draggingClass}${className ? ` ${className}` : ''}`}
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
          {children}
          {canReact || (reactions && Object.keys(reactions).length > 0) ? (
            <ChatReactionChips
              reactions={reactions}
              reactorId={reactorId}
              disabled={!canReact}
              onToggle={canReact ? (emoji) => onReact?.(emoji) : undefined}
              onAdd={canReact ? openReactPicker : undefined}
            />
          ) : null}
          {!swipeMode && hasDesktopActions ? (
            <div className="chat-desktop-actions" role="toolbar" aria-label="メッセージ操作">
              {canReact ? (
                <button
                  type="button"
                  className={`chat-desktop-action is-react${reactOpen ? ' is-active' : ''}`}
                  title="リアクション"
                  aria-label="リアクション"
                  aria-expanded={reactOpen}
                  onClick={() => {
                    clearLeaveTimer()
                    setReactOpen((open) => !open)
                  }}
                >
                  <IconReact />
                </button>
              ) : null}
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
          {reactOpen && canReact ? (
            <div
              className="chat-react-picker"
              role="listbox"
              aria-label="リアクションを選ぶ"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
            >
              {emojiList.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="chat-react-picker-btn"
                  onClick={() => pickReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {swipeMode && actionsOpen ? (
        <div className="chat-swipe-actions">
          {canReact ? (
            <button type="button" className="chat-swipe-action is-react" onClick={openReactPicker}>
              リアクション
            </button>
          ) : null}
          {canCopy ? (
            <button type="button" className="chat-swipe-action is-copy" onClick={() => { setActions(false); reset(); void handleCopy() }}>
              コピー
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className="chat-swipe-action is-edit" onClick={() => { setActions(false); reset(); onEdit?.() }}>
              編集
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="chat-swipe-action is-delete" onClick={() => { setActions(false); reset(); onDelete?.() }}>
              削除
            </button>
          ) : null}
          <button type="button" className="chat-swipe-action is-cancel" onClick={() => { setActions(false); setReactOpen(false); reset() }}>
            ×
          </button>
        </div>
      ) : null}
      {swipeMode && reactOpen && canReact ? (
        <div className="chat-react-picker is-touch" role="listbox" aria-label="リアクションを選ぶ">
          {emojiList.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="chat-react-picker-btn"
              onClick={() => pickReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className="chat-react-picker-btn is-close"
            aria-label="閉じる"
            onClick={() => { setReactOpen(false); reset() }}
          >
            ×
          </button>
        </div>
      ) : null}
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

/** Render reaction chips under a bubble. */
export function ChatReactionChips({
  reactions = {},
  reactorId = '',
  onToggle,
  onAdd,
  disabled = false,
}) {
  const entries = Object.entries(reactions || {}).filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
  const rid = String(reactorId || '').trim().toLowerCase()
  const showAdd = typeof onAdd === 'function'

  if (!entries.length && !showAdd) return null

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
      {entries.map(([emoji, ids]) => {
        const mine = rid && ids.includes(rid)
        return (
          <button
            key={emoji}
            type="button"
            className={`hana-chat-reaction${mine ? ' is-mine' : ''}`}
            disabled={disabled || !onToggle}
            aria-pressed={mine}
            title={mine ? 'リアクションを取り消す' : 'リアクションする'}
            onClick={() => onToggle?.(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
            {ids.length > 1 ? <span className="hana-chat-reaction-count">{ids.length}</span> : null}
          </button>
        )
      })}
      {showAdd ? (
        <button
          type="button"
          className="hana-chat-reaction is-add"
          disabled={disabled}
          aria-label="リアクションを追加"
          title="リアクション"
          onClick={onAdd}
        >
          +
        </button>
      ) : null}
    </div>
  )
}
