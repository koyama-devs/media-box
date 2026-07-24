import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  // pdf.js v4+ prefers an explicit canvas alongside the 2d context.
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
}

async function loadPdfSource(pdfUrl) {
  // Always feed pdf.js raw bytes. Blob/object URLs from Firebase getBlob() are
  // same-origin; remote Storage download URLs often fail CORS in the worker.
  const response = await fetch(pdfUrl)
  if (!response.ok) throw new Error(`PDF fetch failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < 5) throw new Error('PDF data is empty')
  // pdf.js may transfer the buffer to the worker — keep a copy ownership-safe.
  return { data: bytes.slice() }
}

/**
 * Fullscreen PDF reader with a paper page-turn animation.
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

    const width = Math.min(920, Math.max(320, (stageRef.current?.clientWidth || 640) * 0.92))
    const canvas = await renderPageToCanvas(pdf, pageNumber, width)
    const url = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('ページ画像の生成に失敗しました。'))
          return
        }
        resolve(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.88)
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
      }, 720)
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
      if (event.key === 'ArrowRight') void turnPage(1)
      if (event.key === 'ArrowLeft') void turnPage(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, turnPage])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="book-reader-overlay" role="presentation" onClick={() => onClose?.()}>
      <div
        className="book-reader"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="book-reader-header">
          <div className="book-reader-title-block">
            <p className="book-reader-kicker">READING ROOM</p>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button book-reader-close"
            onClick={() => onClose?.()}
            aria-label="閉じる"
            title="閉じる"
          >
            ×
          </button>
        </header>

        <div className="book-reader-stage" ref={stageRef}>
          <div className="book-reader-desk" aria-hidden="true" />
          <div className={`book-reader-spread${flipping ? ` is-flipping-${flipping}` : ''}`}>
            <div className="book-reader-spine" aria-hidden="true" />
            <div className="book-page book-page--back">
              {backUrl ? <img src={backUrl} alt="" /> : null}
            </div>
            <div className="book-page book-page--front">
              {frontUrl ? (
                <img src={frontUrl} alt={`${title} ${page}ページ`} />
              ) : (
                <div className="book-page-empty">
                  {busy ? 'ページを用意しています…' : 'ページがありません'}
                </div>
              )}
            </div>
          </div>
        </div>

        {error ? <p className="book-reader-error">{error}</p> : null}

        <footer className="book-reader-footer">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || flipping || page <= 1}
            onClick={() => void turnPage(-1)}
          >
            前のページ
          </button>
          <p className="book-reader-page-indicator">
            {pageCount > 0 ? `${page} / ${pageCount}` : '—'}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || flipping || page >= pageCount}
            onClick={() => void turnPage(1)}
          >
            次のページ
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
