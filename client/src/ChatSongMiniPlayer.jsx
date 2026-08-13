import { memo, useEffect, useState } from 'react'
import {
  requestChatTrackToggle,
  requestOpenMainPlayer,
  subscribeChatPlaybackState,
  trackIdFromShareUrl,
} from './chatCardShare'

/**
 * Inline song controls under a shared listening card in chat:
 * spinning disc + title + play/pause + jump to main player.
 */
const ChatSongMiniPlayer = memo(function ChatSongMiniPlayer({ title, shareUrl }) {
  const trackId = trackIdFromShareUrl(shareUrl)
  const [playingThis, setPlayingThis] = useState(false)

  useEffect(() => {
    if (!trackId) return undefined
    return subscribeChatPlaybackState((state) => {
      setPlayingThis(Boolean(state.playing) && state.trackId === trackId)
    })
  }, [trackId])

  if (!trackId) return null

  const label = String(title || '').trim() || '曲カード'

  return (
    <div className="hana-chat-song-player" data-no-bubble-press="true">
      <span
        className={`hana-chat-song-disc${playingThis ? ' is-spinning' : ''}`}
        aria-hidden="true"
      >
        <span className="hana-chat-song-disc-label" />
      </span>
      <strong className="hana-chat-song-player-title">{label}</strong>
      <button
        type="button"
        className={`hana-chat-song-player-btn is-toggle${playingThis ? ' is-playing' : ''}`}
        aria-label={playingThis ? '一時停止' : '再生'}
        title={playingThis ? '一時停止' : '再生'}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          requestChatTrackToggle(trackId)
        }}
      >
        {playingThis ? (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M8.2 5.4c-.7-.4-1.5.1-1.5.9v11.4c0 .8.8 1.3 1.5.9l9.6-5.7c.7-.4.7-1.4 0-1.8L8.2 5.4Z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="hana-chat-song-player-btn is-open"
        aria-label="プレイヤーを開く"
        title="プレイヤーを開く"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          requestOpenMainPlayer(trackId)
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H5v4M15 5h4v4M5 15v4h4M19 15v4h-4M5 9l5.5 5.5M19 9l-5.5 5.5"
          />
        </svg>
      </button>
    </div>
  )
})

export default ChatSongMiniPlayer
