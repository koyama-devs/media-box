import { useEffect, useRef, useState } from 'react'

const REPLY_THRESHOLD = 56
const ACTION_THRESHOLD = 72

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
 * Desktop: hover action buttons (返信 / 編集 / 削除).
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
  const [offset, setOffset] = useState(0)
  const [actionsOpen, setActionsOpen] = useState(false)

  const hasDesktopActions = canReply || canEdit || canDelete

  const reset = () => {
    setOffset(0)
    locking.current = null
  }

  useEffect(() => {
    if (!swipeMode) {
      setOffset(0)
      setActionsOpen(false)
      locking.current = null
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

  return (
    <div className={`chat-swipe ${modeClass}${actionsOpen ? ' is-actions' : ''}${className ? ` ${className}` : ''}`}>
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
              <button type="button" className="chat-desktop-action is-reply" onClick={() => onReply?.()}>
                返信
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="chat-desktop-action is-edit" onClick={() => onEdit?.()}>
                編集
              </button>
            ) : null}
            {canDelete ? (
              <button type="button" className="chat-desktop-action is-delete" onClick={() => onDelete?.()}>
                削除
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
