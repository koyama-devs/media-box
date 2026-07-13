import { useEffect, useRef, useState } from 'react'
import defaultJacketUrl from './assets/vinyl-jacket-default.svg?url'
import defaultLabelUrl from './assets/vinyl-label-default.svg?url'

const DEFAULT_LABEL = defaultLabelUrl
const DEFAULT_JACKET = defaultJacketUrl

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

export default function VinylPlayer({
  title,
  coverSrc,
  jacketSrc,
  isPlaying,
  coverBusy = false,
  jacketBusy = false,
  onCoverPick,
  onCoverClear,
  onJacketPick,
  onJacketClear,
  onTogglePlayback,
  children,
}) {
  const useDefaultLabel = !coverSrc
  const useDefaultJacket = !jacketSrc
  const coverInputRef = useRef(null)
  const jacketInputRef = useRef(null)
  const [labelSrc, setLabelSrc] = useState(DEFAULT_LABEL)

  useEffect(() => {
    setLabelSrc(coverSrc || DEFAULT_LABEL)
  }, [coverSrc])

  const openCoverPicker = () => {
    if (coverBusy || !onCoverPick) return
    coverInputRef.current?.click()
  }

  const openJacketPicker = () => {
    if (jacketBusy || !onJacketPick) return
    jacketInputRef.current?.click()
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
      <div className={`vinyl-jacket ${useDefaultJacket ? 'is-default' : 'has-art'}`}>
        <div
          className="vinyl-jacket-art"
          aria-hidden="true"
          style={{
            backgroundImage: `url("${jacketSrc || DEFAULT_JACKET}")`,
          }}
        />
        <div className="vinyl-jacket-shade" aria-hidden="true" />
        <div className="vinyl-jacket-spine" aria-hidden="true" />

        <div className="vinyl-cover-actions vinyl-cover-actions--jacket">
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

        <div className={`vinyl-stage ${isPlaying ? 'is-playing' : ''}`}>
          {useDefaultLabel ? (
            <div className="vinyl-deco-group" aria-hidden="true">
              <div className="vinyl-deco vinyl-deco--1">
                <MusicNoteIcon />
              </div>
              <div className="vinyl-deco vinyl-deco--2">
                <MusicNoteIcon />
              </div>
            </div>
          ) : null}

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
            className="vinyl-disc"
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
            <div className="vinyl-grooves" aria-hidden="true" />
            <div className={`vinyl-label ${coverBusy ? 'is-busy' : ''} ${useDefaultLabel ? 'is-default' : 'has-cover'}`}>
              <img
                src={labelSrc}
                alt=""
                draggable={false}
                onError={() => setLabelSrc(DEFAULT_LABEL)}
              />
            </div>
            <div className="vinyl-spindle" aria-hidden="true" />
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

      {children ? <div className="vinyl-controls">{children}</div> : null}
    </div>
  )
}
