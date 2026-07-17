import { useCallback, useEffect, useRef, useState } from 'react'

function clampToViewport(x, y, width = 280, height = 120) {
  const maxX = Math.max(8, window.innerWidth - width - 8)
  const maxY = Math.max(8, window.innerHeight - height - 8)
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  }
}

function readStoredPosition(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return clampToViewport(parsed.x, parsed.y)
    }
  } catch {
    /* ignore */
  }
  return null
}

export function useFloatingPanel(storageKey = null) {
  const panelRef = useRef(null)
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0, width: 0, height: 0 })
  const [position, setPosition] = useState(() => readStoredPosition(storageKey))
  const [isDragging, setIsDragging] = useState(false)

  const clampPosition = useCallback((x, y, width, height) => {
    const maxX = Math.max(8, window.innerWidth - width - 8)
    const maxY = Math.max(8, window.innerHeight - height - 8)
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    }
  }, [])

  const startDrag = useCallback((event) => {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('[data-drag-handle]')) return

    const el = panelRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    dragRef.current = {
      active: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    setIsDragging(true)
    event.preventDefault()
  }, [])

  useEffect(() => {
    if (!isDragging) return undefined

    const onMove = (event) => {
      if (!dragRef.current.active) return
      const { offsetX, offsetY, width, height } = dragRef.current
      setPosition(clampPosition(event.clientX - offsetX, event.clientY - offsetY, width, height))
    }

    const onEnd = () => {
      dragRef.current.active = false
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [isDragging, clampPosition])

  useEffect(() => {
    if (!position || !storageKey) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(position))
    } catch {
      /* ignore */
    }
  }, [position, storageKey])

  const resetPosition = useCallback(() => {
    setPosition(null)
    if (!storageKey) return
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const panelStyle = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : undefined

  const panelClassName = [
    position ? 'is-drag-positioned' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    panelRef,
    panelStyle,
    panelClassName,
    isDragging,
    isPositioned: Boolean(position),
    resetPosition,
    onPointerDown: startDrag,
  }
}
