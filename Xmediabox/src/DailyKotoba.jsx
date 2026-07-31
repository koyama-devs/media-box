import { useEffect, useRef, useState } from 'react'
import { getNextKotoba, getTodayKotoba, speakKotoba } from './japaneseKotoba'

/**
 * Daily Japanese phrase — a short “podcast” moment you can read or hear.
 */
export default function DailyKotoba({ hidden = false }) {
  const [kotoba, setKotoba] = useState(() => getTodayKotoba())
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [entered, setEntered] = useState(false)
  const cancelSpeakRef = useRef(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => {
    cancelSpeakRef.current?.()
  }, [])

  if (hidden) return null

  const stopSpeaking = () => {
    cancelSpeakRef.current?.()
    cancelSpeakRef.current = null
    setSpeaking(false)
  }

  const handleListen = () => {
    setSpeechError('')
    if (speaking) {
      stopSpeaking()
      return
    }

    cancelSpeakRef.current = speakKotoba(`${kotoba.ja}。${kotoba.note}`, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false)
        cancelSpeakRef.current = null
      },
      onError: (error) => {
        setSpeaking(false)
        cancelSpeakRef.current = null
        setSpeechError(error?.message || '読み上げに失敗しました。')
      },
    })
  }

  const handleAnother = () => {
    stopSpeaking()
    setSpeechError('')
    setKotoba((current) => getNextKotoba(current.id))
  }

  return (
    <section
      className={`daily-kotoba${entered ? ' is-visible' : ''}${speaking ? ' is-speaking' : ''}`}
      aria-label="今日の言葉"
    >
      <div className="daily-kotoba-seal" aria-hidden="true">言</div>
      <div className="daily-kotoba-body">
        <p className="daily-kotoba-kicker">今日の言葉 · 小さなポッドキャスト</p>
        <p className="daily-kotoba-reading">{kotoba.reading}</p>
        <h3 className="daily-kotoba-phrase">{kotoba.ja}</h3>
        <p className="daily-kotoba-note">{kotoba.note}</p>
        {speechError ? <p className="daily-kotoba-error">{speechError}</p> : null}

        <div className="daily-kotoba-actions">
          <button
            type="button"
            className={`daily-kotoba-listen${speaking ? ' is-active' : ''}`}
            onClick={handleListen}
            aria-pressed={speaking}
          >
            <span className="daily-kotoba-wave" aria-hidden="true">
              <i /><i /><i />
            </span>
            {speaking ? '停止' : '聴く'}
          </button>
          <button type="button" className="daily-kotoba-next" onClick={handleAnother}>
            別の言葉
          </button>
        </div>
      </div>
    </section>
  )
}
