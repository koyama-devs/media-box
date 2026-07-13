import { useEffect, useRef, useState } from 'react'
import {
  getActiveLyricIndex,
  normalizeStoredLyrics,
  parseLyricsText,
  serializeLyrics,
} from './lyrics'

export default function LyricsPanel({
  lyrics,
  currentTime = 0,
  isPlaying = false,
  busy = false,
  onSave,
  onClear,
}) {
  const normalized = normalizeStoredLyrics(lyrics)
  const lines = normalized?.lines || []
  const activeIndex = getActiveLyricIndex(lines, currentTime)
  const listRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (editing || activeIndex < 0 || !listRef.current) return
    const activeNode = listRef.current.querySelector(`[data-lyric-index="${activeIndex}"]`)
    if (!activeNode) return
    activeNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex, editing])

  useEffect(() => {
    if (!editing) setLocalError('')
  }, [editing])

  const openEditor = () => {
    setDraft(serializeLyrics(normalized || { lines: [] }))
    setLocalError('')
    setEditing(true)
  }

  const handleSave = async () => {
    const parsed = parseLyricsText(draft)
    if (parsed.lines.length === 0) {
      setLocalError('歌詞行が見つかりません。[00:12.00] 日本語 の形式で入力してください。')
      return
    }
    try {
      await onSave?.(parsed)
      setEditing(false)
      setLocalError('')
    } catch (error) {
      setLocalError(error?.message || '歌詞の保存に失敗しました。')
    }
  }

  const handleClear = async () => {
    try {
      await onClear?.()
      setEditing(false)
      setDraft('')
      setLocalError('')
    } catch (error) {
      setLocalError(error?.message || '歌詞の削除に失敗しました。')
    }
  }

  return (
    <section className={`lyrics-panel${isPlaying ? ' is-playing' : ''}`}>
      <div className="lyrics-panel-header">
        <div>
          <h4>歌詞 · Lyrics</h4>
          <p>日本語 / English · 再生に合わせてハイライト</p>
        </div>
        <div className="lyrics-panel-actions">
          {editing ? (
            <>
              <button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={busy}>
                キャンセル
              </button>
              {lines.length > 0 ? (
                <button type="button" className="danger-button" onClick={handleClear} disabled={busy}>
                  削除
                </button>
              ) : null}
              <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
                {busy ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <button type="button" className="secondary-button" onClick={openEditor} disabled={busy}>
              {lines.length > 0 ? '歌詞を編集' : '歌詞を追加'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="lyrics-editor">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={'[00:12.00] さくらさくら\nCherry blossoms, cherry blossoms\n\n[00:18.00] 野山も里も\nHills and villages too'}
            rows={10}
            spellCheck={false}
          />
          <p className="lyrics-editor-hint">
            形式: <code>[分:秒.百分秒] 日本語</code> の次の行に英語。空行で区切るか、<code>日本語 | English</code> でも可。
          </p>
          {localError ? <p className="lyrics-editor-error">{localError}</p> : null}
        </div>
      ) : lines.length === 0 ? (
        <div className="lyrics-empty">
          <p>まだ歌詞がありません。</p>
          <p>英日対訳を追加すると、再生中に現在の行がハイライトされます。</p>
        </div>
      ) : (
        <ul className="lyrics-list" ref={listRef}>
          {lines.map((line, index) => (
            <li
              key={`${line.t}-${index}`}
              data-lyric-index={index}
              className={`lyrics-line${index === activeIndex ? ' is-active' : ''}${
                index < activeIndex ? ' is-passed' : ''
              }`}
            >
              <span className="lyrics-time" aria-hidden="true">
                {formatShortTime(line.t)}
              </span>
              <div className="lyrics-text">
                <p className="lyrics-ja">{line.ja || '—'}</p>
                <p className="lyrics-en">{line.en || '—'}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatShortTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
