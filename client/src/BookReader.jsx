import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { readBookAssistCache, writeBookAssistCache } from './bookAssistCache'
import { setBookBookmark } from './bookProgress'
import { analyzeBookPageForOwner, getFirebaseErrorMessage } from './firebase'

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

const MAX_RENDER_SCALE = 5
// Keeps a very large page from allocating a huge bitmap on phones.
const MAX_RENDER_PIXELS = 9_000_000
const MAX_CACHED_PAGES = 8
const MAX_ASSIST_CHARS = 4000
/** Keep in sync with `.book-reader-volume.is-flipping-*` CSS transition. */
const PAGE_FLIP_MS = 1100

function screenPixelRatio() {
  if (typeof window === 'undefined') return 1
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1))
}

let pageImageType = ''

function pickPageImageType() {
  if (pageImageType) return pageImageType
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    pageImageType = probe.toDataURL('image/webp').startsWith('data:image/webp')
      ? 'image/webp'
      : 'image/png'
  } catch {
    pageImageType = 'image/png'
  }
  return pageImageType
}

async function renderPageToCanvas(pdf, pageNumber, targetWidth) {
  const page = await pdf.getPage(pageNumber)
  const unscaled = page.getViewport({ scale: 1 })
  let scale = Math.min(MAX_RENDER_SCALE, Math.max(1, targetWidth / unscaled.width))
  const pixels = unscaled.width * unscaled.height * scale * scale
  if (pixels > MAX_RENDER_PIXELS) scale *= Math.sqrt(MAX_RENDER_PIXELS / pixels)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return { canvas, aspect: unscaled.width / unscaled.height }
}

/** Render the current page to a JPEG (for OCR translate). */
async function capturePageJpegBase64(pdf, pageNumber, maxWidth = 1100) {
  const { canvas } = await renderPageToCanvas(pdf, pageNumber, maxWidth)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
  if (!base64) throw new Error('page capture failed')
  return { base64, mimeType: 'image/jpeg' }
}

function trimPageCache(cache, keepPage) {
  if (cache.size <= MAX_CACHED_PAGES) return
  const farthestFirst = [...cache.keys()].sort(
    (a, b) => Math.abs(b - keepPage) - Math.abs(a - keepPage),
  )
  for (const key of farthestFirst) {
    if (cache.size <= MAX_CACHED_PAGES) break
    if (Math.abs(key - keepPage) <= 2) continue
    URL.revokeObjectURL(cache.get(key))
    cache.delete(key)
  }
}

async function loadPdfSource(pdfUrl, pdfData) {
  if (pdfData && pdfData.byteLength > 4) {
    // Copy once — pdf.js may transfer the buffer to the worker.
    return { data: pdfData.slice ? pdfData.slice() : new Uint8Array(pdfData) }
  }
  if (!pdfUrl) throw new Error('PDF source missing')
  const response = await fetch(pdfUrl)
  if (!response.ok) throw new Error(`PDF fetch failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < 5) throw new Error('PDF data is empty')
  return { data: bytes }
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
 * Owner (hana) gets a private page assist: VI translation + hiragana reading.
 */
export default function BookReader({
  open,
  bookId = '',
  title = '無題の本',
  pdfUrl,
  pdfData = null,
  initialPage = 1,
  isOwner = false,
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
  const assistReqRef = useRef(0)
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
  const [assistOpen, setAssistOpen] = useState(false)
  const [assistStatus, setAssistStatus] = useState('idle') // idle | loading | ready | empty | error
  const [assistNote, setAssistNote] = useState('')
  const [assistVi, setAssistVi] = useState('')
  const [assistReading, setAssistReading] = useState('')

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
  }, [onProgressChange])

  useEffect(() => {
    if (open) {
      closedRef.current = false
      startPageRef.current = initialPage
      setAssistOpen(false)
      setAssistStatus('idle')
      setAssistNote('')
      setAssistVi('')
      setAssistReading('')
    }
  }, [open, initialPage])

  // Restore cached assist when the page changes (owner only).
  useEffect(() => {
    if (!open || !isOwner || !bookId || !page) return
    const cached = readBookAssistCache(bookId, page)
    if (cached) {
      setAssistVi(cached.translationVi)
      setAssistReading(cached.readingHiragana)
      setAssistStatus('ready')
      setAssistNote('')
      return
    }
    setAssistStatus('idle')
    setAssistNote('')
    setAssistVi('')
    setAssistReading('')
  }, [open, isOwner, bookId, page])

  const runPageAssist = useCallback(async ({ force = false } = {}) => {
    if (!isOwner) return
    if (!pdfRef.current || pageCountRef.current < 1) {
      setAssistOpen(true)
      setAssistStatus('error')
      setAssistNote('本がまだ読み込まれていません。')
      return
    }
    if (flipping) return
    const currentPage = pageRef.current
    if (!force) {
      const cached = readBookAssistCache(bookId, currentPage)
      if (cached) {
        setAssistVi(cached.translationVi)
        setAssistReading(cached.readingHiragana)
        setAssistStatus('ready')
        setAssistNote('')
        setAssistOpen(true)
        return
      }
    }

    const reqId = ++assistReqRef.current
    setAssistOpen(true)
    setAssistStatus('loading')
    setAssistNote('この頁を翻訳しています…')
    setAssistVi('')
    setAssistReading('')

    try {
      setAssistNote('この頁を撮影して翻訳しています…')
      const shot = await capturePageJpegBase64(pdfRef.current, currentPage, 1100)
      if (reqId !== assistReqRef.current) return
      if (!shot?.base64) {
        setAssistStatus('empty')
        setAssistNote('ページ画像を取れませんでした。もう一度お試しください。')
        return
      }

      const data = await analyzeBookPageForOwner({
        imageBase64: shot.base64,
        imageMimeType: shot.mimeType,
        title,
        page: currentPage,
      })
      if (reqId !== assistReqRef.current) return

      const translationVi = String(data?.translationVi || '').trim()
      const readingHiragana = String(data?.readingHiragana || '').trim()
      if (!translationVi && !readingHiragana) {
        setAssistStatus(data?.reason === 'quota' ? 'error' : 'empty')
        setAssistNote(
          data?.reason === 'quota'
            ? '翻訳枠が足りません。しばらくしてからもう一度どうぞ。'
            : '文字を読めませんでした。もう一度お試しください。',
        )
        return
      }

      setAssistVi(translationVi)
      setAssistReading(readingHiragana)
      setAssistStatus('ready')
      setAssistNote('')
      writeBookAssistCache(bookId, currentPage, { translationVi, readingHiragana })
    } catch (assistError) {
      console.error(assistError)
      if (reqId !== assistReqRef.current) return
      setAssistStatus('error')
      setAssistNote(getFirebaseErrorMessage(assistError) || 'ページ翻訳に失敗しました。')
    }
  }, [isOwner, flipping, bookId, title])

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

    const cssWidth = Math.max(320, Math.round(renderWidth || frameRef.current.width || 640))
    const { canvas } = await renderPageToCanvas(pdf, pageNumber, cssWidth * screenPixelRatio())
    const url = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('ページ画像の生成に失敗しました。'))
          return
        }
        resolve(URL.createObjectURL(blob))
      }, pickPageImageType(), 0.98)
    })
    pageCacheRef.current.set(pageNumber, url)
    trimPageCache(pageCacheRef.current, pageRef.current)
    return url
  }, [])

  useEffect(() => {
    if (!open) return undefined
    if (!pdfUrl && !pdfData) {
      setBusy(true)
      setError('')
      return undefined
    }

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
        const source = await loadPdfSource(pdfUrl, pdfData)
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
  }, [open, pdfUrl, pdfData, bookId, clearCache, getPageUrl, updateFrame, persistProgress, scheduleTimeout])

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
        }, PAGE_FLIP_MS)
      } else {
        // 前へ: mirror of 次へ — previous page starts folded at the spine, then opens.
        setBackUrl(frontUrl)
        setFrontUrl(nextUrl)
        setFlipping('prep-prev')
        // Let the folded pose paint before animating, or the open feels abrupt vs 次へ.
        scheduleTimeout(() => {
          setFlipping('prev')
          scheduleTimeout(finishTurn, PAGE_FLIP_MS)
        }, 50)
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
      if (event.key === 'Escape') {
        if (assistOpen) {
          setAssistOpen(false)
          return
        }
        handleClose()
      }
      if (event.key === 'ArrowLeft') void turnPage(1)
      if (event.key === 'ArrowRight') void turnPage(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose, turnPage, assistOpen])

  if (!open || typeof document === 'undefined') return null

  const canGoNext = !busy && !flipping && page < pageCount
  const canGoPrev = !busy && !flipping && page > 1
  const progressRatio = pageCount > 0 ? page / pageCount : 0
  const assistBusy = assistStatus === 'loading'

  return createPortal(
    <div className="book-reader-overlay" role="presentation" onClick={() => handleClose()}>
      <div className="book-reader-atmosphere" aria-hidden="true">
        <span className="book-reader-glow" />
        <span className="book-reader-shoji" />
        <span className="book-reader-mist" />
      </div>

      <div
        className={`book-reader${assistOpen && isOwner ? ' is-assist-open' : ''}`}
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
            <div className="book-reader-header-actions">
              {isOwner ? (
                <button
                  type="button"
                  className={`book-reader-assist-btn${assistOpen ? ' is-open' : ''}${assistBusy ? ' is-loading' : ''}`}
                  onClick={() => {
                    if (assistOpen) {
                      setAssistOpen(false)
                      return
                    }
                    void runPageAssist()
                  }}
                  disabled={Boolean(flipping) || assistBusy || pageCount < 1}
                  title="この頁を翻訳（はな専用・画面キャプチャ）"
                >
                  {assistBusy ? '翻訳中…' : assistOpen ? '翻訳を閉じる' : 'この頁を翻訳'}
                </button>
              ) : null}
              <button
                type="button"
                className="book-reader-close"
                onClick={handleClose}
                aria-label="閉じる"
                title="閉じる"
              >
                閉じる
              </button>
            </div>
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

            {isOwner && assistOpen ? (
              <section className="book-reader-assist" aria-label="はな専用・頁翻訳">
                <div className="book-reader-assist-head">
                  <p className="book-reader-assist-kicker">はな専用・撮影翻訳 · {page}頁</p>
                  <div className="book-reader-assist-actions">
                    <button
                      type="button"
                      className="book-reader-assist-refresh"
                      disabled={assistBusy || Boolean(flipping)}
                      onClick={() => void runPageAssist({ force: true })}
                    >
                      再解析
                    </button>
                    <button
                      type="button"
                      className="book-reader-assist-dismiss"
                      onClick={() => setAssistOpen(false)}
                    >
                      閉じる
                    </button>
                  </div>
                </div>
                {assistBusy ? (
                  <div className="book-reader-assist-loading" aria-live="polite">
                    <span className="book-reader-assist-spinner" aria-hidden="true" />
                    <p>この頁を翻訳しています…</p>
                  </div>
                ) : null}
                {assistNote && !assistBusy ? <p className="book-reader-assist-note">{assistNote}</p> : null}
                {assistReading ? (
                  <div className="book-reader-assist-block">
                    <p className="book-reader-assist-label">読み（ひらがな）</p>
                    <p className="book-reader-assist-reading">{assistReading}</p>
                  </div>
                ) : null}
                {assistVi ? (
                  <div className="book-reader-assist-block">
                    <p className="book-reader-assist-label">ベトナム語訳</p>
                    <p className="book-reader-assist-vi">{assistVi}</p>
                  </div>
                ) : null}
              </section>
            ) : null}
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

          <p className="book-reader-hint">
            {isOwner
              ? '左で次へ · 右で戻る · Escで閉じる · はな専用の頁解析あり'
              : '左で次へ · 右で戻る · Escで閉じる · 頁は自動で覚えます'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
