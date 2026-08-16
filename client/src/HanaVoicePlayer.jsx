import { useEffect, useRef, useState } from 'react'
import { normalizeVoiceSkin } from './firebase'
import { formatVoiceClock } from './useComposerVoiceNote'

export const VOICE_PLAYER_SKINS = [
  { id: 'sakura', label: '桜' },
  { id: 'yozora', label: '夜' },
  { id: 'tegami', label: '手紙' },
  { id: 'umi', label: '海' },
]

const SKIN_IDS = new Set(VOICE_PLAYER_SKINS.map((item) => item.id))

function resolveSkin(value) {
  return SKIN_IDS.has(normalizeVoiceSkin(value)) ? normalizeVoiceSkin(value) : 'sakura'
}

let exclusiveAudio = null

function EmblemArt({ skin }) {
  if (skin === 'yozora') {
    return (
      <svg className="hana-voice-emblem-art" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="42" fill="#1a1634" />
        <circle cx="28" cy="26" r="1.2" fill="#fff4dc" />
        <circle cx="62" cy="22" r="0.9" fill="#fff4dc" />
        <circle cx="70" cy="40" r="1.1" fill="#fff4dc" />
        <circle cx="22" cy="52" r="0.8" fill="#fff4dc" />
        <circle cx="58" cy="64" r="1" fill="#fff4dc" />
        <circle cx="50" cy="40" r="18" fill="#f4d7a0" />
        <circle cx="57" cy="35" r="14" fill="#1a1634" />
      </svg>
    )
  }
  if (skin === 'tegami') {
    return (
      <svg className="hana-voice-emblem-art" viewBox="0 0 88 88" aria-hidden="true">
        <rect x="10" y="22" width="68" height="46" rx="6" fill="#f3e6cc" />
        <path d="M10 28 44 50 78 28" fill="none" stroke="#c45c4a" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M10 68 34 48" fill="none" stroke="#c45c4a" strokeWidth="1.6" opacity="0.45" />
        <path d="M78 68 54 48" fill="none" stroke="#c45c4a" strokeWidth="1.6" opacity="0.45" />
        <circle cx="66" cy="58" r="8" fill="#c45c4a" />
      </svg>
    )
  }
  if (skin === 'umi') {
    return (
      <svg className="hana-voice-emblem-art" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r="42" fill="#6aa9c0" />
        <circle cx="32" cy="28" r="18" fill="#d7eef3" opacity="0.55" />
        <path d="M14 50c8-8 16-8 24 0s16 8 24 0 16-8 24 0" fill="none" stroke="#fff8f0" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
        <path d="M14 60c8-7 16-7 24 0s16 7 24 0 16-7 24 0" fill="none" stroke="#fff8f0" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
      </svg>
    )
  }
  return (
    <svg className="hana-voice-emblem-art" viewBox="0 0 88 88" aria-hidden="true">
      <g fill="#efb3c0">
        <ellipse cx="44" cy="28" rx="12" ry="20" />
        <ellipse cx="44" cy="28" rx="12" ry="20" transform="rotate(72 44 44)" />
        <ellipse cx="44" cy="28" rx="12" ry="20" transform="rotate(144 44 44)" />
        <ellipse cx="44" cy="28" rx="12" ry="20" transform="rotate(216 44 44)" />
        <ellipse cx="44" cy="28" rx="12" ry="20" transform="rotate(288 44 44)" />
      </g>
      <circle cx="44" cy="44" r="16" fill="#fff4ea" />
    </svg>
  )
}

function PlayMark({ playing }) {
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M8.2 5.4c-.7-.4-1.5.1-1.5.9v11.4c0 .8.8 1.3 1.5.9l9.6-5.7c.7-.4.7-1.4 0-1.8L8.2 5.4Z" />
    </svg>
  )
}

export default function HanaVoicePlayer({
  src,
  skin = 'sakura',
  durationMs = 0,
  compact = false,
  uploading = false,
}) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(Math.max(0, Number(durationMs) || 0) / 1000)
  const resolvedSkin = resolveSkin(skin)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    setPlaying(false)
    setCurrent(0)
    const onTime = () => setCurrent(audio.currentTime || 0)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    const onEnd = () => setPlaying(false)
    const onPause = () => {
      if (exclusiveAudio === audio) setPlaying(false)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('pause', onPause)
    try {
      audio.load()
    } catch { /* ignore */ }
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('pause', onPause)
      if (exclusiveAudio === audio) {
        try { audio.pause() } catch { /* ignore */ }
        exclusiveAudio = null
      }
    }
  }, [src])

  const toggle = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const audio = audioRef.current
    if (!audio || !src || uploading) return
    if (exclusiveAudio && exclusiveAudio !== audio) {
      try { exclusiveAudio.pause() } catch { /* ignore */ }
    }
    if (audio.paused) {
      exclusiveAudio = audio
      const play = audio.play()
      if (play && typeof play.then === 'function') {
        void play.then(() => setPlaying(true)).catch(() => setPlaying(false))
      } else {
        setPlaying(true)
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const total = duration > 0 ? duration : Math.max(0, Number(durationMs) || 0) / 1000
  const progress = total > 0 ? Math.min(1, current / total) : 0

  return (
    <div
      className={`hana-voice-player is-${resolvedSkin}${compact ? ' is-compact' : ''}${playing ? ' is-playing' : ''}`}
      data-no-bubble-press="true"
      style={{ '--hana-voice-progress': `${Math.round(progress * 100)}%` }}
    >
      <audio ref={audioRef} src={src || undefined} preload="auto" playsInline />
      <button
        type="button"
        className="hana-voice-emblem"
        aria-label={playing ? '一時停止' : '再生'}
        disabled={!src || uploading}
        onClick={toggle}
      >
        <span className="hana-voice-ring" aria-hidden="true" />
        <EmblemArt skin={resolvedSkin} />
        <span className="hana-voice-play-badge">
          <PlayMark playing={playing} />
        </span>
      </button>
      <span className="hana-voice-time">
        {formatVoiceClock(current * 1000)}
        <i>/</i>
        {formatVoiceClock(total * 1000)}
      </span>
      {uploading ? <span className="hana-chat-image-status">送信中…</span> : null}
    </div>
  )
}

export function VoiceSkinPicker({ value, onChange }) {
  const current = resolveSkin(value)
  return (
    <div className="hana-voice-skins" role="radiogroup" aria-label="ボイスの見た目">
      {VOICE_PLAYER_SKINS.map((skin) => (
        <button
          key={skin.id}
          type="button"
          role="radio"
          aria-checked={current === skin.id}
          className={`hana-voice-skin is-${skin.id}${current === skin.id ? ' is-active' : ''}`}
          title={skin.label}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onChange(skin.id)}
        >
          <EmblemArt skin={skin.id} />
          <span>{skin.label}</span>
        </button>
      ))}
    </div>
  )
}
