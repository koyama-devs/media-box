import { useEffect, useState } from 'react'

export default function TodayRecord({
  brand = 'hana mediabox',
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

  const quote = Array.isArray(quoteLines) ? quoteLines.filter(Boolean).join(' ') : ''

  return (
    <section
      className={`today-record${visible ? ' is-visible' : ''}`}
      aria-label="今日の一枚"
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
        <h1 className="today-headline">今日の一枚</h1>
        <p className="today-support">
          {quote || (dateLabel ? `${dateLabel}の一枚` : '今日、この一枚を。')}
        </p>

        <div className="today-actions">
          <button type="button" className="primary-button today-play" onClick={onPlay}>
            この一枚を聴く
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
