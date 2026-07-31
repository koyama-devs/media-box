import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { playChatNotifySound } from './chatNotifySound'
import {
  addChatCallCandidate,
  createChatCall,
  getFirebaseErrorMessage,
  subscribeChatCallCandidates,
  subscribeChatCalls,
  updateChatCall,
} from './firebase'
import './hana-call.css'

const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed', 'failed'])
const RING_MAX_AGE_MS = 90_000

function rtcConfiguration() {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const turnUrl = String(import.meta.env.VITE_WEBRTC_TURN_URL || '').trim()
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((item) => item.trim()).filter(Boolean),
      username: String(import.meta.env.VITE_WEBRTC_TURN_USERNAME || ''),
      credential: String(import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL || ''),
    })
  }
  return { iceServers }
}

function PhoneIcon({ video = false }) {
  return video ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm14.5 3.2 3.5-2v8.6l-3.5-2V9.7Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 2.8 9.4 7 7.8 8.8c1.2 2.5 3 4.3 5.5 5.5l1.8-1.6 4.2 2.8c.4.3.6.8.4 1.3l-.8 3c-.1.5-.6.9-1.2.9C9.7 20.7 3.3 14.3 3.3 6.3c0-.6.4-1.1.9-1.2l3-.8c.5-.1 1 .1 1.3.5Z" />
    </svg>
  )
}

export default function HanaCall({
  threadId,
  role,
  partnerName,
  canStart = true,
  compact = false,
  onIncoming,
}) {
  const [call, setCall] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const candidateUnsubRef = useRef(null)
  const queuedCandidatesRef = useRef([])
  const callRef = useRef(null)

  useEffect(() => {
    callRef.current = call
  }, [call])

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
  }, [call?.type, phase])

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
    stopMedia()
    setCall(null)
    setPhase('idle')
    setMicOn(true)
    setCameraOn(true)
  }, [stopMedia])

  useEffect(() => () => stopMedia(), [stopMedia])

  const attachRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream
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
      // A stale candidate from a replaced network path is safe to ignore.
    }
  }, [])

  const flushCandidates = useCallback(async () => {
    const queued = queuedCandidatesRef.current.splice(0)
    for (const candidate of queued) {
      await addRemoteCandidate(candidate)
    }
  }, [addRemoteCandidate])

  const buildPeer = useCallback((activeCall) => {
    const peer = new RTCPeerConnection(rtcConfiguration())
    peerRef.current = peer
    const remote = new MediaStream()
    attachRemoteStream(remote)

    localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current))
    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remote.getTracks().some((item) => item.id === track.id)) remote.addTrack(track)
      })
      attachRemoteStream(remote)
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void addChatCallCandidate(threadId, activeCall.id, role, event.candidate.toJSON())
      }
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setPhase('connected')
      if (['failed', 'disconnected'].includes(peer.connectionState)) {
        setError('接続が切れました。もう一度お試しください。')
      }
    }

    const remoteRole = role === 'hana' ? 'guest' : 'hana'
    candidateUnsubRef.current?.()
    candidateUnsubRef.current = subscribeChatCallCandidates(
      threadId,
      activeCall.id,
      remoteRole,
      addRemoteCandidate,
      () => {},
    )
    return peer
  }, [addRemoteCandidate, attachRemoteStream, role, threadId])

  const requestMedia = useCallback(async (type) => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      throw new Error('この端末は通話に対応していません。')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { facingMode: 'user' } : false,
    })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }, [])

  const fail = useCallback((reason) => {
    setError(getFirebaseErrorMessage(reason) || reason?.message || '通話を開始できませんでした。')
    stopMedia()
    setPhase('idle')
    setCall(null)
  }, [stopMedia])

  const startCall = useCallback(async (type) => {
    if (!threadId || phase !== 'idle') return
    setError('')
    setPhase('preparing')
    try {
      await requestMedia(type)
      const callId = await createChatCall({ threadId, callerRole: role, type })
      const activeCall = { id: callId, callerRole: role, type, status: 'preparing' }
      setCall(activeCall)
      const peer = buildPeer(activeCall)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await updateChatCall(threadId, callId, {
        offer: { type: offer.type, sdp: offer.sdp },
        status: 'ringing',
      })
      setPhase('calling')
    } catch (reason) {
      fail(reason)
    }
  }, [buildPeer, fail, phase, requestMedia, role, threadId])

  const acceptCall = useCallback(async () => {
    if (!call?.offer) return
    setError('')
    setPhase('preparing')
    try {
      await requestMedia(call.type)
      const peer = buildPeer(call)
      await peer.setRemoteDescription(new RTCSessionDescription(call.offer))
      await flushCandidates()
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await updateChatCall(threadId, call.id, {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected',
        answeredAtIso: new Date().toISOString(),
      })
      setPhase('connected')
    } catch (reason) {
      void updateChatCall(threadId, call.id, { status: 'failed' })
      fail(reason)
    }
  }, [buildPeer, call, fail, flushCandidates, requestMedia, threadId])

  const finishCall = useCallback(async (status = 'ended') => {
    const active = callRef.current
    if (active?.id && threadId) {
      try {
        await updateChatCall(threadId, active.id, {
          status,
          endedAtIso: new Date().toISOString(),
          endedBy: role,
        })
      } catch {
        // Local media must still stop even if signaling cleanup fails.
      }
    }
    reset()
  }, [reset, role, threadId])

  useEffect(() => {
    if (!threadId) return undefined
    return subscribeChatCalls(
      threadId,
      (calls) => {
        const current = callRef.current
        if (current) {
          const next = calls.find((item) => item.id === current.id)
          if (!next) return
          setCall(next)
          if (TERMINAL_STATUSES.has(next.status)) {
            reset()
            return
          }
          if (next.answer && peerRef.current && !peerRef.current.remoteDescription) {
            void peerRef.current
              .setRemoteDescription(new RTCSessionDescription(next.answer))
              .then(flushCandidates)
              .then(() => setPhase('connected'))
              .catch(fail)
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
          setCall(incoming)
          setPhase('ringing')
          onIncoming?.(incoming)
        }
      },
      () => {},
    )
  }, [fail, flushCandidates, onIncoming, reset, role, threadId])

  useEffect(() => {
    if (phase !== 'ringing') return undefined
    playChatNotifySound()
    navigator.vibrate?.([220, 120, 220])
    const timer = window.setInterval(() => playChatNotifySound(), 2200)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'calling' || !call?.id) return undefined
    const timer = window.setTimeout(() => {
      void finishCall('missed')
    }, RING_MAX_AGE_MS)
    return () => window.clearTimeout(timer)
  }, [call?.id, finishCall, phase])

  const toggleMic = () => {
    const next = !micOn
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
    setMicOn(next)
  }

  const toggleCamera = () => {
    const next = !cameraOn
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
    setCameraOn(next)
  }

  const showOverlay = phase !== 'idle'
  return (
    <>
      {canStart ? (
        <div className={`hana-call-buttons${compact ? ' is-compact' : ''}`} aria-label="通話">
          <button type="button" onClick={() => void startCall('voice')} disabled={!threadId || showOverlay} title="音声通話">
            <PhoneIcon />
            {!compact ? <span>音声</span> : null}
          </button>
          <button type="button" onClick={() => void startCall('video')} disabled={!threadId || showOverlay} title="ビデオ通話">
            <PhoneIcon video />
            {!compact ? <span>ビデオ</span> : null}
          </button>
        </div>
      ) : null}

      {error && !showOverlay ? <p className="hana-call-inline-error">{error}</p> : null}

      {showOverlay ? createPortal(
        <div className={`hana-call-overlay is-${phase}`} role="dialog" aria-modal="true" aria-label="通話">
          <div className={`hana-call-stage${call?.type === 'video' ? ' is-video' : ' is-voice'}`}>
            <video ref={remoteVideoRef} className="hana-call-remote-video" autoPlay playsInline />
            <audio ref={remoteAudioRef} autoPlay />
            {call?.type === 'video' ? (
              <video ref={localVideoRef} className="hana-call-local-video" autoPlay muted playsInline />
            ) : null}

            <div className="hana-call-info">
              <span className="hana-call-avatar" aria-hidden="true">
                {String(partnerName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <h2>{partnerName || '通話相手'}</h2>
              <p>
                {phase === 'ringing' && `${call?.type === 'video' ? 'ビデオ' : '音声'}通話が着信しています`}
                {phase === 'calling' && '呼び出し中…'}
                {phase === 'preparing' && '接続を準備しています…'}
                {phase === 'connected' && (call?.type === 'video' ? 'ビデオ通話中' : '音声通話中')}
              </p>
              {error ? <p className="hana-call-error">{error}</p> : null}
            </div>

            <div className="hana-call-actions">
              {phase === 'ringing' ? (
                <>
                  <button type="button" className="is-decline" onClick={() => void finishCall('rejected')}>
                    拒否
                  </button>
                  <button type="button" className="is-accept" onClick={() => void acceptCall()}>
                    <PhoneIcon video={call?.type === 'video'} />
                    応答
                  </button>
                </>
              ) : (
                <>
                  {phase === 'connected' ? (
                    <button type="button" className={micOn ? '' : 'is-off'} onClick={toggleMic}>
                      {micOn ? 'マイク' : 'ミュート中'}
                    </button>
                  ) : null}
                  {phase === 'connected' && call?.type === 'video' ? (
                    <button type="button" className={cameraOn ? '' : 'is-off'} onClick={toggleCamera}>
                      {cameraOn ? 'カメラ' : 'カメラOFF'}
                    </button>
                  ) : null}
                  <button type="button" className="is-decline" onClick={() => void finishCall('ended')}>
                    終了
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
