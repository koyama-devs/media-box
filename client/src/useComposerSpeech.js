import { useCallback, useEffect, useRef, useState } from 'react'

function speechCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function joinDraft(base, spoken) {
  const left = String(base || '')
  const right = String(spoken || '').trim()
  if (!right) return left
  if (!left) return right
  if (/\s$/.test(left) || /^[、。,.!?！？]/.test(right)) return `${left}${right}`
  return `${left}${right}`
}

/**
 * Browser speech-to-text for the chat composer (Web Speech API).
 * Japanese UI → ja-JP. Tap to start, tap again to stop.
 */
export default function useComposerSpeech({
  enabled = true,
  lang = 'ja-JP',
  draftRef,
  setDraft,
  onTranscript,
}) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(() => Boolean(speechCtor()))
  const recRef = useRef(null)
  const wantRef = useRef(false)
  const baseRef = useRef('')
  const finalRef = useRef('')

  const stop = useCallback(() => {
    wantRef.current = false
    setListening(false)
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    try {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      rec.stop()
    } catch {
      try { rec.abort() } catch { /* ignore */ }
    }
  }, [])

  const applyText = useCallback((next) => {
    draftRef.current = next
    setDraft(next)
    onTranscript?.()
  }, [draftRef, onTranscript, setDraft])

  const start = useCallback(() => {
    const Ctor = speechCtor()
    if (!Ctor || !enabled) {
      setSupported(false)
      return false
    }
    stop()
    wantRef.current = true
    baseRef.current = String(draftRef.current || '')
    finalRef.current = ''
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      if (!wantRef.current) return
      let finals = ''
      let interim = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = String(event.results[i]?.[0]?.transcript || '')
        if (event.results[i].isFinal) finals += piece
        else interim += piece
      }
      finalRef.current = finals
      applyText(joinDraft(baseRef.current, `${finals}${interim}`))
    }
    rec.onerror = (event) => {
      const name = String(event?.error || '')
      if (name === 'aborted' || name === 'no-speech') return
      if (name === 'not-allowed' || name === 'service-not-allowed') {
        wantRef.current = false
        setListening(false)
      }
    }
    rec.onend = () => {
      if (!wantRef.current) {
        recRef.current = null
        setListening(false)
        return
      }
      // Chrome ends after a pause; keep going until the user taps stop.
      try {
        rec.start()
      } catch {
        recRef.current = null
        wantRef.current = false
        setListening(false)
      }
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
      setSupported(true)
      return true
    } catch {
      recRef.current = null
      wantRef.current = false
      setListening(false)
      setSupported(false)
      return false
    }
  }, [applyText, draftRef, enabled, lang, stop])

  const toggle = useCallback(() => {
    if (wantRef.current || listening) {
      stop()
      return
    }
    start()
  }, [listening, start, stop])

  useEffect(() => () => stop(), [stop])

  useEffect(() => {
    if (!enabled) stop()
  }, [enabled, stop])

  return { listening, supported, toggle, stop }
}
