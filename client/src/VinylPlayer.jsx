import { useRef } from 'react'

const DEFAULT_COVER = '/vinyl-label-default.svg'

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
  isPlaying,
  coverBusy = false,
  onCoverPick,
  onCoverClear,
  children,
}) {
  const useDefaultCover = !coverSrc
  const coverInputRef = useRef(null)

  const openCoverPicker = () => {
    if (coverBusy || !onCoverPick) return
    coverInputRef.current?.click()
  }

  const handleCoverFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && onCoverPick) {
      onCoverPick(file)
    }
  }

  return (
    <div className="vinyl-player">
      <div className={`vinyl-stage ${isPlaying ? 'is-playing' : ''}`}>
        {useDefaultCover ? (
          <div className="vinyl-deco-group" aria-hidden="true">
            <div className="vinyl-deco vinyl-deco--1">
              <MusicNoteIcon />
            </div>
            <div className="vinyl-deco vinyl-deco--2">
              <MusicNoteIcon />
            </div>
          </div>
        ) : null}
        <div className="vinyl-tonearm" aria-hidden="true" />
        <div className="vinyl-disc">
          <div className="vinyl-grooves" aria-hidden="true" />
          <button
            type="button"
            className={`vinyl-label ${coverBusy ? 'is-busy' : ''} ${useDefaultCover ? 'is-default' : 'has-cover'}`}
            onClick={openCoverPicker}
            disabled={coverBusy || !onCoverPick}
            title={coverBusy ? '更新中...' : useDefaultCover ? 'ラベルを設定' : 'ラベルを変更'}
            aria-label={coverBusy ? '更新中...' : useDefaultCover ? 'ラベルを設定' : 'ラベルを変更'}
          >
            <img
              src={coverSrc || DEFAULT_COVER}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = DEFAULT_COVER
              }}
            />
          </button>
          <div className="vinyl-spindle" aria-hidden="true" />
        </div>
        {!useDefaultCover && onCoverClear ? (
          <button
            type="button"
            className="vinyl-label-icon-btn vinyl-label-icon-btn--danger vinyl-label-reset"
            onClick={onCoverClear}
            disabled={coverBusy}
            title="ラベルを外す"
            aria-label="ラベルを外す"
          >
            <TrashIcon />
          </button>
        ) : null}
        <div className="vinyl-shadow" aria-hidden="true" />
      </div>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleCoverFile}
      />

      <p className="vinyl-track-title">{title}</p>

      {children ? <div className="vinyl-controls">{children}</div> : null}
    </div>
  )
}
