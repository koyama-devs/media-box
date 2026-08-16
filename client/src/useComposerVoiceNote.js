import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_MS = 60_000
const MIN_BYTES = 400
const TICK_MS = 200

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  return types.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type)
    } catch {
      return false
    }
  }) || ''
}

function blobTypeFor(mime) {
  const value = String(mime || '').toLowerCase()
  if (value.includes('mp4') || value.includes('m4a') || value.includes('aac')) return 'audio/mp4'
  if (value.startsWith('audio/')) return value.split(';')[0]
  return 'audio/webm'
}

function extForMime(mime) {
  const value = String(mime || '').toLowerCase()
  if (value.includes('mp4') || value.includes('m4a') || value.includes('aac')) return 'm4a'
  if (value.includes('mpeg') || value.includes('mp3')) return 'mp3'
  return 'webm'
}

function recorderCanPause(rec) {
  return Boolean(rec && typeof rec.pause === 'function' && typeof rec.resume === 'function')
}

function streamIsLive(stream) {
  return Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === 'live'))
}

/**
 * Voice memo: record / pause / resume, then finish for preview + send.
 * Mic is requested only when recording starts, and tracks are stopped
 * as soon as the take ends so the OS recording indicator goes away.
 */
export default function useComposerVoiceNote({ enabled = true } = {}) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('armed')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const recRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const recordedMsRef = useRef(0)
  const segmentStartRef = useRef(0)
  const tickRef = useRef(0)
  const limitRef = useRef(0)
  const mimeRef = useRef('')
  const resolveStopRef = useRef(null)
  const recGenRef = useRef(0)
  const previewUrlRef = useRef('')
  const finishRef = useRef(async () => null)

  const supported = typeof window !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined'

  const revokePreview = () => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current) } catch { /* ignore */ }
      previewUrlRef.current = ''
    }
  }

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((track) => {
      try { track.stop() } catch { /* ignore */ }
    })
    streamRef.current = null
  }

  const clearTimers = () => {
    window.clearInterval(tickRef.current)
    window.clearTimeout(limitRef.current)
    tickRef.current = 0
    limitRef.current = 0
  }

  const liveElapsed = () => {
    const rec = recRef.current
    const extra = rec && rec.state === 'recording'
      ? Math.max(0, Date.now() - segmentStartRef.current)
      : 0
    return Math.min(MAX_MS, recordedMsRef.current + extra)
  }

  const armLimit = (remaining) => {
    window.clearTimeout(limitRef.current)
    const wait = Math.max(0, remaining)
    if (wait <= 16) {
      limitRef.current = 0
      return
    }
    limitRef.current = window.setTimeout(() => {
      void finishRef.current()
    }, wait)
  }

  const startTick = () => {
    window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      setElapsedMs(liveElapsed())
    }, TICK_MS)
  }

  const stopActiveRecorder = () => {
    recGenRef.current += 1
    clearTimers()
    const rec = recRef.current
    recRef.current = null
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* ignore */ }
    }
    chunksRef.current = []
    resolveStopRef.current = null
    recordedMsRef.current = 0
    segmentStartRef.current = 0
  }

  const ensureMicStream = useCallback(async () => {
    if (!supported) {
      setError('この端末は音声メッセージに対応していません。')
      return null
    }
    if (streamIsLive(streamRef.current)) return streamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (streamIsLive(streamRef.current)) {
        stream.getTracks().forEach((track) => {
          try { track.stop() } catch { /* ignore */ }
        })
        return streamRef.current
      }
      streamRef.current = stream
      return stream
    } catch (err) {
      const name = String(err?.name || '')
      setError(name === 'NotAllowedError'
        ? 'マイクの許可が必要です。'
        : '録音を開始できませんでした。')
      return null
    }
  }, [supported])

  const discardTake = useCallback(() => {
    stopActiveRecorder()
    releaseMic()
    revokePreview()
    setPreviewUrl('')
    setPreviewFile(null)
    setElapsedMs(0)
    setError('')
    setPhase('armed')
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    stopActiveRecorder()
    releaseMic()
    revokePreview()
    setPreviewUrl('')
    setOpen(false)
    setPhase('armed')
    setElapsedMs(0)
    setError('')
    setPreviewFile(null)
  }, [])

  const openDock = useCallback(() => {
    if (!enabled) return
    stopActiveRecorder()
    releaseMic()
    revokePreview()
    setPreviewUrl('')
    setError('')
    setElapsedMs(0)
    setPhase('armed')
    setPreviewFile(null)
    setOpen(true)
  }, [enabled])

  const finishRecording = useCallback(() => {
    return new Promise((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }
      recordedMsRef.current = liveElapsed()
      resolveStopRef.current = resolve
      clearTimers()
      setElapsedMs(recordedMsRef.current)
      try {
        if (rec.state === 'paused') rec.resume()
      } catch { /* ignore */ }
      try {
        rec.stop()
      } catch {
        resolveStopRef.current = null
        resolve(null)
      }
    })
  }, [])
  finishRef.current = finishRecording

  const pauseRecording = useCallback(() => {
    const rec = recRef.current
    if (!rec || rec.state !== 'recording') return false
    if (!recorderCanPause(rec)) {
      void finishRecording()
      return false
    }
    recordedMsRef.current = liveElapsed()
    clearTimers()
    try {
      rec.pause()
      try { rec.requestData?.() } catch { /* ignore */ }
    } catch {
      void finishRecording()
      return false
    }
    setElapsedMs(recordedMsRef.current)
    setPhase('paused')
    return true
  }, [finishRecording])

  const resumeRecording = useCallback(() => {
    const rec = recRef.current
    if (!rec || rec.state !== 'paused') return false
    const remaining = MAX_MS - recordedMsRef.current
    if (remaining <= 80) {
      void finishRecording()
      return false
    }
    try {
      rec.resume()
    } catch {
      return false
    }
    segmentStartRef.current = Date.now()
    setPhase('recording')
    startTick()
    armLimit(remaining)
    return true
  }, [finishRecording])

  const startRecording = useCallback(async () => {
    if (!supported || !enabled) {
      setError('この端末は音声メッセージに対応していません。')
      return false
    }
    stopActiveRecorder()
    revokePreview()
    setPreviewUrl('')
    setPreviewFile(null)
    const gen = recGenRef.current
    setError('')
    recordedMsRef.current = 0
    setElapsedMs(0)
    const stream = await ensureMicStream()
    if (!stream) return false
    if (gen !== recGenRef.current) {
      releaseMic()
      return false
    }
    try {
      const mime = pickRecorderMime()
      mimeRef.current = mime
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (event) => {
        if (event.data && event.data.size) chunksRef.current.push(event.data)
      }
      rec.onstop = () => {
        if (recRef.current === rec) recRef.current = null
        if (gen !== recGenRef.current) {
          resolveStopRef.current = null
          return
        }
        const type = blobTypeFor(rec.mimeType || mimeRef.current)
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        releaseMic()
        const ms = Math.max(recordedMsRef.current, 0)
        const done = resolveStopRef.current
        resolveStopRef.current = null
        if (!blob.size || blob.size < MIN_BYTES || ms < 350) {
          setPhase('armed')
          setElapsedMs(0)
          setPreviewFile(null)
          setPreviewUrl('')
          done?.(null)
          return
        }
        const file = new File(
          [blob],
          `voice-${Date.now()}.${extForMime(type)}`,
          { type: blob.type || type },
        )
        const url = URL.createObjectURL(file)
        revokePreview()
        previewUrlRef.current = url
        setPreviewFile(file)
        setPreviewUrl(url)
        setPhase('preview')
        setElapsedMs(ms)
        done?.({ file, durationMs: ms })
      }
      recRef.current = rec
      segmentStartRef.current = Date.now()
      rec.start(250)
      setPhase('recording')
      startTick()
      armLimit(MAX_MS)
      return true
    } catch {
      releaseMic()
      setError('録音を開始できませんでした。')
      setPhase('armed')
      return false
    }
  }, [enabled, ensureMicStream, supported])

  const toggleRecord = useCallback(async () => {
    if (phase === 'recording') {
      pauseRecording()
      return
    }
    if (phase === 'paused') {
      resumeRecording()
      return
    }
    if (phase === 'preview') return
    await startRecording()
  }, [pauseRecording, phase, resumeRecording, startRecording])

  useEffect(() => {
    if (enabled) return undefined
    close()
    releaseMic()
    return undefined
  }, [close, enabled])

  useEffect(() => () => {
    stopActiveRecorder()
    releaseMic()
    revokePreview()
  }, [])

  return {
    open,
    phase,
    elapsedMs,
    maxMs: MAX_MS,
    error,
    supported,
    previewFile,
    previewUrl,
    openDock,
    close,
    discardTake,
    toggleRecord,
    startRecording,
    finishRecording,
  }
}

export function formatVoiceClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
