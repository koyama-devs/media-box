import { useEffect, useRef, useState } from 'react'
import jacketSakuraUrl from './assets/vinyl-jacket-0-sakura.svg?url'
import jacketPosterUrl from './assets/vinyl-jacket-1-poster.svg?url'
import jacketRecordUrl from './assets/vinyl-jacket-2-record.svg?url'
import jacketPaperUrl from './assets/vinyl-jacket-3-paper.svg?url'
import jacketPetalUrl from './assets/vinyl-jacket-4-petal.svg?url'
import defaultLabelUrl from './assets/vinyl-label-default.svg?url'
import AudioTransport from './AudioTransport'
import VinylDiscCanvas from './VinylDiscCanvas'

const DEFAULT_LABEL = defaultLabelUrl

const JACKET_STYLES = [
  {
    id: 'petal',
    label: 'ペタル',
    url: jacketPetalUrl,
    reveal: { kanji: '愛', quote: ['好きこそものの', '上手なれ'] },
  },
  {
    id: 'sakura',
    label: 'サクラ',
    url: jacketSakuraUrl,
    reveal: { kanji: '縁', quote: ['一期一会'] },
  },
  {
    id: 'poster',
    label: '花火',
    url: jacketPosterUrl,
    reveal: { kanji: '煌', quote: ['夏は短し', '恋せよ乙女'] },
  },
  {
    id: 'paper',
    label: '紅葉',
    url: jacketPaperUrl,
    reveal: { kanji: '時', quote: ['諸行無常'] },
  },
  {
    id: 'record',
    label: '雪',
    url: jacketRecordUrl,
    reveal: { kanji: '静', quote: ['雪月花'] },
  },
]

const CUSTOM_JACKET_REVEAL = { kanji: '音', quote: ['音楽は', '心の言葉'] }

function resolveJacketStyleIndex(styleId) {
  const index = JACKET_STYLES.findIndex((style) => style.id === styleId)
  return index >= 0 ? index : 0
}

function MusicNoteIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <ellipse cx="10" cy="22" rx="4" ry="3" transform="rotate(-18 10 22)"/>
      <rect x="12.5" y="8" width="1.6" height="14" rx="0.8"/>
      <path d="M14.1 8c4.8-1.4 8.4-0.2 10 2.6-3 3.2-6.6 3.8-10 1.8z"/>
      <ellipse cx="22" cy="24" rx="3" ry="2.3" transform="rotate(-10 22 24)"/>
      <rect x="23.4" y="14" width="1.4" height="10" rx="0.7"/>
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>
      <circle cx="9" cy="10" r="1.6"/>
      <path d="M4.5 16.5 9 13l3.2 2.4L16 12l3.5 4.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 7h14" strokeLinecap="round"/>
      <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7"/>
      <path d="M8 7l.7 11.2A1.8 1.8 0 0 0 10.5 20h3a1.8 1.8 0 0 0 1.8-1.8L16 7"/>
    </svg>
  )
}

function StyleSwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5"/>
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5"/>
      <path d="M14 6.5h3.5V10M10 17.5H6.5V14" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function SleeveIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="4.5" width="11" height="15" rx="1.5"/>
      <circle
        cx={open ? 17.5 : 12.5}
        cy="12"
        r="4.2"
        fill="currentColor"
        fillOpacity="0.22"
        style={{ transition: 'cx 0.25s ease' }}
      />
      <circle
        cx={open ? 17.5 : 12.5}
        cy="12"
        r="4.2"
        style={{ transition: 'cx 0.25s ease' }}
      />
    </svg>
  )
}

export default function VinylPlayer({
  title,
  coverSrc,
  jacketSrc,
  jacketStyleId = null,
  trackId = null,
  isPlaying,
  currentTime = 0,
  duration = 0,
  coverBusy = false,
  jacketBusy = false,
  onCoverPick,
  onCoverClear,
  onJacketPick,
  onJacketClear,
  onJacketStyleChange,
  onTogglePlayback,
  onSeek,
  children,
}) {
  const useDefaultLabel = !coverSrc
  const useDefaultJacket = !jacketSrc
  const coverInputRef = useRef(null)
  const jacketInputRef = useRef(null)
  const [labelSrc, setLabelSrc] = useState(DEFAULT_LABEL)
  const [jacketStyleIndex, setJacketStyleIndex] = useState(() =>
    resolveJacketStyleIndex(jacketStyleId),
  )
  const [isPeekingJacket, setIsPeekingJacket] = useState(false)

  useEffect(() => {
    setLabelSrc(coverSrc || DEFAULT_LABEL)
  }, [coverSrc])

  useEffect(() => {
    setJacketStyleIndex(resolveJacketStyleIndex(jacketStyleId))
  }, [jacketStyleId])

  useEffect(() => {
    setIsPeekingJacket(false)
  }, [trackId])

  useEffect(() => {
    if (!isPeekingJacket) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsPeekingJacket(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPeekingJacket])

  const activeJacketStyle = JACKET_STYLES[jacketStyleIndex] || JACKET_STYLES[0]
  const defaultJacketUrl = activeJacketStyle.url
  const jacketBackgroundUrl = jacketSrc || defaultJacketUrl
  const jacketReveal = useDefaultJacket
    ? activeJacketStyle.reveal
    : CUSTOM_JACKET_REVEAL

  const openCoverPicker = () => {
    if (coverBusy || !onCoverPick) return
    coverInputRef.current?.click()
  }

  const openJacketPicker = () => {
    if (jacketBusy || !onJacketPick) return
    jacketInputRef.current?.click()
  }

  const cycleJacketStyle = (event) => {
    event.stopPropagation()
    if (jacketBusy) return
    const nextIndex = (jacketStyleIndex + 1) % JACKET_STYLES.length
    const nextStyle = JACKET_STYLES[nextIndex]
    setJacketStyleIndex(nextIndex)
    onJacketStyleChange?.(nextStyle.id)
  }

  const toggleJacketPeek = (event) => {
    event.stopPropagation()
    setIsPeekingJacket((current) => !current)
  }

  const handleCoverFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && onCoverPick) onCoverPick(file)
  }

  const handleJacketFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && onJacketPick) onJacketPick(file)
  }

  const handlePlaybackClick = () => {
    if (!onTogglePlayback) return
    onTogglePlayback()
  }

  return (
    <div className={`vinyl-player ${isPlaying ? 'is-playing' : ''}`}>
      <div
        className={`vinyl-jacket ${useDefaultJacket ? 'is-default' : 'has-art'}${isPeekingJacket ? ' is-peeking' : ''}`}
      >
        <div
          className="vinyl-jacket-art"
          aria-hidden="true"
          style={{
            backgroundImage: `url("${jacketBackgroundUrl}")`,
          }}
        />
        <div className="vinyl-jacket-shade" aria-hidden="true" />
        <div className="vinyl-jacket-spine" aria-hidden="true" />

        <div
          className={`vinyl-jacket-reveal${isPeekingJacket ? ' is-visible' : ''}`}
          aria-hidden={!isPeekingJacket}
        >
          <span className="vinyl-jacket-reveal-kanji">{jacketReveal.kanji}</span>
          <p className="vinyl-jacket-reveal-quote">
            {jacketReveal.quote.map((line, index) => (
              <span key={`${line}-${index}`} className="vinyl-jacket-reveal-line">
                {line}
              </span>
            ))}
          </p>
        </div>

        {useDefaultJacket ? (
          <div className="vinyl-deco-group" aria-hidden="true">
            <div className="vinyl-deco vinyl-deco--1">
              <MusicNoteIcon />
            </div>
            <div className="vinyl-deco vinyl-deco--2">
              <MusicNoteIcon />
            </div>
          </div>
        ) : null}

        <div className="vinyl-cover-actions vinyl-cover-actions--jacket">
          <button
            type="button"
            className={`vinyl-label-icon-btn${isPeekingJacket ? ' is-active' : ''}`}
            onClick={toggleJacketPeek}
            title={isPeekingJacket ? 'レコードを出す' : 'レコードをしまう'}
            aria-label={isPeekingJacket ? 'レコードを出す' : 'レコードをしまう'}
            aria-pressed={isPeekingJacket}
          >
            <SleeveIcon open={!isPeekingJacket} />
          </button>
          {useDefaultJacket ? (
            <button
              type="button"
              className="vinyl-label-icon-btn vinyl-label-icon-btn--style"
              onClick={cycleJacketStyle}
              disabled={jacketBusy || !onJacketStyleChange}
              title={`この曲のデフォルトジャケット（${activeJacketStyle.label} ${jacketStyleIndex + 1}/${JACKET_STYLES.length}）`}
              aria-label={`この曲のデフォルトジャケットを切り替える。現在：${activeJacketStyle.label}`}
            >
              <StyleSwapIcon />
              <span className="vinyl-jacket-style-index">{jacketStyleIndex + 1}</span>
            </button>
          ) : null}
          {onJacketPick ? (
            <button
              type="button"
              className="vinyl-label-icon-btn"
              onClick={openJacketPicker}
              disabled={jacketBusy}
              title={useDefaultJacket ? 'ジャケットを設定' : 'ジャケットを変更'}
              aria-label={useDefaultJacket ? 'ジャケットを設定' : 'ジャケットを変更'}
            >
              <ImageIcon />
            </button>
          ) : null}
          {!useDefaultJacket && onJacketClear ? (
            <button
              type="button"
              className="vinyl-label-icon-btn vinyl-label-icon-btn--danger"
              onClick={onJacketClear}
              disabled={jacketBusy}
              title="ジャケットを外す"
              aria-label="ジャケットを外す"
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>

        <div className="vinyl-rim-glow" aria-hidden="true" />

        <div className={`vinyl-stage ${isPlaying ? 'is-playing' : ''}`}>
          <button
            type="button"
            className="vinyl-tonearm"
            onClick={handlePlaybackClick}
            disabled={!onTogglePlayback}
            title={isPlaying ? '一時停止' : '再生'}
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            <span className="vinyl-tonearm-pivot" aria-hidden="true" />
            <span className="vinyl-tonearm-shaft" aria-hidden="true" />
            <span className="vinyl-tonearm-head" aria-hidden="true" />
          </button>

          <div
            className="vinyl-record-shell"
            role="button"
            tabIndex={onTogglePlayback ? 0 : -1}
            onClick={handlePlaybackClick}
            onKeyDown={(event) => {
              if (!onTogglePlayback) return
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              handlePlaybackClick()
            }}
            title={isPlaying ? '一時停止' : '再生'}
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            <VinylDiscCanvas
              labelSrc={labelSrc}
              isSpinning={Boolean(isPlaying && !isPeekingJacket)}
            />
          </div>

          <div className="vinyl-cover-actions vinyl-cover-actions--label">
            {onCoverPick ? (
              <button
                type="button"
                className="vinyl-label-icon-btn"
                onClick={openCoverPicker}
                disabled={coverBusy}
                title={useDefaultLabel ? 'ラベルを設定' : 'ラベルを変更'}
                aria-label={useDefaultLabel ? 'ラベルを設定' : 'ラベルを変更'}
              >
                <ImageIcon />
              </button>
            ) : null}
            {!useDefaultLabel && onCoverClear ? (
              <button
                type="button"
                className="vinyl-label-icon-btn vinyl-label-icon-btn--danger"
                onClick={onCoverClear}
                disabled={coverBusy}
                title="ラベルを外す"
                aria-label="ラベルを外す"
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>

          <div className="vinyl-shadow" aria-hidden="true" />
        </div>

        <div
          className="vinyl-sleeve-flap"
          aria-hidden="true"
          style={{ backgroundImage: `url("${jacketBackgroundUrl}")` }}
        />
      </div>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleCoverFile}
      />
      <input
        ref={jacketInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleJacketFile}
      />

      <p className="vinyl-track-title">{title}</p>

      <div className="vinyl-controls">
        {children}
        <AudioTransport
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onToggle={onTogglePlayback}
          onSeek={onSeek}
        />
      </div>
    </div>
  )
}
