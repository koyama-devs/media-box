import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  playCallConnected,
  playCallEnded,
  startIncomingRingtone,
  startOutgoingRingback,
  stopCallSounds,
  unlockCallSounds,
} from './callSounds'
import {
  addChatCallCandidate,
  createChatCall,
  getFirebaseErrorMessage,
  postChatCallLog,
  subscribeChatCallCandidates,
  subscribeChatCalls,
  updateChatCall,
  upsertChatCallHistory,
} from './firebase'
import './hana-call.css'
import useHanaCallOwnerAssist from './useHanaCallOwnerAssist'

const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed', 'failed'])
const RING_MAX_AGE_MS = 90_000
const ICE_CACHE_TTL_MS = 2 * 60 * 1000

const USER_FAIL_GENERIC = '通話を接続できませんでした。もう一度お試しください。'
const USER_FAIL_PERMISSION = 'マイクがブロックされています。下の手順で許可してから、もう一度通話してください。'
const USER_FAIL_DEVICE = 'マイクが見つかりません。別の端末でもう一度お試しください。'
const USER_FAIL_INSECURE = '安全な接続（HTTPS）で開いてください。'

function classifyCallFailure(reason, extra = {}) {
  const name = String(reason?.name || extra.name || '')
  // Do NOT route plain strings through getFirebaseErrorMessage — it defaults to
  // 「アップロードに失敗しました」and hides the real call failure.
  const rawMessage = String(
    (reason && typeof reason === 'object'
      ? (getFirebaseErrorMessage(reason) || reason.message || '')
      : '')
    || (typeof reason === 'string' ? reason : '')
    || extra.message
    || '',
  ).trim()
  let failCode = 'unknown'
  if (extra.iceFailed || /ice|turn|nat|接続できません|回線|Connecting timeout/i.test(rawMessage)) {
    failCode = 'ice_failed'
  } else if (/NotAllowedError|PermissionDeniedError/i.test(name) || /permission|許可|ブロック/i.test(rawMessage)) {
    failCode = 'permission'
  } else if (/NotFoundError/i.test(name) || /マイクが見つかり/i.test(rawMessage)) {
    failCode = 'device'
  } else if (/NotSupported|HTTPS|対応していません|安全な接続/i.test(rawMessage) || /NotSupportedError/i.test(name)) {
    failCode = 'unsupported'
  } else if (/Firebase|firestore|network|Failed to fetch|signaling|candidate/i.test(rawMessage)) {
    failCode = 'signaling'
  } else if (/getUserMedia|media|Overconstrained/i.test(rawMessage) || /OverconstrainedError/i.test(name)) {
    failCode = 'media'
  }

  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 140) : ''
  const failReason = [
    name && `name=${name}`,
    rawMessage && `message=${rawMessage.slice(0, 280)}`,
    extra.iceConnectionState && `ice=${extra.iceConnectionState}`,
    extra.connectionState && `pc=${extra.connectionState}`,
    extra.hasTurn != null && `hasTurn=${extra.hasTurn}`,
    extra.phase && `phase=${extra.phase}`,
    ua && `ua=${ua}`,
  ].filter(Boolean).join(' | ')

  const userMessage = failCode === 'permission'
    ? USER_FAIL_PERMISSION
    : failCode === 'device'
      ? USER_FAIL_DEVICE
      : failCode === 'unsupported'
        ? ( /HTTPS|安全な接続/i.test(rawMessage) ? USER_FAIL_INSECURE : rawMessage || USER_FAIL_GENERIC )
      : failCode === 'ice_failed'
        ? '通話回線を接続できませんでした。Wi‑Fiを切り替えるか、もう一度お試しください。'
        : USER_FAIL_GENERIC

  return { failCode, failReason, userMessage }
}

const iceServersCache = { at: 0, servers: null }
const METERED_FETCH_TIMEOUT_MS = 6000
const CONNECTING_TIMEOUT_MS = 90_000

function stunOnlyServers() {
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
  ]
}

function hasTurnServer(iceServers) {
  return (iceServers || []).some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls]
    return urls.some((url) => /^turns?:/i.test(String(url || '')))
  })
}

/**
 * Resolve ICE servers for WebRTC.
 * Cross-country / carrier-NAT (e.g. Vietnam ↔ Japan) almost always needs a
 * working TURN relay. Static openrelayproject credentials no longer work —
 * use Metered free API key (VITE_METERED_TURN_CREDENTIALS_URL) or a private TURN.
 */
function normalizeIceServers(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((server) => {
      const urls = server?.urls || server?.url
      if (!urls) return null
      const entry = { urls }
      if (server.username) entry.username = server.username
      if (server.credential) entry.credential = server.credential
      return entry
    })
    .filter(Boolean)
}

async function fetchMeteredIceServers(credentialUrl) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), METERED_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(credentialUrl, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    const list = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.iceServers) ? payload.iceServers : null)
    return normalizeIceServers(list)
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function resolveIceServers() {
  const now = Date.now()
  if (iceServersCache.servers && now - iceServersCache.at < ICE_CACHE_TTL_MS) {
    return iceServersCache.servers
  }

  const credentialUrl = String(
    import.meta.env.VITE_METERED_TURN_CREDENTIALS_URL
    || import.meta.env.VITE_WEBRTC_ICE_URL
    || '',
  ).trim()

  if (credentialUrl) {
    let list = await fetchMeteredIceServers(credentialUrl)
    if (!list?.length) list = await fetchMeteredIceServers(credentialUrl)
    if (list?.length) {
      const servers = [...stunOnlyServers(), ...list]
      iceServersCache.at = now
      iceServersCache.servers = servers
      return servers
    }
  }

  const turnUrl = String(import.meta.env.VITE_WEBRTC_TURN_URL || '').trim()
  if (turnUrl) {
    const servers = [
      ...stunOnlyServers(),
      {
        urls: turnUrl.split(',').map((item) => item.trim()).filter(Boolean),
        username: String(import.meta.env.VITE_WEBRTC_TURN_USERNAME || ''),
        credential: String(import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL || ''),
      },
    ]
    iceServersCache.at = now
    iceServersCache.servers = servers
    return servers
  }

  const stun = stunOnlyServers()
  iceServersCache.at = now
  iceServersCache.servers = stun
  return stun
}

function rtcConfiguration(iceServers) {
  const servers = iceServers?.length ? iceServers : stunOnlyServers()
  // Prefer 'all' over relay-only: relay-only fails hard when TURN allocate
  // flakes (even with hasTurn=true). Chrome still uses TURN when needed.
  return {
    iceServers: servers,
    iceCandidatePoolSize: 0,
  }
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
    </svg>
  )
}

function PhoneDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="is-hangup">
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
    </svg>
  )
}

function MicIcon({ off = false }) {
  return off ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28Zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 0 0-5.94-.3l2.92 2.92V11c0 .06-.01.11-.02.17ZM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  )
}

function CamIcon({ off = false }) {
  return off ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="m3.27 2 18 18-1.41 1.41L15.73 17H5c-1.1 0-2-.9-2-2V7c0-.55.22-1.05.59-1.41L1.86 3.41 3.27 2ZM21 6.5 17 10V7c0-1.1-.9-2-2-2H8.83l10.76 10.76L21 17.5v-11Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17 10.5V7c0-1.1-.9-2-2-2H5C3.9 5 3 5.9 3 7v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-3.5l4 4v-11l-4 4Z" />
    </svg>
  )
}


function statusLabel(phase, cameraOn, durationLabel, callState = null) {
  if (phase === 'ringing') return '着信中'
  if (phase === 'calling') {
    if (callState?.answeredAtIso && !callState?.answer) return '相手が応答しました…'
    return '呼び出し中…'
  }
  if (phase === 'preparing') return '接続を準備しています…'
  if (phase === 'connecting') return '接続しています…'
  if (phase === 'connected') return durationLabel || (cameraOn ? '通話中 · カメラON' : '通話中')
  return ''
}

/**
 * Unified live voice/video call (no MediaRecorder / no recording).
 * Mic+camera permission once at start; camera tracks stay disabled until toggled.
 * listenThreadIds: threads to watch for incoming rings (owner may watch many).
 */
export default function HanaCall({
  threadId,
  listenThreadIds,
  role,
  partnerName,
  canStart = true,
  compact = false,
  onIncoming,
  onBeforeStart,
  buttonsHost = null,
}) {
  const [call, setCall] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [permBlocked, setPermBlocked] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const candidateUnsubRef = useRef(null)
  const queuedCandidatesRef = useRef([])
  const callRef = useRef(null)
  const cameraOnRef = useRef(false)
  const connectedAtRef = useRef(0)
  const prevPhaseRef = useRef('idle')
  const announcedConnectRef = useRef(false)
  const iceRestartedRef = useRef(false)
  const finishCallRef = useRef(async () => {})
  const failDetailRef = useRef(null)
  const lastIceServersRef = useRef([])
  const phaseRef = useRef('idle')
  const applyingAnswerRef = useRef(false)
  const ownerAssist = useHanaCallOwnerAssist({
    enabled: role === 'hana',
    phase,
    remoteStreamRef,
    guestName: partnerName,
  })
  const ownerAssistScrollRef = useRef(null)

  useEffect(() => {
    if (role !== 'hana' || phase !== 'connected') return
    const node = ownerAssistScrollRef.current
    if (!node) return
    const pinLatest = () => {
      node.scrollTop = node.scrollHeight
    }
    pinLatest()
    const frame = window.requestAnimationFrame(pinLatest)
    return () => window.cancelAnimationFrame(frame)
  }, [
    role,
    phase,
    ownerAssist.lines,
    ownerAssist.replies,
    ownerAssist.busy,
    ownerAssist.listening,
  ])

  const watchIds = useMemo(() => {
    const ids = new Set()
    if (threadId) ids.add(threadId)
    ;(listenThreadIds || []).forEach((id) => {
      if (id) ids.add(id)
    })
    return [...ids].sort()
  }, [threadId, listenThreadIds])
  const watchKey = watchIds.join('|')

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    callRef.current = call
  }, [call])

  useEffect(() => {
    cameraOnRef.current = cameraOn
  }, [cameraOn])

  // Prefetch ICE / TURN while idle so start/accept is faster.
  useEffect(() => {
    if (phase !== 'idle') return undefined
    void resolveIceServers()
    return undefined
  }, [phase])

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current
    }
  }, [phase, cameraOn])

  const stopMedia = useCallback(() => {
    candidateUnsubRef.current?.()
    candidateUnsubRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    queuedCandidatesRef.current = []
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
  }, [])

  const reset = useCallback(() => {
    stopCallSounds()
    stopMedia()
    setCall(null)
    setPhase('idle')
    setMicOn(true)
    setCameraOn(false)
    cameraOnRef.current = false
    connectedAtRef.current = 0
    announcedConnectRef.current = false
    applyingAnswerRef.current = false
    setElapsedSec(0)
  }, [stopMedia])

  useEffect(() => () => {
    stopCallSounds()
    stopMedia()
  }, [stopMedia])

  const attachRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream
      void remoteVideoRef.current.play?.().catch(() => {})
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream
      remoteAudioRef.current.muted = false
      remoteAudioRef.current.volume = 1
      void remoteAudioRef.current.play?.().catch(() => {})
    }
  }, [])

  const addRemoteCandidate = useCallback(async (candidate) => {
    if (!candidate || !peerRef.current) return
    if (!peerRef.current.remoteDescription) {
      queuedCandidatesRef.current.push(candidate)
      return
    }
    try {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate))
    } catch {
      // Stale candidate — ignore.
    }
  }, [])

  const flushCandidates = useCallback(async () => {
    const queued = queuedCandidatesRef.current.splice(0)
    for (const candidate of queued) {
      await addRemoteCandidate(candidate)
    }
  }, [addRemoteCandidate])

  const markConnected = useCallback(() => {
    setError('')
    stopCallSounds()
    if (!announcedConnectRef.current) {
      announcedConnectRef.current = true
      connectedAtRef.current = Date.now()
      setPhase('connected')
      window.setTimeout(() => playCallConnected(), 0)
    } else {
      setPhase('connected')
    }
    attachRemoteStream(remoteStreamRef.current)
  }, [attachRemoteStream])

  const handleIceFailed = useCallback(() => {
    const peer = peerRef.current
    if (!peer) return
    const currentPhase = phaseRef.current
    // Ignore ICE fail until answer is applied and we are past early ring/prep.
    if (
      !peer.remoteDescription
      || currentPhase === 'calling'
      || currentPhase === 'ringing'
      || currentPhase === 'preparing'
    ) {
      return
    }
    // One ICE restart can recover brief NAT glitches; then mark call failed.
    if (!iceRestartedRef.current && peer.localDescription) {
      iceRestartedRef.current = true
      setError('接続しています…')
      void peer.restartIce?.()
      return
    }
    const hasTurn = hasTurnServer(lastIceServersRef.current)
    const classified = classifyCallFailure('ICE connection failed', {
      iceFailed: true,
      iceConnectionState: peer.iceConnectionState,
      connectionState: peer.connectionState,
      hasTurn,
      phase: currentPhase,
    })
    failDetailRef.current = classified
    const active = callRef.current
    if (active?.id && active?.threadId) {
      const nowIso = new Date().toISOString()
      void updateChatCall(active.threadId, active.id, {
        status: 'failed',
        failCode: classified.failCode,
        failReason: classified.failReason,
        failAtIso: nowIso,
        failByRole: role,
        endedAtIso: nowIso,
        endedBy: role,
      })
      void upsertChatCallHistory({
        callId: active.id,
        threadId: active.threadId,
        status: 'failed',
        callerRole: active.callerRole || role,
        endedBy: role,
        createdAtIso: active.createdAtIso || nowIso,
        endedAtIso: nowIso,
        failCode: classified.failCode,
        failReason: classified.failReason,
        failByRole: role,
        type: active.type || 'video',
      })
    }
    setError(classified.userMessage)
    void finishCallRef.current('failed')
  }, [role])

  const buildPeer = useCallback((activeCall, iceServers) => {
    const peer = new RTCPeerConnection(rtcConfiguration(iceServers))
    peerRef.current = peer
    iceRestartedRef.current = false
    queuedCandidatesRef.current = []
    const remote = new MediaStream()
    attachRemoteStream(remote)

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current)
    })
    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remote.getTracks().some((item) => item.id === track.id)) remote.addTrack(track)
      })
      attachRemoteStream(remote)
      markConnected()
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void addChatCallCandidate(activeCall.threadId, activeCall.id, role, event.candidate.toJSON())
          .catch((err) => console.warn('[call] candidate upload failed', err?.code || err?.message || err))
      }
    }

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState
      if (state === 'connected') {
        markConnected()
      } else if (state === 'connecting') {
        // Keep ringback while waiting for answer (no remoteDescription yet).
        if (peer.remoteDescription) {
          setPhase((prev) => (prev === 'ringing' || prev === 'idle' ? prev : 'connecting'))
        }
      } else if (state === 'failed') {
        handleIceFailed()
      } else if (state === 'disconnected') {
        setError('接続が不安定です…')
      }
    }
    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState
      if (state === 'connected' || state === 'completed') {
        markConnected()
      } else if (state === 'failed') {
        handleIceFailed()
      }
    }

    const remoteRole = role === 'hana' ? 'guest' : 'hana'
    candidateUnsubRef.current?.()
    candidateUnsubRef.current = subscribeChatCallCandidates(
      activeCall.threadId,
      activeCall.id,
      remoteRole,
      addRemoteCandidate,
      () => {},
    )
    return peer
  }, [addRemoteCandidate, attachRemoteStream, handleIceFailed, markConnected, role])

  const requestMedia = useCallback(async () => {
    if (!window.isSecureContext) {
      throw new Error(USER_FAIL_INSECURE)
    }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      throw new Error('この端末は通話に対応していません。HTTPSで開いているか確認してください。')
    }
    // Voice-only at call start. Camera is requested later on toggle — a blocked
    // camera must never prevent the mic prompt on Android Chrome.
    // Must be started synchronously from the call/accept tap (no prior await).
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }, [])

  const fail = useCallback((reason, extra = {}) => {
    stopCallSounds()
    const classified = classifyCallFailure(reason, {
      ...extra,
      phase: extra.phase || phaseRef.current,
    })
    failDetailRef.current = classified
    const active = callRef.current
    if (active?.id && active?.threadId) {
      const nowIso = new Date().toISOString()
      void updateChatCall(active.threadId, active.id, {
        status: 'failed',
        failCode: classified.failCode,
        failReason: classified.failReason,
        failAtIso: nowIso,
        failByRole: role,
        endedAtIso: nowIso,
        endedBy: role,
      })
      void upsertChatCallHistory({
        callId: active.id,
        threadId: active.threadId,
        status: 'failed',
        callerRole: active.callerRole || role,
        endedBy: role,
        createdAtIso: active.createdAtIso || nowIso,
        endedAtIso: nowIso,
        failCode: classified.failCode,
        failReason: classified.failReason,
        failByRole: role,
        type: active.type || 'video',
      })
      void postChatCallLog({
        threadId: active.threadId,
        callId: active.id,
        status: 'failed',
        callerRole: active.callerRole || role,
        endedBy: role,
        durationSec: 0,
        answeredAtIso: active.answeredAtIso || null,
      }).catch(() => {})
    }
    setError(classified.userMessage)
    if (classified.failCode === 'permission') setPermBlocked(true)
    stopMedia()
    setPhase('idle')
    setCall(null)
  }, [role, stopMedia])

  useEffect(() => {
    if (!error || phase !== 'idle' || permBlocked) return undefined
    const timer = window.setTimeout(() => setError(''), 8000)
    return () => window.clearTimeout(timer)
  }, [error, phase, permBlocked])

  const retryMicPermission = useCallback(async () => {
    setError('')
    try {
      if (!window.isSecureContext) throw new Error(USER_FAIL_INSECURE)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getTracks().forEach((track) => track.stop())
      setPermBlocked(false)
      setError('マイクを許可しました。もう一度「通話」を押してください。')
    } catch (reason) {
      const classified = classifyCallFailure(reason, { phase: 'permission-retry' })
      setPermBlocked(true)
      setError(classified.userMessage)
    }
  }, [])

  const startCall = useCallback(async () => {
    if (!threadId || phase !== 'idle') return
    // Same-tap getUserMedia (Android), but ring the callee in Firestore immediately —
    // do not wait for TURN / offer SDP or Hana's overlay/push is delayed many seconds.
    const mediaPromise = requestMedia()
    const icePromise = resolveIceServers()
    onBeforeStart?.()
    setError('')
    setPermBlocked(false)
    failDetailRef.current = null
    setCameraOn(false)
    cameraOnRef.current = false
    let createdId = ''
    const createdAtIso = new Date().toISOString()
    try {
      const callId = await createChatCall({ threadId, callerRole: role, type: 'video' })
      createdId = callId
      const activeCall = {
        id: callId,
        threadId,
        callerRole: role,
        type: 'video',
        status: 'ringing',
        createdAtIso,
      }
      setCall(activeCall)
      callRef.current = activeCall
      setPhase('calling')
      void upsertChatCallHistory({
        callId,
        threadId,
        status: 'ringing',
        callerRole: role,
        createdAtIso,
        type: 'video',
      })
      await mediaPromise
      unlockCallSounds()
      startOutgoingRingback(true)
      if (callRef.current?.id !== callId) return
      const iceServers = await icePromise
      lastIceServersRef.current = iceServers
      const peer = buildPeer(activeCall, iceServers)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (callRef.current?.id !== callId) return
      await updateChatCall(threadId, callId, {
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
      })
    } catch (reason) {
      stopCallSounds()
      if (createdId) {
        callRef.current = {
          id: createdId,
          threadId,
          callerRole: role,
          type: 'video',
          createdAtIso,
        }
      }
      fail(reason, { phase: 'calling' })
    }
  }, [buildPeer, fail, onBeforeStart, phase, requestMedia, role, threadId])

  const acceptCall = useCallback(async () => {
    if (!call?.threadId || !call?.id) return
    const mediaPromise = requestMedia()
    setError('')
    setPermBlocked(false)
    failDetailRef.current = null
    const answeredAtIso = new Date().toISOString()
    setPhase('connecting')
    setCall((prev) => (prev ? { ...prev, answeredAtIso } : prev))
    setCameraOn(false)
    cameraOnRef.current = false
    try {
      await mediaPromise
      unlockCallSounds()
      stopCallSounds()
    } catch (reason) {
      fail(reason, { phase: 'accepting' })
      return
    }
    try {
      await updateChatCall(call.threadId, call.id, { answeredAtIso })
    } catch {
      // Continue media handshake.
    }
    try {
      let offer = callRef.current?.offer || call.offer
      if (!offer) {
        for (let i = 0; i < 40; i += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 250))
          if (phaseRef.current === 'idle') return
          offer = callRef.current?.offer
          if (offer) break
        }
      }
      if (!offer) {
        throw new Error('相手の通話準備が完了しませんでした。もう一度お試しください。')
      }
      const iceServers = await resolveIceServers()
      if (!hasTurnServer(iceServers)) {
        console.warn('[call] no TURN servers — cross-country calls likely to fail')
      }
      lastIceServersRef.current = iceServers
      const peer = buildPeer({ ...call, offer }, iceServers)
      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      await flushCandidates()
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await updateChatCall(call.threadId, call.id, {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected',
        answeredAtIso,
      })
      setCall((prev) => (prev ? {
        ...prev,
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected',
        answeredAtIso,
      } : prev))
      attachRemoteStream(remoteStreamRef.current)
    } catch (reason) {
      fail(reason, { phase: 'accepting' })
    }
  }, [attachRemoteStream, buildPeer, call, fail, flushCandidates, requestMedia])

  const finishCall = useCallback(async (status = 'ended') => {
    const active = callRef.current
    let finalStatus = status
    // Never record "missed" after answer / connect — convert to failed.
    if (finalStatus === 'missed') {
      const alreadyAnswered = Boolean(
        active?.answer
        || active?.answeredAtIso
        || active?.status === 'connected'
        || phaseRef.current === 'connecting'
        || phaseRef.current === 'connected',
      )
      if (alreadyAnswered) finalStatus = 'failed'
    }
    const wasLive = prevPhaseRef.current !== 'idle'
    if (active?.id && active?.threadId) {
      const answeredAt = active.answeredAtIso || null
      const answeredMs = answeredAt ? Date.parse(answeredAt) : 0
      const connectedMs = connectedAtRef.current || 0
      const startMs = answeredMs || connectedMs
      const durationSec = (finalStatus === 'ended' && startMs)
        ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
        : 0
      const detail = finalStatus === 'failed' ? failDetailRef.current : null
      try {
        await updateChatCall(active.threadId, active.id, {
          status: finalStatus,
          endedAtIso: new Date().toISOString(),
          endedBy: role,
          durationSec,
          ...(answeredAt ? { answeredAtIso: answeredAt } : {}),
          ...(detail
            ? {
                failCode: detail.failCode,
                failReason: detail.failReason,
                failByRole: role,
                failAtIso: new Date().toISOString(),
              }
            : {}),
        })
        await postChatCallLog({
          threadId: active.threadId,
          callId: active.id,
          status: finalStatus,
          callerRole: active.callerRole || role,
          endedBy: role,
          durationSec,
          answeredAtIso: answeredAt,
        })
        await upsertChatCallHistory({
          callId: active.id,
          threadId: active.threadId,
          status: finalStatus,
          durationSec,
          callerRole: active.callerRole || role,
          endedBy: role,
          answeredAtIso: answeredAt,
          createdAtIso: active.createdAtIso || new Date().toISOString(),
          endedAtIso: new Date().toISOString(),
          failCode: detail?.failCode || '',
          failReason: detail?.failReason || '',
          failByRole: detail ? role : '',
          type: active.type || 'video',
        })
      } catch {
        // Still tear down local media.
      }
    }
    failDetailRef.current = null
    if (wasLive) playCallEnded()
    reset()
  }, [reset, role])
  finishCallRef.current = finishCall

  const applyRemoteAnswer = useCallback(async (answer) => {
    const peer = peerRef.current
    const active = callRef.current
    if (!peer || !answer?.type || !answer?.sdp) return
    // Caller only. Callee already set the offer as remoteDescription; applying
    // the answer there InvalidStateErrors and hangs up both sides.
    if (active?.callerRole && active.callerRole !== role) return
    if (peer.signalingState === 'closed') return
    if (peer.signalingState !== 'have-local-offer') return
    if (peer.remoteDescription) return
    if (applyingAnswerRef.current) return
    applyingAnswerRef.current = true
    stopCallSounds()
    setPhase((prev) => (
      prev === 'calling' || prev === 'preparing' ? 'connecting' : prev
    ))
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(answer))
      await flushCandidates()
      attachRemoteStream(remoteStreamRef.current)
      if (peer.iceConnectionState === 'failed') {
        try { peer.restartIce?.() } catch { /* ignore */ }
      }
    } catch (err) {
      applyingAnswerRef.current = false
      const name = String(err?.name || '')
      if (name === 'InvalidStateError' || /InvalidState/i.test(String(err?.message || ''))) {
        return
      }
      fail(err, { phase: 'answer' })
      return
    }
    applyingAnswerRef.current = false
  }, [attachRemoteStream, fail, flushCandidates, role])

  const onIncomingRef = useRef(onIncoming)
  onIncomingRef.current = onIncoming
  const applyRemoteAnswerRef = useRef(applyRemoteAnswer)
  applyRemoteAnswerRef.current = applyRemoteAnswer
  const resetRef = useRef(reset)
  resetRef.current = reset

  useEffect(() => {
    const ids = watchKey ? watchKey.split('|').filter(Boolean) : []
    if (ids.length === 0) return undefined
    const unsubs = ids.map((id) => subscribeChatCalls(
      id,
      (calls) => {
        const current = callRef.current
        if (current) {
          if (current.threadId !== id) return
          const next = calls.find((item) => item.id === current.id)
          if (!next) return
          setCall({ ...next, threadId: id })
          if (TERMINAL_STATUSES.has(next.status)) {
            void postChatCallLog({
              threadId: id,
              callId: next.id,
              status: next.status,
              callerRole: next.callerRole || role,
              endedBy: next.endedBy || '',
              durationSec: next.durationSec || 0,
              answeredAtIso: next.answeredAtIso || null,
            }).catch(() => {})
            void upsertChatCallHistory({
              callId: next.id,
              threadId: id,
              status: next.status,
              durationSec: next.durationSec || 0,
              callerRole: next.callerRole || role,
              endedBy: next.endedBy || '',
              answeredAtIso: next.answeredAtIso || null,
              createdAtIso: next.createdAtIso || new Date().toISOString(),
              endedAtIso: next.endedAtIso || new Date().toISOString(),
              failCode: next.failCode || '',
              failReason: next.failReason || '',
              failByRole: next.failByRole || '',
              type: next.type || 'video',
            }).catch(() => {})
            playCallEnded()
            resetRef.current()
            return
          }
          const pickedUp = Boolean(next.answeredAtIso || next.answer || next.status === 'connected')
          if (pickedUp) {
            stopCallSounds()
            if (
              phaseRef.current === 'calling'
              || phaseRef.current === 'preparing'
            ) {
              setPhase('connecting')
            }
          }
          if (next.answer) {
            void applyRemoteAnswerRef.current(next.answer)
          }
          return
        }

        const now = Date.now()
        const incoming = calls.find((item) => (
          item.status === 'ringing'
          && item.calleeRole === role
          && now - Date.parse(item.createdAtIso || 0) < RING_MAX_AGE_MS
        ))
        if (incoming) {
          const payload = { ...incoming, threadId: id }
          setCall(payload)
          setPhase('ringing')
          onIncomingRef.current?.(payload)
        }
      },
      (err) => {
        setError(USER_FAIL_GENERIC)
        console.warn('[call] subscribe failed', err)
      },
    ))
    return () => unsubs.forEach((unsub) => unsub())
  }, [role, watchKey])

  // Belt-and-suspenders: answered signal kills ringback; answer SDP enters connecting.
  useEffect(() => {
    if (call?.answeredAtIso || call?.answer || call?.status === 'connected') {
      stopCallSounds()
    }
    if (call?.answer) {
      void applyRemoteAnswer(call.answer)
    }
    if (
      (call?.answeredAtIso || call?.answer || call?.status === 'connected')
      && (phase === 'calling' || phase === 'preparing')
    ) {
      setPhase('connecting')
    }
  }, [applyRemoteAnswer, call?.answer, call?.answeredAtIso, call?.status, phase])

  // Ringtone / ringback by phase
  useEffect(() => {
    prevPhaseRef.current = phase
    if (phase === 'ringing') {
      startIncomingRingtone()
      return () => stopCallSounds()
    }
    if (phase === 'calling') {
      if (callRef.current?.answer || callRef.current?.answeredAtIso || callRef.current?.status === 'connected') {
        stopCallSounds()
        setPhase('connecting')
        return undefined
      }
      startOutgoingRingback(true)
      return () => stopCallSounds()
    }
    if (phase === 'preparing') {
      return undefined
    }
    if (phase === 'connecting' || phase === 'connected') {
      stopCallSounds()
    }
    return undefined
  }, [phase])

  // Missed only while still ringing out with no answer.
  useEffect(() => {
    if (phase !== 'calling' || !call?.id || call?.answer || call?.answeredAtIso) return undefined
    const timer = window.setTimeout(() => {
      void finishCall('missed')
    }, RING_MAX_AGE_MS)
    return () => window.clearTimeout(timer)
  }, [call?.answer, call?.answeredAtIso, call?.id, finishCall, phase])

  // Connecting timeout → failed (not missed).
  useEffect(() => {
    if (phase !== 'connecting') return undefined
    const timer = window.setTimeout(() => {
      const classified = classifyCallFailure('Connecting timeout', {
        iceFailed: true,
        phase: 'connecting',
        hasTurn: hasTurnServer(lastIceServersRef.current),
      })
      failDetailRef.current = classified
      setError(classified.userMessage)
      void finishCall('failed')
    }, CONNECTING_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [finishCall, phase])

  useEffect(() => {
    if (phase !== 'connected') {
      setElapsedSec(0)
      return undefined
    }
    const tick = () => {
      const start = connectedAtRef.current || Date.now()
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const toggleMic = () => {
    const next = !micOn
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
    setMicOn(next)
  }

  const toggleCamera = () => {
    const next = !cameraOn
    const existing = localStreamRef.current?.getVideoTracks() || []
    if (!next) {
      existing.forEach((track) => { track.enabled = false })
      setCameraOn(false)
      cameraOnRef.current = false
      return
    }
    if (existing.length > 0) {
      existing.forEach((track) => { track.enabled = true })
      setCameraOn(true)
      cameraOnRef.current = true
      return
    }
    // Acquire camera on demand (own user gesture from the toggle tap).
    void (async () => {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user' },
        })
        const track = cam.getVideoTracks()[0]
        if (!track || !localStreamRef.current) {
          cam.getTracks().forEach((t) => t.stop())
          setError('カメラを起動できませんでした。')
          return
        }
        track.enabled = true
        localStreamRef.current.addTrack(track)
        const peer = peerRef.current
        if (peer) {
          peer.addTrack(track, localStreamRef.current)
          try {
            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            const active = callRef.current
            if (active?.threadId && active?.id) {
              await updateChatCall(active.threadId, active.id, {
                offer: { type: offer.type, sdp: offer.sdp },
              })
            }
          } catch {
            // Voice call still works without renegotiation.
          }
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
        setCameraOn(true)
        cameraOnRef.current = true
      } catch {
        setError('カメラの許可が必要です。サイト設定から許可してください。')
      }
    })()
  }

  const showOverlay = phase !== 'idle'
  const showLocalPreview = cameraOn && phase !== 'idle'
  const durationLabel = phase === 'connected' ? formatDuration(elapsedSec) : ''
  const label = statusLabel(phase, cameraOn, durationLabel, call)
  const isRinging = phase === 'ringing'
  const isOutgoing = phase === 'calling' || phase === 'preparing'
  const showControls = ['connected', 'calling', 'preparing', 'connecting'].includes(phase)

  const startButtons = canStart ? (
    <div className={`hana-call-buttons${compact ? ' is-compact' : ''}`} aria-label="通話">
      <button
        type="button"
        onClick={() => void startCall()}
        disabled={!threadId || showOverlay}
        title="通話"
        aria-label="通話を開始"
      >
        <PhoneIcon />
        {!compact ? <span>通話</span> : null}
      </button>
    </div>
  ) : null

  return (
    <>
      {buttonsHost && startButtons ? createPortal(startButtons, buttonsHost) : startButtons}

      {(error || permBlocked) && !showOverlay ? createPortal(
        <div className={`hana-call-toast-error${permBlocked ? ' is-permission' : ''}`} role="alert">
          <p>{error || USER_FAIL_PERMISSION}</p>
          {permBlocked ? (
            <div className="hana-call-perm-help">
              <ol>
                <li>Chrome右上「︙」→「設定」→「サイトの設定」</li>
                <li>「マイク」を「許可」にする</li>
                <li>このページを再読み込みする</li>
              </ol>
              <button type="button" onClick={() => void retryMicPermission()}>
                マイク許可を再試行
              </button>
              <button
                type="button"
                className="is-ghost"
                onClick={() => { setPermBlocked(false); setError('') }}
              >
                閉じる
              </button>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}

      {showOverlay ? createPortal(
        <div className={`hana-call-overlay is-${phase}`} role="dialog" aria-modal="true" aria-label="通話">
          <div className={`hana-call-stage${showLocalPreview || (phase === 'connected' && cameraOn) ? ' is-video' : ' is-voice'}`}>
            <div className="hana-call-ambient" aria-hidden="true">
              <span className="hana-call-orb is-a" />
              <span className="hana-call-orb is-b" />
              <span className="hana-call-orb is-c" />
            </div>

            <video ref={remoteVideoRef} className="hana-call-remote-video" autoPlay playsInline />
            <audio ref={remoteAudioRef} autoPlay playsInline />
            <video
              ref={localVideoRef}
              className={`hana-call-local-video${showLocalPreview ? '' : ' is-hidden'}`}
              autoPlay
              muted
              playsInline
            />

            <header className="hana-call-topbar">
              <span className={`hana-call-pill${phase === 'connected' ? ' is-live' : ''}`}>
                {phase === 'connected' ? 'LIVE' : isRinging ? 'INCOMING' : isOutgoing ? 'OUTGOING' : 'CALL'}
              </span>
              {phase === 'connected' ? (
                <span className="hana-call-timer" aria-live="polite">{durationLabel}</span>
              ) : (
                <span className="hana-call-secure">暗号化された通話</span>
              )}
            </header>

            <div className="hana-call-info">
              <div className={`hana-call-avatar-wrap${isRinging || phase === 'calling' ? ' is-pulse' : ''}`}>
                <span className="hana-call-ring is-outer" aria-hidden="true" />
                <span className="hana-call-ring is-inner" aria-hidden="true" />
                <span className="hana-call-avatar" aria-hidden="true">
                  {String(partnerName || '?').trim().charAt(0).toUpperCase()}
                </span>
              </div>
              <h2>{partnerName || '通話相手'}</h2>
              <p className={`hana-call-status${phase === 'connecting' || phase === 'calling' ? ' is-busy' : ''}`}>
                {label}
                {(phase === 'calling' || phase === 'connecting' || phase === 'preparing') ? (
                  <span className="hana-call-dots" aria-hidden="true"><i /><i /><i /></span>
                ) : null}
              </p>
              {isRinging ? (
                <p className="hana-call-hint">
                  {call?.offer ? '応答すると通話が始まります' : '接続を準備しています…'}
                </p>
              ) : null}
              {phase === 'connecting' ? <p className="hana-call-hint">ネットワークを調整しています</p> : null}
              {error ? <p className="hana-call-error">{error}</p> : null}
            </div>

            {role === 'hana' && phase === 'connected' ? (
              <aside className="hana-call-owner-assist" aria-label="はな専用・相手の文字起こし">
                <div className="hana-call-owner-assist-head">
                  <p className="hana-call-owner-assist-badge">はな専用</p>
                  <span className="hana-call-owner-assist-live">
                    {ownerAssist.unsupported
                      ? 'このブラウザでは文字起こしできません'
                      : ownerAssist.listening
                        ? '相手の声を聞き取り中…'
                        : ownerAssist.busy
                          ? '返信案を作成中…'
                          : '相手の発言だけ表示'}
                  </span>
                </div>
                {ownerAssist.assistError ? (
                  <p className="hana-call-owner-assist-note">{ownerAssist.assistError}</p>
                ) : null}
                <div className="hana-call-owner-assist-scroll" ref={ownerAssistScrollRef}>
                <div className="hana-call-owner-assist-log">
                  {ownerAssist.lines.length ? (
                    ownerAssist.lines.map((line, index) => (
                      <div
                        key={line.id}
                        className={`hana-call-owner-assist-line${index === ownerAssist.lines.length - 1 ? ' is-latest' : ''}`}
                      >
                        <p className="hana-call-owner-assist-speech">{line.text}</p>
                        {line.translationVi ? (
                          <p className="hana-call-owner-assist-vi">{line.translationVi}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="hana-call-owner-assist-empty">相手が話し始めるとここに文字が出ます</p>
                  )}
                </div>
                {ownerAssist.replies.length ? (
                  <div className="hana-call-owner-assist-replies">
                    <p className="hana-call-owner-assist-replies-label">返す一言</p>
                    {ownerAssist.replies.map((reply, index) => (
                      <div
                        key={`${reply.ja}-${index}`}
                        className="hana-call-owner-assist-reply"
                      >
                        <strong>{reply.ja}</strong>
                        {reply.vi ? <span>{reply.vi}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                </div>
              </aside>
            ) : null}

            <div className="hana-call-actions">
              {isRinging ? (
                <>
                  <button
                    type="button"
                    className="hana-call-fab is-decline"
                    onClick={() => void finishCall('rejected')}
                    aria-label="拒否"
                  >
                    <span className="hana-call-fab-face"><PhoneDownIcon /></span>
                    <span>拒否</span>
                  </button>
                  <button
                    type="button"
                    className="hana-call-fab is-accept"
                    onClick={() => void acceptCall()}
                    disabled={!call?.offer}
                    aria-label="応答"
                  >
                    <span className="hana-call-fab-face"><PhoneIcon /></span>
                    <span>{call?.offer ? '応答' : '準備中'}</span>
                  </button>
                </>
              ) : (
                <>
                  {showControls ? (
                    <>
                      <button
                        type="button"
                        className={`hana-call-fab is-tool${micOn ? '' : ' is-off'}`}
                        onClick={toggleMic}
                        title={micOn ? 'ミュート' : 'ミュート解除'}
                        aria-label={micOn ? 'ミュート' : 'ミュート解除'}
                      >
                        <span className="hana-call-fab-face"><MicIcon off={!micOn} /></span>
                        <span>{micOn ? 'マイク' : 'ミュート'}</span>
                      </button>
                      <button
                        type="button"
                        className={`hana-call-fab is-tool${cameraOn ? '' : ' is-off'}`}
                        onClick={() => void toggleCamera()}
                        title={cameraOn ? 'カメラOFF' : 'カメラON'}
                        aria-label={cameraOn ? 'カメラOFF' : 'カメラON'}
                      >
                        <span className="hana-call-fab-face"><CamIcon off={!cameraOn} /></span>
                        <span>{cameraOn ? 'カメラ' : 'カメラOFF'}</span>
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="hana-call-fab is-decline"
                    onClick={() => void finishCall('ended')}
                    aria-label="終了"
                  >
                    <span className="hana-call-fab-face"><PhoneDownIcon /></span>
                    <span>終了</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
