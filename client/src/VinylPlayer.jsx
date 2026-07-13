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

export default function VinylPlayer({ title, coverSrc, isPlaying, children }) {
  const useDefaultCover = !coverSrc

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
          <div className="vinyl-label">
            <img
              src={coverSrc || DEFAULT_COVER}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = DEFAULT_COVER
              }}
            />
          </div>
          <div className="vinyl-spindle" aria-hidden="true" />
        </div>
        <div className="vinyl-shadow" aria-hidden="true" />
      </div>

      <p className="vinyl-track-title">{title}</p>

      {children ? <div className="vinyl-controls">{children}</div> : null}
    </div>
  )
}
