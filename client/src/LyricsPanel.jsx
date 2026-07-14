import { useEffect, useRef, useState } from 'react'
import {
  formatTimestamp,
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
  onSeek,
}) {
  const normalized = normalizeStoredLyrics(lyrics)
  const lines = normalized?.lines || []
  const activeIndex = getActiveLyricIndex(lines, currentTime)
  const listRef = useRef(null)
  const editorRef = useRef(null)
  const clickTimerRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')
  const [focusStamp, setFocusStamp] = useState(null)

  useEffect(() => {
    if (editing || activeIndex < 0 || !listRef.current) return
    const list = listRef.current
    const activeNode = list.querySelector(`[data-lyric-index="${activeIndex}"]`)
    if (!activeNode) return

    const listRect = list.getBoundingClientRect()
    const nodeRect = activeNode.getBoundingClientRect()
    const nextTop =
      list.scrollTop +
      (nodeRect.top - listRect.top) -
      list.clientHeight / 2 +
      nodeRect.height / 2

    list.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    })
  }, [activeIndex, editing])

  useEffect(() => {
    if (!editing) setLocalError('')
  }, [editing])

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!editing || focusStamp == null || !editorRef.current) return
    const textarea = editorRef.current
    const stamp = `[${formatTimestamp(focusStamp)}]`
    const start = draft.indexOf(stamp)

    const focusEditor = () => {
      textarea.focus()
      if (start < 0) {
        setFocusStamp(null)
        return
      }

      const end = start + stamp.length
      textarea.setSelectionRange(start, end)

      const style = window.getComputedStyle(textarea)
      const lineHeight = Number.parseFloat(style.lineHeight) || 22
      const paddingTop = Number.parseFloat(style.paddingTop) || 0
      const before = draft.slice(0, start)
      const lineIndex = before.split('\n').length - 1
      const target =
        paddingTop + lineIndex * lineHeight - textarea.clientHeight / 2 + lineHeight

      textarea.scrollTop = Math.max(0, target)
      setFocusStamp(null)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focusEditor)
    })
  }, [editing, focusStamp, draft])

  const openEditor = (stampSeconds = null) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setDraft(serializeLyrics(normalized || { lines: [] }))
    setLocalError('')
    setFocusStamp(typeof stampSeconds === 'number' ? stampSeconds : null)
    setEditing(true)
  }

  const handleLyricClick = (time) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      onSeek?.(time)
    }, 220)
  }

  const handleLyricDoubleClick = (event, time) => {
    event.preventDefault()
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    openEditor(time)
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
          <p>クリックでその位置から再生 · ダブルクリックで編集</p>
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
            <button type="button" className="secondary-button" onClick={() => openEditor()} disabled={busy}>
              {lines.length > 0 ? '歌詞を編集' : '歌詞を追加'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="lyrics-editor">
          <textarea
            ref={editorRef}
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
              title="クリック: 再生 / ダブルクリック: 編集"
              onClick={() => handleLyricClick(line.t)}
              onDoubleClick={(event) => handleLyricDoubleClick(event, line.t)}
            >
              <span className="lyrics-time">{formatShortTime(line.t)}</span>
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
