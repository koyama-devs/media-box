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
    subscribeChatCallCandidates,
    subscribeChatCalls,
    updateChatCall,
    postChatCallLog,
    upsertChatCallHistory,
} from './firebase'
import './hana-call.css'

const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed', 'failed'])
const RING_MAX_AGE_MS = 90_000
const ICE_CACHE_TTL_MS = 45 * 60 * 1000

const USER_FAIL_GENERIC = '通話を接続できませんでした。もう一度お試しください。'
const USER_FAIL_PERMISSION = 'マイクの許可が必要です。設定から許可してもう一度お試しください。'
const USER_FAIL_DEVICE = 'マイクが見つかりません。別の端末でもう一度お試しください。'

function classifyCallFailure(reason, extra = {}) {
  const name = String(reason?.name || extra.name || '')
  const rawMessage = String(
    getFirebaseErrorMessage(reason)
    || reason?.message
    || reason
    || extra.message
    || '',
  ).trim()
  let failCode = 'unknown'
  if (extra.iceFailed || /ice|turn|nat|接続できません|回線/i.test(rawMessage)) {
    failCode = 'ice_failed'
  } else if (/NotAllowedError|PermissionDeniedError/i.test(name) || /permission|許可/i.test(rawMessage)) {
    failCode = 'permission'
  } else if (/NotFoundError/i.test(name) || /マイクが見つかり/i.test(rawMessage)) {
    failCode = 'device'
  } else if (/NotSupported|HTTPS|対応していません/i.test(rawMessage) || /NotSupportedError/i.test(name)) {
    failCode = 'unsupported'
  } else if (/Firebase|Firestore|network|Failed to fetch|signaling/i.test(rawMessage)) {
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
      : USER_FAIL_GENERIC

  return { failCode, failReason, userMessage }
}

const iceServersCache = { at: 0, servers: null }

function stunOnlyServers() {
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
  ]
}

/**
 * Resolve ICE servers for WebRTC.
 * Cross-country / carrier-NAT (e.g. Vietnam ↔ Japan) almost always needs a
 * working TURN relay. Static openrelayproject credentials no longer work —
 * use Metered free API key (VITE_METERED_TURN_CREDENTIALS_URL) or a private TURN.
 */
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
    try {
      const response = await fetch(credentialUrl)
      if (response.ok) {
        const payload = await response.json()
        const list = Array.isArray(payload)
          ? payload
          : (Array.isArray(payload?.iceServers) ? payload.iceServers : null)
        if (list?.length) {
          iceServersCache.at = now
          iceServersCache.servers = list
          return list
        }
      }
    } catch {
      // Fall through to static / STUN.
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

  // STUN only — same Wi‑Fi may work; different countries usually will not.
  const stun = stunOnlyServers()
  iceServersCache.at = now
  iceServersCache.servers = stun
  return stun
}

function rtcConfiguration(iceServers) {
  return {
    iceServers: iceServers?.length ? iceServers : stunOnlyServers(),
    iceCandidatePoolSize: 4,
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


function statusLabel(phase, cameraOn, durationLabel) {
  if (phase === 'ringing') return '着信中'
  if (phase === 'calling') return '呼び出し中…'
  if (phase === 'preparing') return 'マイクを準備しています…'
  if (phase === 'connecting') return '接続しています…'
  if (phase === 'connected') return durationLabel || (cameraOn ? '通話中 · カメラON' : '通話中')
  return ''
}

/**
 * Unified voice/video call. Camera starts OFF; user can enable it in-call.
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

  const watchIds = useMemo(() => {
    const ids = new Set()
    if (threadId) ids.add(threadId)
    ;(listenThreadIds || []).forEach((id) => {
      if (id) ids.add(id)
    })
    return [...ids]
  }, [threadId, listenThreadIds])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    callRef.current = call
  }, [call])

  useEffect(() => {
    cameraOnRef.current = cameraOn
  }, [cameraOn])

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
    setPhase((prev) => {
      if (prev !== 'connected' && !announcedConnectRef.current) {
        announcedConnectRef.current = true
        connectedAtRef.current = Date.now()
        stopCallSounds()
        playCallConnected()
      }
      return 'connected'
    })
    attachRemoteStream(remoteStreamRef.current)
  }, [attachRemoteStream])

  const buildPeer = useCallback((activeCall, iceServers) => {
    const peer = new RTCPeerConnection(rtcConfiguration(iceServers))
    peerRef.current = peer
    iceRestartedRef.current = false
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
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void addChatCallCandidate(activeCall.threadId, activeCall.id, role, event.candidate.toJSON())
      }
    }

    const persistFailDetail = (classified) => {
      failDetailRef.current = classified
      const active = callRef.current || activeCall
      if (!active?.id || !active?.threadId) return
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

    const handleIceFailed = () => {
      if (peerRef.current !== peer) return
      // One ICE restart can recover brief NAT glitches; then mark call failed.
      if (!iceRestartedRef.current && peer.remoteDescription && peer.localDescription) {
        iceRestartedRef.current = true
        setError('接続しています…')
        void peer.restartIce?.()
        return
      }
      const hasTurn = (lastIceServersRef.current || []).some((server) => {
        const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls]
        return urls.some((url) => /^turns?:/i.test(String(url || '')))
      })
      const classified = classifyCallFailure('ICE connection failed', {
        iceFailed: true,
        iceConnectionState: peer.iceConnectionState,
        connectionState: peer.connectionState,
        hasTurn,
        phase: phaseRef.current,
      })
      persistFailDetail(classified)
      setError(classified.userMessage)
      void finishCallRef.current('failed')
    }

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState
      if (state === 'connected') {
        markConnected()
      } else if (state === 'connecting') {
        setPhase((prev) => (prev === 'ringing' || prev === 'idle' ? prev : 'connecting'))
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
  }, [addRemoteCandidate, attachRemoteStream, markConnected, role])

  const requestMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      throw new Error('この端末は通話に対応していません。HTTPSで開いているか確認してください。')
    }
    // Audio only at call start — camera permission is requested later when the
    // user turns the camera on (avoids re-prompting cam+mic every call).
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
      phase: phaseRef.current,
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
    stopMedia()
    setPhase('idle')
    setCall(null)
  }, [role, stopMedia])

  useEffect(() => {
    if (!error || phase !== 'idle') return undefined
    const timer = window.setTimeout(() => setError(''), 8000)
    return () => window.clearTimeout(timer)
  }, [error, phase])

  const startCall = useCallback(async () => {
    if (!threadId || phase !== 'idle') return
    unlockCallSounds()
    onBeforeStart?.()
    setError('')
    failDetailRef.current = null
    setPhase('preparing')
    setCameraOn(false)
    cameraOnRef.current = false
    let createdId = ''
    try {
      const iceServers = await resolveIceServers()
      lastIceServersRef.current = iceServers
      await requestMedia()
      const callId = await createChatCall({ threadId, callerRole: role, type: 'video' })
      createdId = callId
      const activeCall = {
        id: callId,
        threadId,
        callerRole: role,
        type: 'video',
        status: 'preparing',
        createdAtIso: new Date().toISOString(),
      }
      setCall(activeCall)
      callRef.current = activeCall
      void upsertChatCallHistory({
        callId,
        threadId,
        status: 'ringing',
        callerRole: role,
        createdAtIso: activeCall.createdAtIso,
        type: 'video',
      })
      const peer = buildPeer(activeCall, iceServers)
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      await peer.setLocalDescription(offer)
      await updateChatCall(threadId, callId, {
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
      })
      setPhase('calling')
    } catch (reason) {
      if (createdId) {
        callRef.current = {
          id: createdId,
          threadId,
          callerRole: role,
          type: 'video',
          createdAtIso: new Date().toISOString(),
        }
      }
      fail(reason, { phase: 'preparing' })
    }
  }, [buildPeer, fail, onBeforeStart, phase, requestMedia, role, threadId])

  const acceptCall = useCallback(async () => {
    if (!call?.offer || !call?.threadId) return
    unlockCallSounds()
    stopCallSounds()
    setError('')
    failDetailRef.current = null
    setPhase('preparing')
    setCameraOn(false)
    cameraOnRef.current = false
    try {
      const iceServers = await resolveIceServers()
      lastIceServersRef.current = iceServers
      await requestMedia()
      const peer = buildPeer(call, iceServers)
      await peer.setRemoteDescription(new RTCSessionDescription(call.offer))
      await flushCandidates()
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await updateChatCall(call.threadId, call.id, {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected',
        answeredAtIso: new Date().toISOString(),
      })
      setPhase('connecting')
    } catch (reason) {
      fail(reason, { phase: 'accepting' })
    }
  }, [buildPeer, call, fail, flushCandidates, requestMedia])

  const finishCall = useCallback(async (status = 'ended') => {
    const active = callRef.current
    const wasLive = prevPhaseRef.current !== 'idle'
    if (active?.id && active?.threadId) {
      const answeredAt = active.answeredAtIso || null
      const answeredMs = answeredAt ? Date.parse(answeredAt) : 0
      const connectedMs = connectedAtRef.current || 0
      const startMs = answeredMs || connectedMs
      const durationSec = (status === 'ended' && startMs)
        ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
        : 0
      const detail = status === 'failed' ? failDetailRef.current : null
      try {
        await updateChatCall(active.threadId, active.id, {
          status,
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
          status,
          callerRole: active.callerRole || role,
          endedBy: role,
          durationSec,
          answeredAtIso: answeredAt,
        })
        await upsertChatCallHistory({
          callId: active.id,
          threadId: active.threadId,
          status,
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

  useEffect(() => {
    if (watchIds.length === 0) return undefined
    const unsubs = watchIds.map((id) => subscribeChatCalls(
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
            reset()
            return
          }
          if (next.answer && peerRef.current && !peerRef.current.remoteDescription) {
            void peerRef.current
              .setRemoteDescription(new RTCSessionDescription(next.answer))
              .then(flushCandidates)
              .then(() => {
                stopCallSounds()
                setPhase('connecting')
              })
              .catch((err) => fail(err, { phase: 'answer' }))
          }
          return
        }

        const now = Date.now()
        const incoming = calls.find((item) => (
          item.status === 'ringing'
          && item.offer
          && item.calleeRole === role
          && now - Date.parse(item.createdAtIso || 0) < RING_MAX_AGE_MS
        ))
        if (incoming) {
          const payload = { ...incoming, threadId: id }
          setCall(payload)
          setPhase('ringing')
          onIncoming?.(payload)
        }
      },
      (err) => {
        // Keep user-facing copy soft; detail goes nowhere until a call id exists.
        setError(USER_FAIL_GENERIC)
        console.warn('[call] subscribe failed', err)
      },
    ))
    return () => unsubs.forEach((unsub) => unsub())
  }, [fail, flushCandidates, onIncoming, reset, role, watchIds])

  // Ringtone / ringback by phase
  useEffect(() => {
    prevPhaseRef.current = phase
    if (phase === 'ringing') {
      startIncomingRingtone()
      return () => stopCallSounds()
    }
    if (phase === 'calling') {
      startOutgoingRingback()
      return () => stopCallSounds()
    }
    if (phase === 'preparing' || phase === 'connecting' || phase === 'connected') {
      if (phase !== 'connected') stopCallSounds()
    }
    return undefined
  }, [phase])

  useEffect(() => {
    if (phase !== 'calling' || !call?.id) return undefined
    const timer = window.setTimeout(() => {
      void finishCall('missed')
    }, RING_MAX_AGE_MS)
    return () => window.clearTimeout(timer)
  }, [call?.id, finishCall, phase])

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

  const toggleCamera = async () => {
    const next = !cameraOn
    const stream = localStreamRef.current
    if (!stream) {
      setCameraOn(next)
      cameraOnRef.current = next
      return
    }

    const existing = stream.getVideoTracks()
    if (existing.length > 0) {
      existing.forEach((track) => { track.enabled = next })
      setCameraOn(next)
      cameraOnRef.current = next
      return
    }

    if (!next) {
      setCameraOn(false)
      cameraOnRef.current = false
      return
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      })
      const track = cam.getVideoTracks()[0]
      if (!track) return
      stream.addTrack(track)
      const peer = peerRef.current
      if (peer) {
        peer.addTrack(track, stream)
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        const active = callRef.current
        if (active?.threadId && active?.id) {
          await updateChatCall(active.threadId, active.id, {
            offer: { type: offer.type, sdp: offer.sdp },
          })
        }
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      setCameraOn(true)
      cameraOnRef.current = true
    } catch (reason) {
      const classified = classifyCallFailure(reason, { phase: 'camera' })
      setError(classified.failCode === 'permission'
        ? 'カメラの許可が必要です。設定から許可してください。'
        : 'カメラを起動できませんでした。')
    }
  }

  const showOverlay = phase !== 'idle'
  const showLocalPreview = cameraOn && phase !== 'idle'
  const durationLabel = phase === 'connected' ? formatDuration(elapsedSec) : ''
  const label = statusLabel(phase, cameraOn, durationLabel)
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

      {error && !showOverlay ? createPortal(
        <p className="hana-call-toast-error" role="alert">{error}</p>,
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
              {isRinging ? <p className="hana-call-hint">応答すると通話が始まります</p> : null}
              {phase === 'connecting' ? <p className="hana-call-hint">ネットワークを調整しています</p> : null}
              {error ? <p className="hana-call-error">{error}</p> : null}
            </div>

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
                    aria-label="応答"
                  >
                    <span className="hana-call-fab-face"><PhoneIcon /></span>
                    <span>応答</span>
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
