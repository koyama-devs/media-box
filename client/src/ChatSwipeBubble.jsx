import { useEffect, useRef, useState } from 'react'
import {
    CHAT_DEFAULT_REACTION,
    CHAT_REACTION_EMOJIS,
    reactionMine,
    reactionTotal,
} from './firebase'

const HOVER_LEAVE_MS = 180
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 28

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

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      'ontouchstart' in window
      || (navigator.maxTouchPoints || 0) > 0
      || window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
    )
  })

  useEffect(() => {
    const sync = () => {
      setCoarse(
        'ontouchstart' in window
        || (navigator.maxTouchPoints || 0) > 0
        || window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches,
      )
    }
    sync()
    const media = window.matchMedia('(pointer: coarse)')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return coarse
}

function isIgnoredPressTarget(target) {
  return (
    target instanceof Element
    && Boolean(target.closest(
      'button, a, textarea, input, [data-no-bubble-press], .hana-chat-reactions, .chat-desktop-actions, .chat-msg-menu',
    ))
  )
}

/**
 * Long-press / right-click → inline action list (no modal overlay).
 * Desktop: hover toolbar.
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
  const coarsePointer = useIsCoarsePointer()
  const rootRef = useRef(null)
  const leaveTimer = useRef(null)
  const pressTimer = useRef(null)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const pressOpened = useRef(false)
  const copyTextRef = useRef(copyText)
  const onCopyRef = useRef(onCopy)

  const [menuOpen, setMenuOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [soonNote, setSoonNote] = useState('')

  const canCopy = Boolean(String(copyText || '').trim())
  const hasDesktopActions = canReply || canEdit || canDelete || canCopy || canReact
  const emojiList = Array.isArray(reactionEmojis) && reactionEmojis.length
    ? reactionEmojis
    : CHAT_REACTION_EMOJIS

  copyTextRef.current = copyText
  onCopyRef.current = onCopy

  const clearLeaveTimer = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }

  const clearPressTimer = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
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
    if (coarsePointer || !hasDesktopActions) return
    clearLeaveTimer()
    setDesktopOpen(true)
  }

  const scheduleCloseDesktopActions = () => {
    if (coarsePointer) return
    clearLeaveTimer()
    leaveTimer.current = window.setTimeout(() => {
      setDesktopOpen(false)
      leaveTimer.current = null
    }, HOVER_LEAVE_MS)
  }

  const openActionMenu = () => {
    pressOpened.current = true
    clearPressTimer()
    setMenuOpen(true)
    try {
      navigator.vibrate?.(16)
    } catch {
      /* ignore */
    }
  }

  const closeActionMenu = () => {
    setMenuOpen(false)
    setSoonNote('')
  }

  const pickReaction = (emoji, mode = 'toggle') => {
    closeActionMenu()
    window.setTimeout(() => {
      try {
        onReact?.(emoji, { mode })
      } catch {
        /* parent handles */
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
    closeActionMenu()
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

  const onPressStart = (clientX, clientY) => {
    pressOpened.current = false
    pressOrigin.current = { x: clientX, y: clientY }
    clearPressTimer()
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      openActionMenu()
    }, LONG_PRESS_MS)
  }

  const onPressMove = (clientX, clientY) => {
    if (!pressTimer.current) return
    const dx = clientX - pressOrigin.current.x
    const dy = clientY - pressOrigin.current.y
    if (Math.abs(dx) > LONG_PRESS_MOVE_PX || Math.abs(dy) > LONG_PRESS_MOVE_PX) {
      clearPressTimer()
    }
  }

  const onPressEnd = () => {
    clearPressTimer()
  }

  useEffect(() => () => {
    clearLeaveTimer()
    clearPressTimer()
  }, [])

  // Outside tap closes the inline menu (delayed so the long-press lift doesn't kill it).
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDocPointer = (event) => {
      const root = rootRef.current
      if (!root) {
        setMenuOpen(false)
        return
      }
      if (root.contains(event.target)) {
        if (event.target instanceof Element && event.target.closest('.chat-msg-menu')) return
        // Tap on same bubble (not menu) closes.
        setMenuOpen(false)
        return
      }
      setMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') closeActionMenu()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointer, true)
    }, 280)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onDocPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const flowerCount = reactionTotal(reactions?.[CHAT_DEFAULT_REACTION])
  const showFlowerFab = Boolean(showFlowerReact || flowerCount > 0)
  const modeClass = coarsePointer ? 'is-touch' : 'is-desktop'
  const desktopClass = !coarsePointer && desktopOpen ? ' is-desktop-open' : ''
  const copiedClass = copiedFlash ? ' is-copied' : ''
  const menuClass = menuOpen ? ' is-menu-open' : ''

  const menuNode = menuOpen ? (
    <div
      className="chat-msg-menu"
      role="menu"
      aria-label="メッセージメニュー"
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
  ) : null

  return (
    <div
      ref={rootRef}
      className={`chat-swipe ${modeClass}${desktopClass}${menuClass}${copiedClass}${className ? ` ${className}` : ''}`}
      onMouseEnter={openDesktopActions}
      onMouseLeave={scheduleCloseDesktopActions}
    >
      <div className="chat-swipe-track">
        <div className="chat-swipe-sheet">
          <div
            className={`chat-swipe-bubble-wrap${showFlowerFab ? ' has-flower' : ''}`}
            onPointerDown={(event) => {
              if (isIgnoredPressTarget(event.target)) return
              if (event.pointerType === 'mouse' && event.button !== 0) return
              onPressStart(event.clientX, event.clientY)
            }}
            onPointerMove={(event) => {
              if (!pressTimer.current) return
              onPressMove(event.clientX, event.clientY)
            }}
            onPointerUp={onPressEnd}
            onPointerCancel={onPressEnd}
            onPointerLeave={(event) => {
              // Don't cancel on touch leave quirks; only mouse leave.
              if (event.pointerType === 'mouse') onPressEnd()
            }}
            onContextMenu={(event) => {
              if (isIgnoredPressTarget(event.target)) return
              event.preventDefault()
              event.stopPropagation()
              openActionMenu()
            }}
          >
            {children}
            {showFlowerFab ? (
              <FlowerReactionButton
                total={flowerCount}
                mine={reactionMine(reactions?.[CHAT_DEFAULT_REACTION], reactorId)}
                disabled={!canReact}
                onTap={canReact ? handleFlowerTap : undefined}
                onLongPress={openActionMenu}
              />
            ) : null}
            {menuNode}
          </div>
          {canReact || (reactions && Object.keys(reactions).length > 0) ? (
            <ChatReactionChips
              reactions={reactions}
              reactorId={reactorId}
              includeDefaultReaction={false}
              disabled={!canReact}
              onToggle={canReact ? (emoji) => onReact?.(emoji, { mode: 'toggle' }) : undefined}
            />
          ) : null}
          {!coarsePointer && hasDesktopActions ? (
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
          try {
            navigator.vibrate?.(10)
          } catch {
            /* ignore */
          }
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
        if (!wasLong) onTap?.()
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
      <span className="hana-chat-flower-fab-icon" aria-hidden="true">{CHAT_DEFAULT_REACTION}</span>
      {total > 1 ? <span className="hana-chat-reaction-badge">{total}</span> : null}
    </button>
  )
}
