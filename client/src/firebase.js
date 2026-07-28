// Firebase initialization — Firestore + Auth + Storage (large PDFs)
import { getAnalytics } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import {
    getAuth,
    getRedirectResult,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    signOut,
} from 'firebase/auth'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import {
    deleteObject,
    getBlob,
    getBytes,
    getDownloadURL,
    getStorage,
    ref as storageRef,
    uploadBytes,
    uploadBytesResumable,
} from 'firebase/storage'
import { collectAccessLogPayload } from './accessLog'

const firebaseConfig = {
  apiKey: 'AIzaSyBrzxY4sc2BC_5y1ymax08DkHbVoEKDo-8',
  authDomain: 'hana-mediabox.firebaseapp.com',
  projectId: 'hana-mediabox',
  storageBucket: 'hana-mediabox.firebasestorage.app',
  messagingSenderId: '334684002373',
  appId: '1:334684002373:web:b36dada39c02f415bc6b2c',
  measurementId: 'G-W1CXBBMWC0',
}

const app = initializeApp(firebaseConfig)
let analytics
try {
  analytics = getAnalytics(app)
} catch (e) {
  // analytics may fail in non-browser envs — ignore
}

const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const MEDIA_COLLECTION = 'media-items'
const ACCESS_LOGS_COLLECTION = 'access-logs'
const SHARED_STATE_COLLECTION = 'shared-state'
const SHARED_PLAYLISTS_DOC = 'playlists'
const SHARED_SPACES_DOC = 'spaces'
const CHAT_THREADS_COLLECTION = 'chatThreads'
const CHAT_PROFILES_COLLECTION = 'chatProfiles'
const AVATAR_CACHE_PREFIX = 'hana-chat-avatar-'
const GUEST_CHAT_ID_KEY = 'hana-chat-guest-id'
const GUEST_LABELS = ['桜', '蜜', '月', '風', '霧', '蝶', '鈴', '露', '霞', '羽']

/** Password → guest identity (display in UI + how Hanachan addresses them). */
export const GUEST_PROFILES = {
  hiro: { key: 'hiro', displayName: 'ヒロ', addressAs: 'ヒロ' },
  zen: { key: 'zen', displayName: 'ぜん', addressAs: 'ぜん' },
  gabusan: { key: 'gabusan', displayName: 'ガブリエル', addressAs: 'ガブさん' },
}

/** Owner session identity (password `hana`). */
export const OWNER_PROFILE = {
  key: 'hana',
  displayName: 'はな',
  addressAs: 'はな',
  roleLabel: 'オーナー',
}

const AVATAR_PALETTE = ['#c45c4a', '#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777']

export function getGuestProfile(guestKey) {
  const key = String(guestKey || '').trim().toLowerCase()
  return GUEST_PROFILES[key] || null
}

/**
 * Resolve who is logged in for topbar / chat.
 * @param {'owner'|'guest'} authRole
 * @param {string} guestKey
 */
export function resolveSessionProfile(authRole, guestKey = '') {
  if (authRole === 'owner') {
    return {
      id: OWNER_PROFILE.key,
      key: OWNER_PROFILE.key,
      displayName: OWNER_PROFILE.displayName,
      addressAs: OWNER_PROFILE.addressAs,
      role: 'owner',
      roleLabel: OWNER_PROFILE.roleLabel,
    }
  }
  const guest = getGuestProfile(guestKey)
  if (guest) {
    return {
      id: guest.key,
      key: guest.key,
      displayName: guest.displayName,
      addressAs: guest.addressAs,
      role: 'guest',
      roleLabel: 'ゲスト',
    }
  }
  return {
    id: 'guest',
    key: 'guest',
    displayName: 'ゲスト',
    addressAs: 'ゲスト',
    role: 'guest',
    roleLabel: 'ゲスト',
  }
}

function avatarCacheKey(profileId) {
  return `${AVATAR_CACHE_PREFIX}${String(profileId || 'guest')}`
}

export function getCachedAvatarUrl(profileId) {
  try {
    return window.localStorage.getItem(avatarCacheKey(profileId)) || ''
  } catch {
    return ''
  }
}

export function setCachedAvatarUrl(profileId, url) {
  try {
    if (!url) {
      window.localStorage.removeItem(avatarCacheKey(profileId))
      return
    }
    window.localStorage.setItem(avatarCacheKey(profileId), String(url))
  } catch {
    /* ignore */
  }
}

function hashString(value) {
  const raw = String(value || '')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Initials SVG data URL used when no custom avatar is set. */
export function getDefaultAvatarDataUrl(profileId, displayName = '') {
  const label = String(displayName || profileId || '?').trim()
  const initial = Array.from(label)[0] || '?'
  const color = AVATAR_PALETTE[hashString(profileId || label) % AVATAR_PALETTE.length]
  const safe = initial
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="${color}"/>
  <text x="64" y="64" text-anchor="middle" dominant-baseline="central" font-size="58" font-family="system-ui,-apple-system,'Segoe UI','Hiragino Sans','Noto Sans JP',sans-serif" font-weight="600" fill="#fff8f0">${safe}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Prefer custom URL, else cached, else optional fallback (e.g. Hana art), else initials. */
export function resolveAvatarSrc(profileId, displayName, customUrl = '', fallbackUrl = '') {
  const url = String(customUrl || getCachedAvatarUrl(profileId) || '').trim()
  if (url) return url
  const fallback = String(fallbackUrl || '').trim()
  if (fallback) return fallback
  return getDefaultAvatarDataUrl(profileId, displayName)
}

function serializeChatProfile(id, data) {
  return {
    id,
    displayName: String(data?.displayName || ''),
    avatarUrl: String(data?.avatarUrl || ''),
    updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || data?.updatedAtIso || null,
  }
}

/** @returns {() => void} */
export function subscribeChatProfile(profileId, onData, onError) {
  if (!profileId) {
    onData?.(null)
    return () => {}
  }
  return onSnapshot(
    doc(db, CHAT_PROFILES_COLLECTION, profileId),
    (snap) => {
      if (!snap.exists()) {
        onData?.(null)
        return
      }
      const profile = serializeChatProfile(snap.id, snap.data())
      if (profile.avatarUrl) setCachedAvatarUrl(profileId, profile.avatarUrl)
      onData?.(profile)
    },
    (error) => onError?.(error),
  )
}

/**
 * Watch several chat profiles (known guests + hana).
 * @param {string[]} profileIds
 * @returns {() => void}
 */
export function subscribeChatProfiles(profileIds, onData, onError) {
  const ids = [...new Set((profileIds || []).filter(Boolean))]
  if (ids.length === 0) {
    onData?.({})
    return () => {}
  }
  const map = {}
  const unsubs = ids.map((id) => subscribeChatProfile(
    id,
    (profile) => {
      if (profile) map[id] = profile
      else delete map[id]
      onData?.({ ...map })
    },
    onError,
  ))
  return () => unsubs.forEach((unsub) => unsub())
}

async function resizeImageToJpegBlob(file, maxSize = 256) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました。'))
      img.src = objectUrl
    })
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画像の変換に失敗しました。')
    ctx.drawImage(image, 0, 0, width, height)
    const blob = await new Promise((resolve) => {
      canvas.toBlob((next) => resolve(next), 'image/jpeg', 0.88)
    })
    if (!blob) throw new Error('画像の変換に失敗しました。')
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Upload a user avatar and persist URL to chatProfiles.
 * @param {string} profileId
 * @param {File} file
 * @param {{ displayName?: string }} [meta]
 */
export async function uploadUserAvatar(profileId, file, meta = {}) {
  const id = String(profileId || '').trim().toLowerCase()
  if (!id) throw new Error('プロフィールIDがありません。')
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('画像ファイルを選んでください。')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('画像は8MB以下にしてください。')
  }

  const blob = await resizeImageToJpegBlob(file, 256)
  const objectRef = storageRef(storage, `avatars/${id}.jpg`)
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' })
  const avatarUrl = await getDownloadURL(objectRef)
  const nowIso = new Date().toISOString()
  const displayName = String(meta.displayName || '').trim()
  await setDoc(
    doc(db, CHAT_PROFILES_COLLECTION, id),
    {
      avatarUrl,
      ...(displayName ? { displayName } : {}),
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
  setCachedAvatarUrl(id, avatarUrl)
  return avatarUrl
}

/** Resolve a friendly guest display name from thread id / guestKey / stored label. */
export function resolveGuestDisplayName({ threadId, guestKey, guestLabel } = {}) {
  const fromKey = getGuestProfile(guestKey)
  if (fromKey) return fromKey.displayName
  const id = String(threadId || '')
  const known = id.match(/^guest-(hiro|zen|gabusan)$/i)
  if (known) return GUEST_PROFILES[known[1].toLowerCase()]?.displayName || id
  const label = String(guestLabel || '').trim()
  if (label && !/^ゲスト/.test(label)) return label
  return label || guestLabelFromUid(id || 'guest')
}

const functions = getFunctions(app, 'asia-northeast1')
const SPACE_PARTICLE_TYPES = new Set(['stars', 'rain', 'mist', 'petals'])
const SPACE_AMBIENT_TYPES = new Set(['ocean', 'rain', 'wind', 'room'])
const MAX_SHARED_CUSTOM_SPACES = 12
const MAX_SHARED_SPACE_LABEL = 20
const CHUNK_SIZE = 700_000
/** Firestore-chunked uploads (audio / video / images). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024
/** Books/PDFs go to Firebase Storage and can be larger. */
export const MAX_BOOK_FILE_SIZE = 80 * 1024 * 1024
const ACCESS_LOG_SESSION_KEY = 'hana-mediabox-access-logged'

export function getMaxUploadBytes(kind) {
  return kind === 'book' ? MAX_BOOK_FILE_SIZE : MAX_FILE_SIZE
}

function shouldUseObjectStorage(file, metadata = {}) {
  return metadata.kind === 'book' || file?.type === 'application/pdf'
}

function sanitizeStorageFileName(name = 'file') {
  const base = String(name).split(/[/\\]/).pop() || 'file'
  return base.replace(/[^\w.\-()\u3040-\u30ff\u3400-\u9fff]+/g, '_').slice(0, 120) || 'file'
}

/** Optional: only these emails may use /admin. Leave empty to allow any signed-in Firebase user. */
export const ADMIN_EMAIL_ALLOWLIST = [
  'hihig9@gmail.com',
  'koyamamika.me@gmail.com',
  // 'your.google.account@gmail.com',
]

export function isAdminEmailAllowed(email) {
  if (!ADMIN_EMAIL_ALLOWLIST.length) return true
  const normalized = String(email || '').trim().toLowerCase()
  return ADMIN_EMAIL_ALLOWLIST.some((item) => item.trim().toLowerCase() === normalized)
}

async function assertAdminUser(user) {
  if (!user) return null
  if (isAdminEmailAllowed(user.email)) return user
  await signOut(auth)
  const error = new Error('この Google アカウントには管理権限がありません。')
  error.code = 'auth/admin-email-denied'
  throw error
}

export function sortMediaItems(items) {
  return [...items].sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : null
    const bOrder = typeof b.order === 'number' ? b.order : null

    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
      return aOrder - bOrder
    }
    if (aOrder !== null && bOrder === null) return -1
    if (aOrder === null && bOrder !== null) return 1

    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const sliceSize = 0x8000

  for (let i = 0; i < bytes.length; i += sliceSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + sliceSize))
  }

  return btoa(binary)
}

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export function getFirebaseErrorMessage(error) {
  const code = error?.code || ''

  if (code === 'permission-denied') {
    return 'Firestoreの権限がありません。Firestore Rulesを確認してください。'
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'メールアドレスまたはパスワードが正しくありません。'
  }
  if (code === 'auth/too-many-requests') {
    return '試行回数が多すぎます。しばらくしてから再試行してください。'
  }
  if (code === 'auth/invalid-email') {
    return 'メールアドレスの形式が正しくありません。'
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Googleログインがキャンセルされました。'
  }
  if (code === 'auth/popup-blocked') {
    return 'ポップアップがブロックされました。ブラウザの設定を確認してください。'
  }
  if (code === 'auth/admin-email-denied') {
    return error?.message || 'このアカウントには管理権限がありません。'
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'ストレージからの読み込みに失敗しました。通信環境を確認して、もう一度開いてください。'
  }
  if (code === 'storage/unauthorized' || code === 'storage/object-not-found') {
    return 'ファイルをストレージから取得できませんでした。再アップロードしてください。'
  }

  return error?.message || 'アップロードに失敗しました。'
}

export function isAdminUser(user) {
  return Boolean(user && !user.isAnonymous && isAdminEmailAllowed(user.email))
}

export function subscribeToAdminAuth(onChange) {
  return onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous && !isAdminEmailAllowed(user.email)) {
      signOut(auth).finally(() => onChange(null))
      return
    }
    onChange(isAdminUser(user) ? user : null)
  })
}

/** Admin Firebase auth only (guests use localStorage chat id, not Auth). */
export function subscribeToAuthUser(onChange) {
  return onAuthStateChanged(auth, (user) => {
    onChange(isAdminUser(user) ? user : null)
  })
}

/**
 * Stable guest thread id per password guest (separate history per guest).
 * Known guests use deterministic ids: guest-hiro, guest-zen, guest-gabusan.
 * @param {string} [guestKey]
 * @returns {string}
 */
export function ensureGuestChatId(guestKey = 'guest') {
  const profile = getGuestProfile(guestKey)
  if (profile) {
    const id = `guest-${profile.key}`
    try {
      localStorage.setItem(`${GUEST_CHAT_ID_KEY}:${profile.key}`, id)
    } catch {
      /* ignore */
    }
    return id
  }

  const storageKey = `${GUEST_CHAT_ID_KEY}:${guestKey || 'guest'}`
  try {
    const existing = localStorage.getItem(storageKey) || localStorage.getItem(GUEST_CHAT_ID_KEY)
    if (existing && /^[a-zA-Z0-9_-]{8,128}$/.test(existing)) {
      localStorage.setItem(storageKey, existing)
      return existing
    }
    const id = globalThis.crypto?.randomUUID?.()
      || `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(storageKey, id)
    return id
  } catch {
    if (!ensureGuestChatId._fallback) {
      ensureGuestChatId._fallback = globalThis.crypto?.randomUUID?.()
        || `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
    return ensureGuestChatId._fallback
  }
}

export function guestLabelFromUid(uid) {
  const raw = String(uid || 'guest')
  const known = raw.match(/^guest-(hiro|zen|gabusan)$/i)
  if (known) {
    return GUEST_PROFILES[known[1].toLowerCase()]?.displayName || raw
  }
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0
  }
  const petal = GUEST_LABELS[hash % GUEST_LABELS.length]
  const num = (hash % 90) + 10
  return `ゲスト${petal}${num}`
}

function serializeChatMessage(id, data) {
  const deleted = Boolean(data?.deleted)
  return {
    id,
    text: deleted ? '（削除されたメッセージ）' : String(data?.text || ''),
    rawText: String(data?.text || ''),
    sender: data?.sender === 'hana' ? 'hana' : 'guest',
    createdAt: data?.createdAt?.toDate?.()?.toISOString?.() || data?.createdAtIso || null,
    editedAt: data?.editedAt?.toDate?.()?.toISOString?.() || data?.editedAtIso || null,
    deleted,
    replyTo: data?.replyToId
      ? {
          id: String(data.replyToId),
          text: String(data.replyToText || ''),
          sender: data.replyToSender === 'hana' ? 'hana' : data.replyToSender === 'hanachan' ? 'hanachan' : 'guest',
        }
      : null,
  }
}

function serializeChatThread(id, data) {
  const guestKey = data?.guestKey || (String(id).match(/^guest-(.+)$/) || [])[1] || ''
  return {
    id,
    guestKey,
    guestLabel: resolveGuestDisplayName({
      threadId: id,
      guestKey,
      guestLabel: data?.guestLabel,
    }),
    lastText: String(data?.lastText || ''),
    updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || data?.updatedAtIso || null,
    unreadByHana: Boolean(data?.unreadByHana),
    unreadByGuest: Boolean(data?.unreadByGuest),
    unreadCountHana: Math.max(0, Number(data?.unreadCountHana) || 0),
    unreadCountGuest: Math.max(0, Number(data?.unreadCountGuest) || 0),
    hanaLastReadAt: data?.hanaLastReadAt?.toDate?.()?.toISOString?.() || data?.hanaLastReadAtIso || null,
    guestLastReadAt: data?.guestLastReadAt?.toDate?.()?.toISOString?.() || data?.guestLastReadAtIso || null,
    guestOnlineAt: data?.guestOnlineAt?.toDate?.()?.toISOString?.() || data?.guestOnlineAtIso || null,
    hanaOnlineAt: data?.hanaOnlineAt?.toDate?.()?.toISOString?.() || data?.hanaOnlineAtIso || null,
  }
}

const PRESENCE_ONLINE_MS = 45_000

/** True if last heartbeat is recent enough to count as online. */
export function isPresenceOnline(iso, now = Date.now()) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return now - t <= PRESENCE_ONLINE_MS
}

/**
 * Heartbeat while chat UI is open.
 * @param {string} threadId
 * @param {'guest'|'hana'} role
 */
export async function pulseChatPresence(threadId, role) {
  if (!threadId || (role !== 'guest' && role !== 'hana')) return
  const nowIso = new Date().toISOString()
  const patch = role === 'hana'
    ? { hanaOnlineAt: serverTimestamp(), hanaOnlineAtIso: nowIso }
    : { guestOnlineAt: serverTimestamp(), guestOnlineAtIso: nowIso }
  await setDoc(doc(db, CHAT_THREADS_COLLECTION, threadId), patch, { merge: true })
}

/** Format message timestamp for chat UI (Asia/Tokyo-friendly local). */
export function formatChatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return time
  const day = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  return `${day} ${time}`
}

/**
 * Delivery status for messages the current viewer sent.
 * @param {{ sender: string, createdAt?: string|null }} message
 * @param {{ hanaLastReadAt?: string|null, guestLastReadAt?: string|null }|null} thread
 * @param {'guest'|'hana'} viewer
 * @returns {'sent'|'read'|null}
 */
export function getMessageDeliveryStatus(message, thread, viewer) {
  if (!message || (viewer !== 'guest' && viewer !== 'hana')) return null
  if (message.sender !== viewer) return null
  if (!message.createdAt) return 'sent'
  const readAt = viewer === 'guest' ? thread?.hanaLastReadAt : thread?.guestLastReadAt
  if (readAt) {
    const readMs = new Date(readAt).getTime()
    const createdMs = new Date(message.createdAt).getTime()
    // Allow 2s skew between client ISO and server Timestamp.
    if (!Number.isNaN(readMs) && !Number.isNaN(createdMs) && readMs + 2000 >= createdMs) {
      return 'read'
    }
  }
  // If recipient cleared unread after this message was the latest, treat as read.
  const unreadFlag = viewer === 'guest' ? thread?.unreadByHana : thread?.unreadByGuest
  if (unreadFlag === false && readAt) {
    const readMs = new Date(readAt).getTime()
    const createdMs = new Date(message.createdAt).getTime()
    if (!Number.isNaN(readMs) && !Number.isNaN(createdMs) && readMs + 5000 >= createdMs) {
      return 'read'
    }
  }
  return 'sent'
}

export function deliveryStatusLabel(status) {
  if (status === 'read') return '既読'
  if (status === 'sent') return '送信済'
  return ''
}

/** @returns {() => void} */
export function subscribeChatMessages(threadId, onData, onError) {
  if (!threadId) {
    onData?.([])
    return () => {}
  }
  // Sort client-side: orderBy('createdAt') silently drops docs missing that field.
  const messagesRef = collection(db, CHAT_THREADS_COLLECTION, threadId, 'messages')
  return onSnapshot(
    query(messagesRef, limit(200)),
    (snap) => {
      const rows = snap.docs
        .map((document) => serializeChatMessage(document.id, document.data()))
        .sort((a, b) => String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || '')))
      onData?.(rows)
    },
    (error) => onError?.(error),
  )
}

/**
 * If a known guest still has history on a legacy UUID thread, copy it into guest-{key}
 * so owner + guest share one conversation.
 * @returns {Promise<string>} thread id to open
 */
export async function migrateLegacyGuestThread({
  canonicalId,
  legacyThreadId,
  guestLabel,
  guestKey,
}) {
  if (!canonicalId || !legacyThreadId || canonicalId === legacyThreadId) {
    return canonicalId || legacyThreadId
  }

  // Fast path: if canonical already has any message, keep using the caller's preferred id.
  const canonMessagesRef = collection(db, CHAT_THREADS_COLLECTION, canonicalId, 'messages')
  const canonSnap = await getDocs(query(canonMessagesRef, limit(1)))
  if (!canonSnap.empty) return legacyThreadId

  const legacyMessagesRef = collection(db, CHAT_THREADS_COLLECTION, legacyThreadId, 'messages')
  const [legacySnap, legacyThreadSnap] = await Promise.all([
    getDocs(query(legacyMessagesRef, limit(200))),
    getDoc(doc(db, CHAT_THREADS_COLLECTION, legacyThreadId)),
  ])

  if (legacySnap.empty) return canonicalId

  const legacyMeta = legacyThreadSnap.exists() ? legacyThreadSnap.data() : {}
  const nowIso = new Date().toISOString()
  await setDoc(
    doc(db, CHAT_THREADS_COLLECTION, canonicalId),
    {
      guestLabel: guestLabel || legacyMeta.guestLabel || guestLabelFromUid(canonicalId),
      guestKey: guestKey || legacyMeta.guestKey || String(canonicalId).replace(/^guest-/, ''),
      lastText: legacyMeta.lastText || '',
      updatedAt: serverTimestamp(),
      updatedAtIso: legacyMeta.updatedAtIso || nowIso,
      unreadByHana: Boolean(legacyMeta.unreadByHana),
      unreadByGuest: Boolean(legacyMeta.unreadByGuest),
      unreadCountHana: Math.max(0, Number(legacyMeta.unreadCountHana) || 0),
      unreadCountGuest: Math.max(0, Number(legacyMeta.unreadCountGuest) || 0),
      guestLastReadAt: legacyMeta.guestLastReadAt || null,
      hanaLastReadAt: legacyMeta.hanaLastReadAt || null,
      migratedFrom: legacyThreadId,
    },
    { merge: true },
  )

  const docs = legacySnap.docs
  for (let i = 0; i < docs.length; i += 50) {
    const batch = writeBatch(db)
    docs.slice(i, i + 50).forEach((messageDoc) => {
      batch.set(doc(canonMessagesRef, messageDoc.id), messageDoc.data(), { merge: true })
    })
    await batch.commit()
  }

  return canonicalId
}

/** Guest: watch own thread metadata (unread badge). */
export function subscribeOwnChatThread(threadId, onData, onError) {
  if (!threadId) {
    onData?.(null)
    return () => {}
  }
  return onSnapshot(
    doc(db, CHAT_THREADS_COLLECTION, threadId),
    (snap) => {
      if (!snap.exists()) {
        onData?.(null)
        return
      }
      onData?.(serializeChatThread(snap.id, snap.data()))
    },
    (error) => onError?.(error),
  )
}

/** Admin: watch all guest threads. */
export function subscribeChatThreads(onData, onError) {
  const threadsQuery = query(
    collection(db, CHAT_THREADS_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(80),
  )
  return onSnapshot(
    threadsQuery,
    (snap) => {
      onData?.(snap.docs.map((document) => serializeChatThread(document.id, document.data())))
    },
    (error) => onError?.(error),
  )
}

/**
 * @param {{
 *   threadId: string,
 *   text: string,
 *   sender: 'guest'|'hana',
 *   guestLabel?: string,
 *   guestKey?: string,
 *   replyTo?: { id: string, text: string, sender: string }|null,
 * }} payload
 */
export async function sendChatMessage({ threadId, text, sender, guestLabel, guestKey, replyTo }) {
  const trimmed = String(text || '').trim()
  if (!threadId || !trimmed) return null
  if (trimmed.length > 2000) {
    const error = new Error('メッセージが長すぎます。')
    error.code = 'chat/too-long'
    throw error
  }

  const role = sender === 'hana' ? 'hana' : 'guest'
  const threadRef = doc(db, CHAT_THREADS_COLLECTION, threadId)
  const messagesRef = collection(threadRef, 'messages')
  const nowIso = new Date().toISOString()
  const label = guestLabel || guestLabelFromUid(threadId)
  const key = guestKey || getGuestProfile(String(threadId).replace(/^guest-/, ''))?.key || ''

  await setDoc(
    threadRef,
    {
      guestLabel: label,
      ...(key ? { guestKey: key } : {}),
      lastText: trimmed.slice(0, 160),
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      ...(role === 'guest'
        ? {
            unreadByHana: true,
            unreadCountHana: increment(1),
          }
        : {
            unreadByGuest: true,
            unreadCountGuest: increment(1),
          }),
    },
    { merge: true },
  )

  const payload = {
    text: trimmed,
    sender: role,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    deleted: false,
  }
  if (replyTo?.id) {
    payload.replyToId = String(replyTo.id)
    payload.replyToText = String(replyTo.text || '').slice(0, 120)
    payload.replyToSender = String(replyTo.sender || 'guest')
  }

  const messageRef = await addDoc(messagesRef, payload)
  return messageRef.id
}

export async function updateChatMessage({ threadId, messageId, text }) {
  const trimmed = String(text || '').trim()
  if (!threadId || !messageId || !trimmed) return
  if (trimmed.length > 2000) {
    const error = new Error('メッセージが長すぎます。')
    error.code = 'chat/too-long'
    throw error
  }
  const nowIso = new Date().toISOString()
  await updateDoc(doc(db, CHAT_THREADS_COLLECTION, threadId, 'messages', messageId), {
    text: trimmed,
    editedAt: serverTimestamp(),
    editedAtIso: nowIso,
    deleted: false,
  })
  await setDoc(
    doc(db, CHAT_THREADS_COLLECTION, threadId),
    {
      lastText: trimmed.slice(0, 160),
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
}

export async function softDeleteChatMessage({ threadId, messageId }) {
  if (!threadId || !messageId) return
  const nowIso = new Date().toISOString()
  await updateDoc(doc(db, CHAT_THREADS_COLLECTION, threadId, 'messages', messageId), {
    text: '（削除されたメッセージ）',
    deleted: true,
    editedAt: serverTimestamp(),
    editedAtIso: nowIso,
    deletedAtIso: nowIso,
  })
  await setDoc(
    doc(db, CHAT_THREADS_COLLECTION, threadId),
    {
      lastText: '（削除されたメッセージ）',
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
}

export async function markThreadRead(threadId, reader) {
  if (!threadId) return
  const nowIso = new Date().toISOString()
  const patch = reader === 'hana'
    ? {
        unreadByHana: false,
        unreadCountHana: 0,
        hanaLastReadAt: serverTimestamp(),
        hanaLastReadAtIso: nowIso,
      }
    : {
        unreadByGuest: false,
        unreadCountGuest: 0,
        guestLastReadAt: serverTimestamp(),
        guestLastReadAtIso: nowIso,
      }
  await setDoc(doc(db, CHAT_THREADS_COLLECTION, threadId), patch, { merge: true })
}

/** Unread message count for launcher / thread chips (falls back to 1 if only the boolean flag is set). */
export function threadUnreadCount(thread, viewer) {
  if (!thread) return 0
  if (viewer === 'hana') {
    const n = Number(thread.unreadCountHana) || 0
    if (n > 0) return n
    return thread.unreadByHana ? 1 : 0
  }
  const n = Number(thread.unreadCountGuest) || 0
  if (n > 0) return n
  return thread.unreadByGuest ? 1 : 0
}

async function deleteAllDocsInCollection(collectionRef) {
  for (;;) {
    const snap = await getDocs(query(collectionRef, limit(400)))
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach((document) => {
      batch.delete(document.ref)
    })
    await batch.commit()
  }
}

/**
 * Clear one chat thread's message history.
 * @param {string} threadId
 * @param {{ deleteThread?: boolean }} [options] If true, remove the thread doc too (admin).
 */
export async function clearChatThreadHistory(threadId, { deleteThread = false } = {}) {
  if (!threadId) return
  const threadRef = doc(db, CHAT_THREADS_COLLECTION, threadId)
  await deleteAllDocsInCollection(collection(threadRef, 'messages'))

  if (deleteThread) {
    await deleteDoc(threadRef)
    return
  }

  const nowIso = new Date().toISOString()
  await setDoc(
    threadRef,
    {
      lastText: '',
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      unreadByHana: false,
      unreadByGuest: false,
      unreadCountHana: 0,
      unreadCountGuest: 0,
    },
    { merge: true },
  )
}

/**
 * Wipe every guest chat thread (messages + thread docs). Requires admin for thread deletes.
 * @returns {Promise<number>} number of threads cleared
 */
export async function clearAllChatHistories() {
  const snap = await getDocs(collection(db, CHAT_THREADS_COLLECTION))
  for (const threadDoc of snap.docs) {
    await clearChatThreadHistory(threadDoc.id, { deleteThread: true })
  }
  return snap.size
}

/** Ensure a known guest thread doc exists (admin roster / open chat). */
export async function ensureChatThread({ threadId, guestLabel, guestKey }) {
  if (!threadId) return null
  const threadRef = doc(db, CHAT_THREADS_COLLECTION, threadId)
  const existing = await getDoc(threadRef)
  if (existing.exists()) return threadId

  const nowIso = new Date().toISOString()
  const profile = getGuestProfile(guestKey) || getGuestProfile(String(threadId).replace(/^guest-/, ''))
  await setDoc(
    threadRef,
    {
      guestLabel: guestLabel || profile?.displayName || guestLabelFromUid(threadId),
      guestKey: guestKey || profile?.key || '',
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      lastText: '',
      unreadByHana: false,
      unreadByGuest: false,
      unreadCountHana: 0,
      unreadCountGuest: 0,
    },
    { merge: true },
  )
  return threadId
}

/**
 * Call Cloud Function `chatHanachan`.
 * @param {{ message: string, history?: { role: string, text: string }[], guestName?: string, addressAs?: string }} payload
 */
export async function chatWithHanachan(payload) {
  const callable = httpsCallable(functions, 'chatHanachan')
  const result = await callable({
    message: String(payload?.message || '').trim(),
    history: Array.isArray(payload?.history) ? payload.history.slice(-12) : [],
    guestName: String(payload?.guestName || '').trim().slice(0, 40),
    addressAs: String(payload?.addressAs || '').trim().slice(0, 40),
  })
  return result?.data || { reply: '' }
}

export async function completeAdminRedirectLogin() {
  const result = await getRedirectResult(auth)
  if (!result?.user) return null
  return assertAdminUser(result.user)
}

export async function loginAdmin(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
  return assertAdminUser(credential.user)
}

export async function loginAdminWithGoogle() {
  try {
    const credential = await signInWithPopup(auth, googleProvider)
    return assertAdminUser(credential.user)
  } catch (error) {
    if (error?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider)
      return null
    }
    throw error
  }
}

export async function logoutAdmin() {
  await signOut(auth)
}

export function getAdminUser() {
  return auth.currentUser
}

/** Record one access log per browser tab session (best-effort). */
export async function recordAccessVisit() {
  try {
    if (sessionStorage.getItem(ACCESS_LOG_SESSION_KEY) === '1') return null
    sessionStorage.setItem(ACCESS_LOG_SESSION_KEY, '1')
  } catch {
    /* private mode may block sessionStorage — still try to log */
  }

  const payload = await collectAccessLogPayload()
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

  await setDoc(doc(db, ACCESS_LOGS_COLLECTION, id), {
    ...payload,
    createdAt: serverTimestamp(),
  })

  return id
}

export function subscribeToAccessLogs(onData, onError, maxItems = 200) {
  const logsQuery = query(
    collection(db, ACCESS_LOGS_COLLECTION),
    orderBy('visitedAt', 'desc'),
    limit(maxItems),
  )

  return onSnapshot(
    logsQuery,
    (snapshot) => {
      const logs = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }))
      onData(logs)
    },
    onError,
  )
}

export async function uploadMediaFile(file, metadata, onProgress) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

  // Large PDFs/books: Firebase Storage. Other media stays in Firestore chunks.
  if (shouldUseObjectStorage(file, metadata)) {
    const path = `uploads/${id}/${sanitizeStorageFileName(file.name || 'book.pdf')}`
    const objectRef = storageRef(storage, path)
    const task = uploadBytesResumable(objectRef, file, {
      contentType: file.type || 'application/pdf',
    })

    await new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (!snapshot.totalBytes) return
          onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
        },
        reject,
        resolve,
      )
    })

    await setDoc(doc(db, MEDIA_COLLECTION, id), {
      ...metadata,
      size: file.size,
      storagePath: path,
      chunkCount: 0,
      createdAt: new Date().toISOString(),
    })
    onProgress?.(100)
    return id
  }

  const buffer = await file.arrayBuffer()
  const totalChunks = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE))

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * CHUNK_SIZE
    const end = Math.min(buffer.byteLength, start + CHUNK_SIZE)
    const data = arrayBufferToBase64(buffer.slice(start, end))

    await setDoc(doc(db, MEDIA_COLLECTION, id, 'chunks', String(index)), { index, data })
    onProgress?.(Math.round(((index + 1) / totalChunks) * 100))
  }

  await setDoc(doc(db, MEDIA_COLLECTION, id), {
    ...metadata,
    size: file.size,
    chunkCount: totalChunks,
    createdAt: new Date().toISOString(),
  })

  return id
}

export async function loadMediaBlobUrl(itemId, mimeType, hint = null) {
  const data = await resolveMediaMeta(itemId, hint)
  if (data.storagePath) {
    const objectRef = storageRef(storage, data.storagePath)
    const type = mimeType || data.type || 'application/pdf'
    try {
      const remoteBlob = await getBlob(objectRef)
      const typedBlob = remoteBlob.type ? remoteBlob : new Blob([remoteBlob], { type })
      return URL.createObjectURL(typedBlob)
    } catch (blobError) {
      try {
        const bytes = await getBytes(objectRef)
        return URL.createObjectURL(new Blob([bytes], { type }))
      } catch {
        const downloadUrl = await getDownloadURL(objectRef)
        const response = await fetch(downloadUrl)
        if (!response.ok) throw blobError
        const fetched = await response.blob()
        return URL.createObjectURL(new Blob([fetched], { type: fetched.type || type }))
      }
    }
  }

  const { chunkCount = 1 } = data
  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const chunks = chunksSnap.docs
    .map((document) => document.data())
    .sort((a, b) => a.index - b.index)

  if (chunks.length === 0) {
    throw new Error('ファイルデータが見つかりません。')
  }

  const parts = chunks.slice(0, chunkCount).map((chunk) => base64ToUint8Array(chunk.data))
  const blob = new Blob(parts, { type: mimeType || data.type || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Load media as bytes (avoids blob→fetch round-trip for PDF readers).
 */
export async function loadMediaBytes(itemId, mimeType, hint = null) {
  const data = await resolveMediaMeta(itemId, hint)
  const type = mimeType || data.type || 'application/octet-stream'

  if (data.storagePath) {
    const objectRef = storageRef(storage, data.storagePath)
    try {
      const bytes = await getBytes(objectRef)
      return { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), type }
    } catch {
      const remoteBlob = await getBlob(objectRef)
      const buffer = await remoteBlob.arrayBuffer()
      return { bytes: new Uint8Array(buffer), type: remoteBlob.type || type }
    }
  }

  const { chunkCount = 1 } = data
  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const chunks = chunksSnap.docs
    .map((document) => document.data())
    .sort((a, b) => a.index - b.index)

  if (chunks.length === 0) {
    throw new Error('ファイルデータが見つかりません。')
  }

  const parts = chunks.slice(0, chunkCount).map((chunk) => base64ToUint8Array(chunk.data))
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  parts.forEach((part) => {
    bytes.set(part, offset)
    offset += part.byteLength
  })
  return { bytes, type }
}

async function resolveMediaMeta(itemId, hint = null) {
  if (hint?.storagePath) {
    return {
      storagePath: hint.storagePath,
      type: hint.type,
      chunkCount: hint.chunkCount || 0,
    }
  }
  if (hint && typeof hint.chunkCount === 'number' && !hint.storagePath) {
    return {
      type: hint.type,
      chunkCount: hint.chunkCount,
    }
  }

  const itemSnap = await getDoc(doc(db, MEDIA_COLLECTION, itemId))
  if (!itemSnap.exists()) {
    throw new Error('メディアが見つかりません。')
  }
  return itemSnap.data() || {}
}

export function subscribeToMediaItems(onData, onError) {
  return onSnapshot(
    collection(db, MEDIA_COLLECTION),
    (snapshot) => {
      const items = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }))
      onData(sortMediaItems(items))
    },
    onError,
  )
}

function normalizeSharedPlaylists(playlists) {
  if (!Array.isArray(playlists)) return []
  return playlists
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || 'Untitled').slice(0, 40),
      trackIds: Array.isArray(item.trackIds)
        ? item.trackIds.filter((id) => typeof id === 'string')
        : [],
    }))
    .filter((item) => item.id)
}

export function subscribeToSharedPlaylists(onData, onError) {
  return onSnapshot(
    doc(db, SHARED_STATE_COLLECTION, SHARED_PLAYLISTS_DOC),
    (snapshot) => {
      const data = snapshot.data() || {}
      const playlists = normalizeSharedPlaylists(data.playlists)
      onData(playlists, snapshot.exists())
    },
    onError,
  )
}

export async function saveSharedPlaylists(playlists) {
  await setDoc(
    doc(db, SHARED_STATE_COLLECTION, SHARED_PLAYLISTS_DOC),
    {
      playlists: normalizeSharedPlaylists(playlists),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

function normalizeSharedSpaces(spaces) {
  if (!Array.isArray(spaces)) return []
  return spaces
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const id = String(item.id || '')
      const particle = SPACE_PARTICLE_TYPES.has(item.particle) ? item.particle : 'stars'
      const ambient = SPACE_AMBIENT_TYPES.has(item.ambient) ? item.ambient : 'ocean'
      const backgroundItemId =
        typeof item.backgroundItemId === 'string' && item.backgroundItemId
          ? item.backgroundItemId
          : null
      return {
        id,
        label: String(item.label || '新しい場所').trim().slice(0, MAX_SHARED_SPACE_LABEL) || '新しい場所',
        particle,
        ambient,
        backgroundItemId,
        tagline: String(item.tagline || '').trim().slice(0, 40),
      }
    })
    .filter((item) => item.id.startsWith('custom-'))
    .slice(0, MAX_SHARED_CUSTOM_SPACES)
}

export function subscribeToSharedSpaces(onData, onError) {
  return onSnapshot(
    doc(db, SHARED_STATE_COLLECTION, SHARED_SPACES_DOC),
    (snapshot) => {
      const data = snapshot.data() || {}
      const spaces = normalizeSharedSpaces(data.spaces)
      onData(spaces, snapshot.exists())
    },
    onError,
  )
}

export async function saveSharedSpaces(spaces) {
  await setDoc(
    doc(db, SHARED_STATE_COLLECTION, SHARED_SPACES_DOC),
    {
      spaces: normalizeSharedSpaces(spaces),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function updateMediaCover(itemId, coverId) {
  await setDoc(
    doc(db, MEDIA_COLLECTION, itemId),
    { coverId: coverId || null },
    { merge: true },
  )
}

export async function updateMediaJacket(itemId, jacketId) {
  await setDoc(
    doc(db, MEDIA_COLLECTION, itemId),
    { jacketId: jacketId || null },
    { merge: true },
  )
}

export async function updateMediaJacketStyle(itemId, jacketStyle) {
  const style = typeof jacketStyle === 'string' && jacketStyle.trim() ? jacketStyle.trim() : null
  await setDoc(
    doc(db, MEDIA_COLLECTION, itemId),
    { jacketStyle: style },
    { merge: true },
  )
}

export async function updateMediaName(itemId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) {
    throw new Error('名前を入力してください。')
  }

  await setDoc(
    doc(db, MEDIA_COLLECTION, itemId),
    { name: trimmed },
    { merge: true },
  )
}

export async function updateMediaLyrics(itemId, lyrics) {
  await setDoc(
    doc(db, MEDIA_COLLECTION, itemId),
    { lyrics: lyrics || null },
    { merge: true },
  )
}

export async function updatePlaylistOrder(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return

  const batch = writeBatch(db)
  orderedIds.forEach((itemId, index) => {
    batch.set(
      doc(db, MEDIA_COLLECTION, itemId),
      { order: index },
      { merge: true },
    )
  })
  await batch.commit()
}

export async function deleteMediaItem(itemId) {
  const itemSnap = await getDoc(doc(db, MEDIA_COLLECTION, itemId))
  const storagePath = itemSnap.exists() ? itemSnap.data()?.storagePath : null

  if (storagePath) {
    try {
      await deleteObject(storageRef(storage, storagePath))
    } catch (storageError) {
      // Missing object should not block Firestore cleanup.
      console.warn('Storage delete skipped:', storageError)
    }
  }

  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const batch = writeBatch(db)

  chunksSnap.docs.forEach((document) => {
    batch.delete(document.ref)
  })
  batch.delete(doc(db, MEDIA_COLLECTION, itemId))

  await batch.commit()
}

export { analytics, app, auth, db, storage }

