import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { setBookBookmark } from './bookProgress'

// Modern pdf.js expects Map.getOrInsertComputed (not in all browsers yet).
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value(key, callbackFn) {
      if (this.has(key)) return this.get(key)
      const value = callbackFn(key)
      this.set(key, value)
      return value
    },
    writable: true,
    configurable: true,
  })
}

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

async function renderPageToCanvas(pdf, pageNumber, targetWidth) {
  const page = await pdf.getPage(pageNumber)
  const unscaled = page.getViewport({ scale: 1 })
  const scale = Math.min(2.4, Math.max(1, targetWidth / unscaled.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas unavailable')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return { canvas, aspect: unscaled.width / unscaled.height }
}

async function loadPdfSource(pdfUrl) {
  const response = await fetch(pdfUrl)
  if (!response.ok) throw new Error(`PDF fetch failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < 5) throw new Error('PDF data is empty')
  return { data: bytes.slice() }
}

function toJapanesePageLabel(page, pageCount) {
  if (!pageCount) return '—'
  return `${page} ／ ${pageCount} 頁`
}

function fitBookFrame(stageWidth, stageHeight, aspect) {
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 0.707
  const maxW = Math.max(240, (stageWidth || 640) - 8)
  const maxH = Math.max(240, (stageHeight || 720) - 12)
  let width = maxW
  let height = width / safeAspect
  if (height > maxH) {
    height = maxH
    width = height * safeAspect
  }
  return {
    width: Math.floor(width),
    height: Math.floor(height),
    aspect: safeAspect,
  }
}

function framesEqual(a, b) {
  return a.width === b.width && a.height === b.height
}

function clampPage(page, pageCount) {
  if (!pageCount || pageCount < 1) return 1
  return Math.min(pageCount, Math.max(1, Math.floor(page || 1)))
}

/**
 * Japanese-bound reading room with しおり resume.
 */
export default function BookReader({
  open,
  bookId = '',
  title = '無題の本',
  pdfUrl,
  initialPage = 1,
  onClose,
  onProgressChange,
}) {
  const stageRef = useRef(null)
  const pdfRef = useRef(null)
  const pageCacheRef = useRef(new Map())
  const pageAspectRef = useRef(0.707)
  const frameRef = useRef({ width: 420, height: 594, aspect: 0.707 })
  const pageRef = useRef(1)
  const pageCountRef = useRef(0)
  const onProgressChangeRef = useRef(onProgressChange)
  const startPageRef = useRef(initialPage)
  const closedRef = useRef(false)
  const timersRef = useRef([])
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [frontUrl, setFrontUrl] = useState(null)
  const [backUrl, setBackUrl] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [flipping, setFlipping] = useState(null)
  const [frame, setFrame] = useState(frameRef.current)
  const [resumeNotice, setResumeNotice] = useState('')
  const [shioriPulse, setShioriPulse] = useState(false)

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
  }, [onProgressChange])

  useEffect(() => {
    if (open) {
      closedRef.current = false
      startPageRef.current = initialPage
    }
  }, [open, initialPage])

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.classList.add('is-book-reader-open')
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.classList.remove('is-book-reader-open')
      document.body.style.overflow = previousOverflow
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
    }
  }, [open])

  const clearCache = useCallback(() => {
    pageCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    pageCacheRef.current.clear()
  }, [])

  const updateFrame = useCallback((next) => {
    if (framesEqual(frameRef.current, next)) return
    frameRef.current = next
    setFrame(next)
  }, [])

  const measureFrame = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    updateFrame(fitBookFrame(stage.clientWidth, stage.clientHeight, pageAspectRef.current))
  }, [updateFrame])

  useLayoutEffect(() => {
    if (!open) return undefined
    measureFrame()
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measureFrame())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [open, measureFrame])

  const persistProgress = useCallback((nextPage, nextCount) => {
    if (!bookId || closedRef.current) return
    try {
      setBookBookmark(bookId, nextPage, nextCount)
      onProgressChangeRef.current?.(bookId, nextPage, nextCount)
    } catch (error) {
      console.warn(error)
    }
  }, [bookId])

  const scheduleTimeout = useCallback((fn, ms) => {
    const id = window.setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  const getPageUrl = useCallback(async (pdf, pageNumber, renderWidth) => {
    const cached = pageCacheRef.current.get(pageNumber)
    if (cached) return cached

    const width = Math.max(320, Math.round(renderWidth || frameRef.current.width || 640))
    const dprBoost = typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? 1.35 : 1.1
    const { canvas } = await renderPageToCanvas(pdf, pageNumber, width * dprBoost)
    const url = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('ページ画像の生成に失敗しました。'))
          return
        }
        resolve(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.92)
    })
    pageCacheRef.current.set(pageNumber, url)
    return url
  }, [])

  useEffect(() => {
    if (!open || !pdfUrl) return undefined

    let cancelled = false
    setBusy(true)
    setError('')
    setPage(1)
    pageRef.current = 1
    setFrontUrl(null)
    setBackUrl(null)
    setFlipping(null)
    setResumeNotice('')
    pageAspectRef.current = 0.707
    clearCache()

    const load = async () => {
      try {
        const source = await loadPdfSource(pdfUrl)
        const loadingTask = pdfjs.getDocument(source)
        const pdf = await loadingTask.promise
        if (cancelled) {
          pdf.destroy()
          return
        }
        pdfRef.current = pdf
        const total = pdf.numPages || 0
        pageCountRef.current = total
        setPageCount(total)

        const firstPage = await pdf.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        pageAspectRef.current = viewport.width / viewport.height
        const stage = stageRef.current
        const sized = fitBookFrame(
          stage?.clientWidth || 640,
          stage?.clientHeight || 720,
          pageAspectRef.current,
        )
        updateFrame(sized)

        const startPage = clampPage(startPageRef.current, total)
        const startUrl = await getPageUrl(pdf, startPage, sized.width)
        if (cancelled) return
        setFrontUrl(startUrl)
        setPage(startPage)
        pageRef.current = startPage
        persistProgress(startPage, total)

        if (startPage > 1) {
          setResumeNotice(`しおり · ${startPage}頁から続き`)
          setShioriPulse(true)
          scheduleTimeout(() => setResumeNotice(''), 3200)
          scheduleTimeout(() => setShioriPulse(false), 1800)
        }

        const prefetch = [startPage - 1, startPage + 1].filter((n) => n >= 1 && n <= total)
        prefetch.forEach((n) => {
          getPageUrl(pdf, n, sized.width).catch(() => {})
        })
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) {
          const detail = loadError?.message ? `（${loadError.message}）` : ''
          setError(`この本を開けませんでした。PDFを確認してください。${detail}`)
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    load()

    return () => {
      cancelled = true
      if (!closedRef.current && bookId && pageRef.current > 0) {
        persistProgress(pageRef.current, pageCountRef.current)
      }
      try {
        pdfRef.current?.destroy()
      } catch {
        /* ignore worker teardown errors */
      }
      pdfRef.current = null
      clearCache()
    }
  }, [open, pdfUrl, bookId, clearCache, getPageUrl, updateFrame, persistProgress, scheduleTimeout])

  const turnPage = useCallback(async (direction) => {
    if (flipping || busy || !pdfRef.current) return
    const nextPage = page + direction
    if (nextPage < 1 || nextPage > pageCount) return

    setBusy(true)
    try {
      const nextUrl = await getPageUrl(pdfRef.current, nextPage, frameRef.current.width)
      const finishTurn = () => {
        setPage(nextPage)
        pageRef.current = nextPage
        setFlipping('settle')
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setFlipping(null)
            setBackUrl(null)
            setBusy(false)
            persistProgress(nextPage, pageCount)
            setShioriPulse(true)
            scheduleTimeout(() => setShioriPulse(false), 700)
            const prefetch = [nextPage - 1, nextPage + 1].filter((n) => n >= 1 && n <= pageCount)
            prefetch.forEach((n) => {
              getPageUrl(pdfRef.current, n, frameRef.current.width).catch(() => {})
            })
          })
        })
      }

      if (direction > 0) {
        // 次へ: current page flips away, revealing the next page underneath.
        setBackUrl(nextUrl)
        setFlipping('next')
        scheduleTimeout(() => {
          setFrontUrl(nextUrl)
          finishTurn()
        }, 780)
      } else {
        // 前へ: place previous page already folded, then open it onto the desk.
        setBackUrl(frontUrl)
        setFrontUrl(nextUrl)
        setFlipping('prep-prev')
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setFlipping('prev')
            scheduleTimeout(finishTurn, 780)
          })
        })
      }
    } catch (turnError) {
      console.error(turnError)
      setError('ページの読み込みに失敗しました。')
      setBusy(false)
      setFlipping(null)
    }
  }, [flipping, busy, page, pageCount, frontUrl, getPageUrl, persistProgress, scheduleTimeout])

  const handleClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    try {
      if (bookId && pageRef.current > 0) {
        setBookBookmark(bookId, pageRef.current, pageCountRef.current)
        onProgressChangeRef.current?.(bookId, pageRef.current, pageCountRef.current)
      }
    } catch (error) {
      console.warn(error)
    }
    onClose?.()
  }, [bookId, onClose])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') handleClose()
      if (event.key === 'ArrowLeft') void turnPage(1)
      if (event.key === 'ArrowRight') void turnPage(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose, turnPage])

  if (!open || typeof document === 'undefined') return null

  const canGoNext = !busy && !flipping && page < pageCount
  const canGoPrev = !busy && !flipping && page > 1
  const progressRatio = pageCount > 0 ? page / pageCount : 0

  return createPortal(
    <div className="book-reader-overlay" role="presentation" onClick={() => handleClose()}>
      <div className="book-reader-atmosphere" aria-hidden="true">
        <span className="book-reader-glow" />
        <span className="book-reader-shoji" />
        <span className="book-reader-mist" />
      </div>

      <div
        className="book-reader"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="book-reader-slip" aria-hidden="true">
          <span className="book-reader-slip-mark">讀</span>
          <p className="book-reader-slip-title">{title}</p>
        </aside>

        <div className="book-reader-main">
          <header className="book-reader-header">
            <div className="book-reader-title-block">
              <p className="book-reader-kicker">読書室 · 右開き</p>
              <h2>{title}</h2>
            </div>
            <button
              type="button"
              className="book-reader-close"
              onClick={handleClose}
              aria-label="閉じる"
              title="閉じる"
            >
              閉じる
            </button>
          </header>

          <div className="book-reader-stage" ref={stageRef}>
            <div className="book-reader-desk" aria-hidden="true" />
            <div
              className={`book-reader-volume${flipping ? ` is-flipping-${flipping}` : ''}`}
              style={{
                width: `${frame.width}px`,
                height: `${frame.height}px`,
              }}
            >
              <div
                className={`book-shiori${shioriPulse ? ' is-pulse' : ''}`}
                aria-hidden="true"
                title="しおり"
              >
                <span className="book-shiori-ribbon">しおり</span>
                <span className="book-shiori-tail" />
              </div>

              <div className="book-reader-cover-edge" aria-hidden="true" />
              <div className="book-reader-spine" aria-hidden="true">
                <span className="book-reader-spine-thread" />
              </div>

              <div className="book-page book-page--back">
                {backUrl ? <img src={backUrl} alt="" /> : null}
              </div>

              <div className="book-page book-page--front">
                {frontUrl ? (
                  <img src={frontUrl} alt={`${title} ${page}ページ`} />
                ) : (
                  <div className="book-page-empty">
                    <span className="book-page-empty-seal" aria-hidden="true">閑</span>
                    <p>{busy ? '紙をめくっています…' : '頁がありません'}</p>
                  </div>
                )}

                <button
                  type="button"
                  className="book-page-zone book-page-zone--next"
                  disabled={!canGoNext}
                  onClick={() => void turnPage(1)}
                  aria-label="次の頁"
                  title="次の頁（←）"
                />
                <button
                  type="button"
                  className="book-page-zone book-page-zone--prev"
                  disabled={!canGoPrev}
                  onClick={() => void turnPage(-1)}
                  aria-label="前の頁"
                  title="前の頁（→）"
                />
              </div>
            </div>
          </div>

          {resumeNotice ? <p className="book-reader-resume">{resumeNotice}</p> : null}
          {error ? <p className="book-reader-error">{error}</p> : null}

          <footer className="book-reader-footer">
            <button
              type="button"
              className="book-reader-nav"
              disabled={!canGoNext}
              onClick={() => void turnPage(1)}
            >
              <span className="book-reader-nav-arrow" aria-hidden="true">‹</span>
              次の頁
            </button>

            <div className="book-reader-pager">
              <span className="book-reader-seal" aria-hidden="true">頁</span>
              <div className="book-reader-page-block">
                <p className="book-reader-page-indicator">{toJapanesePageLabel(page, pageCount)}</p>
                <div className="book-reader-progress" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, progressRatio * 100)}%` }} />
                </div>
                <p className="book-reader-shiori-note">しおりをはさんでいます</p>
              </div>
            </div>

            <button
              type="button"
              className="book-reader-nav"
              disabled={!canGoPrev}
              onClick={() => void turnPage(-1)}
            >
              前の頁
              <span className="book-reader-nav-arrow" aria-hidden="true">›</span>
            </button>
          </footer>

          <p className="book-reader-hint">左で次へ · 右で戻る · Escで閉じる · 頁は自動で覚えます</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
