import { useEffect, useRef, useState } from 'react'
import { assistLiveCallForOwner } from './firebase'

const RMS_SPEAK = 0.028
const SILENCE_FLUSH_MS = 1100
const MAX_UTTERANCE_MS = 9000
const MIN_BLOB_BYTES = 1800
const TICK_MS = 80

function pickAudioRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type)
    } catch {
      return false
    }
  }) || ''
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw)
    }
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

function nextLineId() {
  return `call-tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Hana-only: capture the *remote* WebRTC audio, transcribe the guest,
 * and draft spoken replies. Nothing is written to Firestore.
 */
export default function useHanaCallOwnerAssist({
  enabled,
  phase,
  remoteStreamRef,
  guestName,
}) {
  const [lines, setLines] = useState([])
  const [replies, setReplies] = useState([])
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [assistError, setAssistError] = useState('')

  const linesRef = useRef([])
  const inFlightRef = useRef(false)
  const queuedBlobRef = useRef(null)

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  useEffect(() => {
    if (!enabled || phase !== 'connected') {
      setLines([])
      setReplies([])
      setListening(false)
      setBusy(false)
      setUnsupported(false)
      setAssistError('')
      linesRef.current = []
      queuedBlobRef.current = null
      return undefined
    }

    let cancelled = false
    let audioCtx = null
    let analyser = null
    let source = null
    let recorder = null
    let chunks = []
    let speaking = false
    let silenceMs = 0
    let speechMs = 0
    let tickTimer = 0
    let waitTimer = 0
    let clonedTracks = []
    const mimeType = pickAudioRecorderMime()

    const stopRecorder = () => {
      const rec = recorder
      recorder = null
      if (!rec) return
      try {
        if (rec.state !== 'inactive') rec.stop()
      } catch {
        /* ignore */
      }
    }

    const sendBlob = async (blob) => {
      if (cancelled || !blob || blob.size < MIN_BLOB_BYTES) return
      if (inFlightRef.current) {
        queuedBlobRef.current = blob
        return
      }
      inFlightRef.current = true
      setBusy(true)
      setAssistError('')
      try {
        const audioBase64 = await blobToBase64(blob)
        if (cancelled) return
        const recentTranscript = linesRef.current
          .map((item) => item.text)
          .filter(Boolean)
          .slice(-6)
          .join('\n')
        const data = await assistLiveCallForOwner({
          audioBase64,
          mimeType: blob.type || mimeType || 'audio/webm',
          guestName,
          recentTranscript,
        })
        if (cancelled) return
        const text = String(data.transcript || '').trim()
        if (text) {
          const line = {
            id: nextLineId(),
            text,
            translationVi: String(data.translationVi || '').trim(),
          }
          setLines((prev) => [...prev, line].slice(-12))
        }
        if (Array.isArray(data.replies) && data.replies.length) {
          setReplies(data.replies)
        }
        if (data.reason === 'quota') {
          setAssistError('いま解析できません（上限）')
        }
      } catch {
        if (!cancelled) setAssistError('聞き取りに失敗しました')
      } finally {
        inFlightRef.current = false
        setBusy(false)
        const queued = queuedBlobRef.current
        queuedBlobRef.current = null
        if (queued && !cancelled) void sendBlob(queued)
      }
    }

    const flushUtterance = () => {
      speaking = false
      silenceMs = 0
      speechMs = 0
      setListening(false)
      stopRecorder()
    }

    const startUtterance = (stream) => {
      if (recorder || typeof MediaRecorder === 'undefined') return
      chunks = []
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
      } catch {
        setUnsupported(true)
        return
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data)
      }
      const rec = recorder
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' })
        chunks = []
        void sendBlob(blob)
      }
      try {
        recorder.start()
        speaking = true
        silenceMs = 0
        speechMs = 0
        setListening(true)
      } catch {
        recorder = null
        setUnsupported(true)
      }
    }

    const attachAndWatch = (stream) => {
      const clones = (stream.getAudioTracks() || []).map((track) => track.clone())
      clonedTracks = clones
      const audioOnly = new MediaStream(clones)
      if (!audioOnly.getAudioTracks().length) {
        clones.forEach((track) => track.stop())
        return false
      }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) {
          setUnsupported(true)
          return false
        }
        audioCtx = new Ctx()
        void audioCtx.resume?.()
        source = audioCtx.createMediaStreamSource(audioOnly)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.35
        source.connect(analyser)
      } catch {
        setUnsupported(true)
        return false
      }

      const samples = new Uint8Array(analyser.fftSize)
      tickTimer = window.setInterval(() => {
        if (cancelled || !analyser) return
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i += 1) {
          const n = (samples[i] - 128) / 128
          sum += n * n
        }
        const rms = Math.sqrt(sum / samples.length)
        const hot = rms >= RMS_SPEAK
        if (hot) {
          if (!speaking) startUtterance(audioOnly)
          silenceMs = 0
          speechMs += TICK_MS
          if (speechMs >= MAX_UTTERANCE_MS) flushUtterance()
          return
        }
        if (!speaking) return
        silenceMs += TICK_MS
        speechMs += TICK_MS
        if (silenceMs >= SILENCE_FLUSH_MS || speechMs >= MAX_UTTERANCE_MS) {
          flushUtterance()
        }
      }, TICK_MS)
      return true
    }

    const waitForRemote = () => {
      if (cancelled) return
      const stream = remoteStreamRef.current
      const hasAudio = Boolean(stream?.getAudioTracks?.()?.some((track) => track.readyState === 'live'))
      if (!hasAudio) {
        waitTimer = window.setTimeout(waitForRemote, 400)
        return
      }
      if (typeof MediaRecorder === 'undefined') {
        setUnsupported(true)
        return
      }
      attachAndWatch(stream)
    }

    waitForRemote()

    return () => {
      cancelled = true
      window.clearTimeout(waitTimer)
      window.clearInterval(tickTimer)
      stopRecorder()
      try {
        source?.disconnect()
      } catch {
        /* ignore */
      }
      try {
        audioCtx?.close()
      } catch {
        /* ignore */
      }
      clonedTracks.forEach((track) => {
        try { track.stop() } catch { /* ignore */ }
      })
      clonedTracks = []
      setListening(false)
      setBusy(false)
    }
  }, [enabled, phase, remoteStreamRef, guestName])

  return {
    lines,
    replies,
    listening,
    busy,
    unsupported,
    assistError,
  }
}
