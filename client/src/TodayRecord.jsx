import { useEffect, useState } from 'react'

export default function TodayRecord({
  brand = 'Hana Media Box',
  dateLabel = '',
  title = '',
  quoteLines = [],
  jacketUrl = '',
  onPlay,
  onSkip,
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const quoteLinesFiltered = Array.isArray(quoteLines) ? quoteLines.filter(Boolean) : []

  return (
    <section
      className={`today-record${visible ? ' is-visible' : ''}`}
      aria-label="今日の一曲"
      style={
        jacketUrl
          ? { '--today-jacket': `url("${jacketUrl}")` }
          : undefined
      }
    >
      <div className="today-record-plane" aria-hidden="true" />
      <div className="today-record-veil" aria-hidden="true" />

      <div className="today-record-stage">
        <p className="today-brand">{brand}</p>
        <h1 className="today-headline">今日の一曲</h1>
        <p className="today-support">
          {quoteLinesFiltered.length > 0 ? (
            quoteLinesFiltered.map((line) => (
              <span key={line} className="today-quote-line">
                {line}
              </span>
            ))
          ) : (
            dateLabel ? `${dateLabel}のおすすめ` : '今日のおすすめをお届けします。'
          )}
        </p>

        <div className="today-actions">
          <button type="button" className="primary-button today-play" onClick={onPlay}>
            この曲を再生
          </button>
          <button type="button" className="secondary-button today-skip" onClick={onSkip}>
            とばす
          </button>
        </div>

        <p className="today-track">
          {dateLabel ? <span>{dateLabel}</span> : null}
          {dateLabel ? <span aria-hidden="true"> · </span> : null}
          <span>{title || '無題'}</span>
        </p>
      </div>
    </section>
  )
}
