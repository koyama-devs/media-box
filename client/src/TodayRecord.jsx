import { useEffect, useState } from 'react'
import { listeningSpaceStyleVars, resolveListeningSpace } from './listeningSpaces'
import SpaceScenery from './SpaceScenery'

export default function TodayRecord({
  brand = 'Hana Media Box',
  dateLabel = '',
  title = '',
  quoteLines = [],
  jacketUrl = '',
  spaceId = 'ocean-night',
  backgroundUrl = null,
  customSpaces = [],
  onPlay,
  onShuffle,
  onSkip,
  shuffleRemaining = 0,
  history = [],
  onPickFromHistory,
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const quoteLinesFiltered = Array.isArray(quoteLines) ? quoteLines.filter(Boolean) : []
  const space = resolveListeningSpace(spaceId, customSpaces)

  return (
    <section
      className={`today-record today-record--space${visible ? ' is-visible' : ''}`}
      aria-label="今日の一曲"
      style={{
        ...listeningSpaceStyleVars(spaceId, customSpaces),
        ...(jacketUrl ? { '--today-jacket': `url("${jacketUrl}")` } : {}),
      }}
    >
      <div className="today-record-plane" aria-hidden="true" />
      <div className="today-record-space-veil" aria-hidden="true" />
      <SpaceScenery
        spaceId={spaceId}
        className="today-record-scenery"
        variant="hero"
        backgroundUrl={backgroundUrl || null}
        customSpaces={customSpaces}
      />
      <div className="today-record-veil" aria-hidden="true" />

      <div className="today-record-stage">
        <p className="today-brand">{brand}</p>
        <p className="today-space-label">{space.label}</p>
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
          <button
            type="button"
            className="secondary-button today-shuffle"
            onClick={onShuffle}
            disabled={!onShuffle || shuffleRemaining <= 0}
            title={shuffleRemaining > 0 ? `あと${shuffleRemaining}回` : '本日の変更回数を使い切りました'}
          >
            別のおすすめ（あと{shuffleRemaining}回）
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

        {history.length > 0 ? (
          <div className="today-history" aria-label="最近の今日の一曲">
            <p className="today-history-label">最近のおすすめ</p>
            <div className="today-history-list">
              {history.map((item) => (
                <button
                  key={`${item.id}-${item.dateKey}`}
                  type="button"
                  className="today-history-item"
                  onClick={() => onPickFromHistory?.(item.id)}
                >
                  <span>{item.title || '無題'}</span>
                  <small>{item.dateKey}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
