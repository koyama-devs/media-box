import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const scale = Math.min(2.2, Math.max(0.8, targetWidth / unscaled.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas unavailable')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
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

/**
 * Japanese-bound reading room: 右開き spine, washi page, soft page-turn.
 */
export default function BookReader({
  open,
  title = '無題の本',
  pdfUrl,
  onClose,
}) {
  const stageRef = useRef(null)
  const pdfRef = useRef(null)
  const pageCacheRef = useRef(new Map())
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [frontUrl, setFrontUrl] = useState(null)
  const [backUrl, setBackUrl] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [flipping, setFlipping] = useState(null) // 'next' | 'prev' | null

  const clearCache = useCallback(() => {
    pageCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    pageCacheRef.current.clear()
  }, [])

  const getPageUrl = useCallback(async (pdf, pageNumber) => {
    const cached = pageCacheRef.current.get(pageNumber)
    if (cached) return cached

    const width = Math.min(920, Math.max(320, (stageRef.current?.clientWidth || 640) * 0.88))
    const canvas = await renderPageToCanvas(pdf, pageNumber, width)
    const url = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('ページ画像の生成に失敗しました。'))
          return
        }
        resolve(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.9)
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
    setFrontUrl(null)
    setBackUrl(null)
    setFlipping(null)
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
        setPageCount(pdf.numPages || 0)
        const first = await getPageUrl(pdf, 1)
        if (cancelled) return
        setFrontUrl(first)
        if (pdf.numPages > 1) {
          getPageUrl(pdf, 2).catch(() => {})
        }
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
      pdfRef.current?.destroy()
      pdfRef.current = null
      clearCache()
    }
  }, [open, pdfUrl, clearCache, getPageUrl])

  const turnPage = useCallback(async (direction) => {
    if (flipping || busy || !pdfRef.current) return
    const nextPage = page + direction
    if (nextPage < 1 || nextPage > pageCount) return

    setBusy(true)
    try {
      const nextUrl = await getPageUrl(pdfRef.current, nextPage)
      setBackUrl(nextUrl)
      setFlipping(direction > 0 ? 'next' : 'prev')

      window.setTimeout(() => {
        setFrontUrl(nextUrl)
        setPage(nextPage)
        setFlipping(null)
        setBackUrl(null)
        setBusy(false)
        const prefetch = [nextPage - 1, nextPage + 1].filter((n) => n >= 1 && n <= pageCount)
        prefetch.forEach((n) => {
          getPageUrl(pdfRef.current, n).catch(() => {})
        })
      }, 780)
    } catch (turnError) {
      console.error(turnError)
      setError('ページの読み込みに失敗しました。')
      setBusy(false)
      setFlipping(null)
    }
  }, [flipping, busy, page, pageCount, getPageUrl])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
      // 右開き: ← = 次の頁, → = 前の頁
      if (event.key === 'ArrowLeft') void turnPage(1)
      if (event.key === 'ArrowRight') void turnPage(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, turnPage])

  if (!open || typeof document === 'undefined') return null

  const canGoNext = !busy && !flipping && page < pageCount
  const canGoPrev = !busy && !flipping && page > 1

  return createPortal(
    <div className="book-reader-overlay" role="presentation" onClick={() => onClose?.()}>
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
              onClick={() => onClose?.()}
              aria-label="閉じる"
              title="閉じる"
            >
              閉じる
            </button>
          </header>

          <div className="book-reader-stage" ref={stageRef}>
            <div className="book-reader-desk" aria-hidden="true" />
            <div className={`book-reader-volume${flipping ? ` is-flipping-${flipping}` : ''}`}>
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
              <p className="book-reader-page-indicator">{toJapanesePageLabel(page, pageCount)}</p>
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

          <p className="book-reader-hint">左で次へ · 右で戻る · Escで閉じる</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
