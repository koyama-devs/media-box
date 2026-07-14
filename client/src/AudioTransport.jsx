import { useEffect, useRef, useState } from 'react'

function formatClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const safe = Math.floor(totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.2 5.4c-.7-.4-1.5.1-1.5.9v11.4c0 .8.8 1.3 1.5.9l9.6-5.7c.7-.4.7-1.4 0-1.8L8.2 5.4z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  )
}

export default function AudioTransport({
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onToggle,
  onSeek,
}) {
  const [scrubValue, setScrubValue] = useState(null)
  const scrubbingRef = useRef(false)
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const displayTime = scrubValue != null ? scrubValue : currentTime
  const progress = safeDuration > 0 ? Math.min(1, Math.max(0, displayTime / safeDuration)) : 0

  useEffect(() => {
    if (scrubValue == null) return
    if (!scrubbingRef.current) setScrubValue(null)
  }, [currentTime, scrubValue])

  const commitSeek = (value) => {
    scrubbingRef.current = false
    setScrubValue(null)
    onSeek?.(value)
  }

  return (
    <div className="audio-transport" role="group" aria-label="再生コントロール">
      <button
        type="button"
        className="audio-transport-play"
        onClick={() => onToggle?.()}
        title={isPlaying ? '一時停止' : '再生'}
        aria-label={isPlaying ? '一時停止' : '再生'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <span className="audio-transport-time" aria-label="現在の時間">
        {formatClock(displayTime)}
      </span>

      <div className="audio-transport-track">
        <div className="audio-transport-rail" aria-hidden="true">
          <div className="audio-transport-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <input
          type="range"
          className="audio-transport-range"
          min={0}
          max={safeDuration || 0}
          step={0.05}
          value={Math.min(displayTime, safeDuration || 0)}
          disabled={safeDuration <= 0}
          aria-label="シーク"
          onPointerDown={() => {
            scrubbingRef.current = true
          }}
          onChange={(event) => {
            const next = Number(event.target.value)
            scrubbingRef.current = true
            setScrubValue(next)
          }}
          onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
              commitSeek(Number(event.currentTarget.value))
            }
          }}
        />
      </div>

      <span className="audio-transport-time is-duration" aria-label="総時間">
        {formatClock(safeDuration)}
      </span>
    </div>
  )
}
