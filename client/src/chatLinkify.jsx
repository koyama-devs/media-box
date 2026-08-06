import { createElement } from 'react'

/**
 * Split chat text into plain runs + clickable http(s)/www links.
 * Tap opens; long-press / context-menu copies the URL.
 */
const CHAT_URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi
const TRAILING_PUNCT_RE = /[)\]】」』"'。、．，,!！?？:;]+$/
const LONG_PRESS_MS = 480
const LONG_PRESS_MOVE_PX = 12

export function firstChatUrl(value) {
  const match = String(value || '').match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i)
  if (!match) return ''
  const raw = match[0].replace(TRAILING_PUNCT_RE, '')
  return toHref(raw)
}

function toHref(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return ''
}

async function copyLink(href) {
  const value = String(href || '')
  if (!value) return false
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function flashCopied(anchor) {
  if (!(anchor instanceof HTMLElement)) return
  anchor.classList.add('is-copied')
  anchor.setAttribute('data-copied', 'コピーした')
  window.setTimeout(() => {
    anchor.classList.remove('is-copied')
    anchor.removeAttribute('data-copied')
  }, 1400)
  try {
    navigator.vibrate?.(10)
  } catch {
    /* ignore */
  }
}

function bindLinkGestures(href) {
  let pressTimer = null
  let startX = 0
  let startY = 0
  let copiedByPress = false

  const clearPress = () => {
    if (pressTimer != null) {
      window.clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  return {
    onClick: (event) => {
      event.stopPropagation()
      if (copiedByPress) {
        event.preventDefault()
        copiedByPress = false
      }
    },
    onPointerDown: (event) => {
      event.stopPropagation()
      if (event.button != null && event.button !== 0) return
      clearPress()
      copiedByPress = false
      startX = event.clientX
      startY = event.clientY
      const target = event.currentTarget
      pressTimer = window.setTimeout(async () => {
        pressTimer = null
        copiedByPress = true
        const ok = await copyLink(href)
        if (ok) flashCopied(target)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event) => {
      if (!pressTimer) return
      if (
        Math.abs(event.clientX - startX) > LONG_PRESS_MOVE_PX
        || Math.abs(event.clientY - startY) > LONG_PRESS_MOVE_PX
      ) {
        clearPress()
      }
    },
    onPointerUp: clearPress,
    onPointerCancel: clearPress,
    onPointerLeave: clearPress,
    onContextMenu: async (event) => {
      event.preventDefault()
      event.stopPropagation()
      clearPress()
      const ok = await copyLink(href)
      if (ok) flashCopied(event.currentTarget)
    },
  }
}

/**
 * @param {string} text
 * @returns {import('react').ReactNode}
 */
export function renderChatTextWithLinks(text) {
  const raw = String(text ?? '')
  if (!raw) return null

  const nodes = []
  let lastIndex = 0
  let match
  const re = new RegExp(CHAT_URL_RE.source, CHAT_URL_RE.flags)

  while ((match = re.exec(raw))) {
    if (match.index > lastIndex) {
      nodes.push(raw.slice(lastIndex, match.index))
    }

    const full = match[0]
    const punct = full.match(TRAILING_PUNCT_RE)?.[0] || ''
    const core = punct ? full.slice(0, -punct.length) : full
    const href = toHref(core)

    if (href) {
      nodes.push(
        createElement(
          'a',
          {
            key: `chat-link-${match.index}-${href}`,
            className: 'hana-chat-autolink',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: 'タップで開く · 長押しでコピー',
            'data-no-bubble-press': 'true',
            ...bindLinkGestures(href),
          },
          core,
        ),
      )
      if (punct) nodes.push(punct)
    } else {
      nodes.push(full)
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < raw.length) {
    nodes.push(raw.slice(lastIndex))
  }

  return nodes.length === 1 ? nodes[0] : nodes
}
