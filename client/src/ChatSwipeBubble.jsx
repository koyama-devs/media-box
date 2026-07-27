import { useRef, useState } from 'react'

const REPLY_THRESHOLD = 56
const ACTION_THRESHOLD = 72

/**
 * Swipe-right → reply. Swipe-left (own recent msgs) → edit / delete actions.
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
  const startX = useRef(0)
  const startY = useRef(0)
  const locking = useRef(null) // 'h' | 'v' | null
  const [offset, setOffset] = useState(0)
  const [actionsOpen, setActionsOpen] = useState(false)

  const reset = () => {
    setOffset(0)
    locking.current = null
  }

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    startX.current = event.clientX
    startY.current = event.clientY
    locking.current = null
    setActionsOpen(false)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
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
    if (!actionsOpen) reset()
  }

  return (
    <div className={`chat-swipe${actionsOpen ? ' is-actions' : ''}${className ? ` ${className}` : ''}`}>
      <div className="chat-swipe-hint chat-swipe-hint-reply" aria-hidden="true">
        返信
      </div>
      <div className="chat-swipe-hint chat-swipe-hint-actions" aria-hidden="true">
        {(canEdit || canDelete) ? '操作' : ''}
      </div>
      <div
        className="chat-swipe-sheet"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
      {actionsOpen ? (
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
