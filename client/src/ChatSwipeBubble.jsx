import { useEffect, useRef, useState } from 'react'

const REPLY_THRESHOLD = 56
const ACTION_THRESHOLD = 72
const HOVER_LEAVE_MS = 180

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
 * Touch: swipe-right → reply, swipe-left → edit/delete.
 * Desktop: hover icon toolbar (reply / edit / delete) pinned beside the bubble.
 */
export default function ChatSwipeBubble({
  className = '',
  canReply = true,
  canEdit = false,
  canDelete = false,
  onReply,
  onEdit,
  onDelete,
  children,
}) {
  const swipeMode = useTouchSwipeMode()
  const startX = useRef(0)
  const startY = useRef(0)
  const locking = useRef(null) // 'h' | 'v' | null
  const leaveTimer = useRef(null)
  const [offset, setOffset] = useState(0)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)

  const hasDesktopActions = canReply || canEdit || canDelete

  const reset = () => {
    setOffset(0)
    locking.current = null
  }

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
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

  useEffect(() => () => clearLeaveTimer(), [])

  useEffect(() => {
    if (!swipeMode) {
      setOffset(0)
      setActionsOpen(false)
      locking.current = null
    } else {
      setDesktopOpen(false)
      clearLeaveTimer()
    }
  }, [swipeMode])

  const onPointerDown = (event) => {
    if (!swipeMode) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    startX.current = event.clientX
    startY.current = event.clientY
    locking.current = null
    setActionsOpen(false)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    if (!swipeMode) return
    if (startX.current == null) return
    const dx = event.clientX - startX.current
    const dy = event.clientY - startY.current
    if (!locking.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      locking.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (locking.current !== 'h') return
    event.preventDefault?.()
    let next = dx
    if (next > 0 && !canReply) next = 0
    if (next < 0 && !(canEdit || canDelete)) next = 0
    next = Math.max(-96, Math.min(88, next))
    setOffset(next)
  }

  const onPointerUp = () => {
    if (!swipeMode) return
    if (locking.current === 'h') {
      if (offset >= REPLY_THRESHOLD && canReply) {
        onReply?.()
        reset()
        return
      }
      if (offset <= -ACTION_THRESHOLD && (canEdit || canDelete)) {
        setActionsOpen(true)
        setOffset(-88)
        locking.current = null
        return
      }
    }
    if (!actionsOpen) reset()
    else setOffset(-88)
  }

  const onPointerCancel = () => {
    if (!swipeMode) return
    if (!actionsOpen) reset()
  }

  const modeClass = swipeMode ? 'is-touch' : 'is-desktop'
  const desktopClass = !swipeMode && desktopOpen ? ' is-desktop-open' : ''

  return (
    <div
      className={`chat-swipe ${modeClass}${desktopClass}${actionsOpen ? ' is-actions' : ''}${className ? ` ${className}` : ''}`}
      onMouseEnter={openDesktopActions}
      onMouseLeave={scheduleCloseDesktopActions}
    >
      <div
        className="chat-swipe-sheet"
        style={swipeMode ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
        {!swipeMode && hasDesktopActions ? (
          <div className="chat-desktop-actions" role="toolbar" aria-label="メッセージ操作">
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
      {swipeMode && actionsOpen ? (
        <div className="chat-swipe-actions">
          {canEdit ? (
            <button type="button" className="chat-swipe-action is-edit" onClick={() => { setActionsOpen(false); reset(); onEdit?.() }}>
              編集
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className="chat-swipe-action is-delete" onClick={() => { setActionsOpen(false); reset(); onDelete?.() }}>
              削除
            </button>
          ) : null}
          <button type="button" className="chat-swipe-action is-cancel" onClick={() => { setActionsOpen(false); reset() }}>
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
