const DEFAULT_COVER = '/vinyl-default.svg'

export default function VinylPlayer({ title, coverSrc, isPlaying, children }) {
  return (
    <div className="vinyl-player">
      <div className={`vinyl-stage ${isPlaying ? 'is-playing' : ''}`}>
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
