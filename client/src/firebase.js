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
    initializeFirestore,
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

// Android WebView (Capacitor) often fails Firestore's WebChannel streams,
// so let the SDK fall back to long-polling when it detects a bad connection.
let db
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
} catch {
  db = getFirestore(app)
}
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
const PUSH_TOKENS_COLLECTION = 'pushTokens'
const AVATAR_CACHE_PREFIX = 'hana-chat-avatar-'
const GUEST_CHAT_ID_KEY = 'hana-chat-guest-id'
const GUEST_LABELS = ['桜', '蜜', '月', '風', '霧', '蝶', '鈴', '露', '霞', '羽']

/** Password -> guest identity (display in UI + how Hanachan addresses them). Seed defaults. */
export const GUEST_PROFILES = {
  hiro: { key: 'hiro', displayName: 'ヒロ', addressAs: 'ヒロ' },
  zen: { key: 'zen', displayName: 'ぜん', addressAs: 'ぜん' },
  gabusan: { key: 'gabusan', displayName: 'ガブリエル', addressAs: 'ガブさん' },
}

/** Owner session identity (password `hana`). Seed default. */
export const OWNER_PROFILE = {
  key: 'hana',
  displayName: 'はな',
  addressAs: 'はな',
  roleLabel: 'オーナー',
}

/** Built-in accounts used for first-run seed + offline fallback. */
export const DEFAULT_CHAT_ACCOUNTS = [
  ...Object.values(GUEST_PROFILES).map((profile) => ({
    key: profile.key,
    passKey: profile.key,
    displayName: profile.displayName,
    addressAs: profile.addressAs,
    role: 'guest',
    roleLabel: 'ゲスト',
  })),
  {
    key: OWNER_PROFILE.key,
    passKey: OWNER_PROFILE.key,
    displayName: OWNER_PROFILE.displayName,
    addressAs: OWNER_PROFILE.addressAs,
    role: 'owner',
    roleLabel: OWNER_PROFILE.roleLabel,
  },
]

function accountFromDefault(def) {
  return {
    id: def.key,
    key: def.key,
    passKey: def.passKey || def.key,
    displayName: def.displayName,
    addressAs: def.addressAs || def.displayName,
    role: def.role,
    roleLabel: def.roleLabel || (def.role === 'owner' ? 'オーナー' : 'ゲスト'),
    avatarUrl: '',
    updatedAt: null,
  }
}

/** Live account list (Firestore-backed when subscribed). */
let chatAccountsCache = DEFAULT_CHAT_ACCOUNTS.map(accountFromDefault)

export function getChatAccountsSnapshot() {
  return chatAccountsCache.slice()
}

function setChatAccountsCache(next) {
  chatAccountsCache = Array.isArray(next) && next.length
    ? next.slice()
    : DEFAULT_CHAT_ACCOUNTS.map(accountFromDefault)
}

export function normalizeAccountKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

export function isValidAccountKey(value) {
  const key = normalizeAccountKey(value)
  return key.length >= 2 && key.length <= 24 && /^[a-z0-9][a-z0-9_-]*$/.test(key)
}

function serializeChatAccount(id, data = {}) {
  const key = normalizeAccountKey(id)
  const role = data?.role === 'owner' ? 'owner' : data?.role === 'guest' ? 'guest' : ''
  const displayName = String(data?.displayName || key || '').trim() || key
  const addressAs = String(data?.addressAs || displayName).trim() || displayName
  const passKey = normalizeAccountKey(data?.passKey || key) || key
  return {
    id: key,
    key,
    passKey,
    displayName,
    addressAs,
    role: role || 'guest',
    roleLabel: String(data?.roleLabel || '').trim()
      || (role === 'owner' ? 'オーナー' : 'ゲスト'),
    avatarUrl: String(data?.avatarUrl || ''),
    updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || data?.updatedAtIso || null,
  }
}

export function listGuestProfiles(accounts = chatAccountsCache) {
  return (accounts || [])
    .filter((account) => account.role === 'guest')
    .map((account) => ({
      key: account.key,
      displayName: account.displayName,
      addressAs: account.addressAs,
      passKey: account.passKey,
      role: 'guest',
      roleLabel: account.roleLabel || 'ゲスト',
    }))
}

export function listOwnerProfiles(accounts = chatAccountsCache) {
  return (accounts || [])
    .filter((account) => account.role === 'owner')
    .map((account) => ({
      key: account.key,
      displayName: account.displayName,
      addressAs: account.addressAs,
      passKey: account.passKey,
      role: 'owner',
      roleLabel: account.roleLabel || 'オーナー',
    }))
}

export function findChatAccountByPassKey(passKey, accounts = chatAccountsCache) {
  const needle = normalizeAccountKey(passKey)
  if (!needle) return null
  return (accounts || []).find((account) => (
    account.passKey === needle || account.key === needle
  )) || null
}

export function getGuestProfile(guestKey) {
  const key = normalizeAccountKey(guestKey)
  if (!key) return null
  const live = chatAccountsCache.find((account) => (
    account.role === 'guest' && (account.key === key || account.passKey === key)
  ))
  if (live) {
    return {
      key: live.key,
      displayName: live.displayName,
      addressAs: live.addressAs,
      passKey: live.passKey,
    }
  }
  return GUEST_PROFILES[key] || null
}

/**
 * Resolve who is logged in for topbar / chat.
 * @param {'owner'|'guest'} authRole
 * @param {string} guestKey pass key for guest, or owner pass key when role is owner
 */
export function resolveSessionProfile(authRole, guestKey = '') {
  if (authRole === 'owner') {
    const owner = findChatAccountByPassKey(guestKey)
      || listOwnerProfiles()[0]
      || accountFromDefault(DEFAULT_CHAT_ACCOUNTS.find((a) => a.role === 'owner'))
    return {
      id: owner.key,
      key: owner.key,
      displayName: owner.displayName,
      addressAs: owner.addressAs,
      role: 'owner',
      roleLabel: owner.roleLabel || 'オーナー',
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

const AVATAR_PALETTE = ['#c45c4a', '#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777']

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
  const account = serializeChatAccount(id, data)
  return {
    id: account.id,
    key: account.key,
    displayName: account.displayName,
    addressAs: account.addressAs,
    role: data?.role === 'owner' || data?.role === 'guest' ? account.role : '',
    passKey: account.passKey,
    roleLabel: account.roleLabel,
    avatarUrl: account.avatarUrl,
    status: normalizeChatPresenceMode(data?.status),
    updatedAt: account.updatedAt,
  }
}

/** Seed built-in guest/owner accounts into chatProfiles if missing. */
export async function ensureDefaultChatAccounts() {
  await Promise.all(DEFAULT_CHAT_ACCOUNTS.map(async (def) => {
    const ref = doc(db, CHAT_PROFILES_COLLECTION, def.key)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data() || {}
      if (data.role === 'guest' || data.role === 'owner') return
      await setDoc(ref, {
        role: def.role,
        roleLabel: def.roleLabel,
        passKey: def.passKey || def.key,
        displayName: data.displayName || def.displayName,
        addressAs: data.addressAs || def.addressAs,
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      }, { merge: true })
      return
    }
    await setDoc(ref, {
      role: def.role,
      roleLabel: def.roleLabel,
      passKey: def.passKey || def.key,
      displayName: def.displayName,
      addressAs: def.addressAs,
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    }, { merge: true })
  }))
}

/**
 * Subscribe to all guest/owner chat accounts.
 * @returns {() => void}
 */
export function subscribeChatAccounts(onData, onError) {
  return onSnapshot(
    collection(db, CHAT_PROFILES_COLLECTION),
    (snap) => {
      const accounts = snap.docs
        .map((item) => serializeChatAccount(item.id, item.data()))
        .filter((account) => account.role === 'guest' || account.role === 'owner')
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
          return a.displayName.localeCompare(b.displayName, 'ja')
        })
      const next = accounts.length ? accounts : DEFAULT_CHAT_ACCOUNTS.map(accountFromDefault)
      setChatAccountsCache(next)
      onData?.(next)
    },
    (error) => onError?.(error),
  )
}

/**
 * Create or update a guest/owner account.
 * @param {{ key: string, passKey?: string, displayName: string, addressAs?: string, role: 'guest'|'owner', roleLabel?: string }} payload
 * @param {{ isNew?: boolean }} [options]
 */
export async function upsertChatAccount(payload, options = {}) {
  const key = normalizeAccountKey(payload?.key)
  if (!isValidAccountKey(key)) {
    throw new Error('IDは半角英数2〜24文字で入力してください。')
  }
  const role = payload?.role === 'owner' ? 'owner' : 'guest'
  const displayName = String(payload?.displayName || '').trim()
  if (!displayName) throw new Error('表示名を入力してください。')
  const addressAs = String(payload?.addressAs || displayName).trim() || displayName
  const passKey = normalizeAccountKey(payload?.passKey || key)
  if (!isValidAccountKey(passKey)) {
    throw new Error('パスワードは半角英数2〜24文字で入力してください。')
  }
  const roleLabel = String(payload?.roleLabel || '').trim()
    || (role === 'owner' ? 'オーナー' : 'ゲスト')

  const ref = doc(db, CHAT_PROFILES_COLLECTION, key)
  const existing = await getDoc(ref)
  if (options.isNew && existing.exists() && (existing.data()?.role === 'guest' || existing.data()?.role === 'owner')) {
    throw new Error('そのIDはすでに使われています。')
  }

  // Unique passKey across accounts.
  const clash = chatAccountsCache.find((account) => (
    account.key !== key && (account.passKey === passKey || account.key === passKey)
  ))
  if (clash) {
    throw new Error('そのパスワードは別のユーザーが使っています。')
  }

  const nowIso = new Date().toISOString()
  await setDoc(ref, {
    role,
    roleLabel,
    passKey,
    displayName,
    addressAs,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })

  return serializeChatAccount(key, {
    role,
    roleLabel,
    passKey,
    displayName,
    addressAs,
    avatarUrl: existing.exists() ? existing.data()?.avatarUrl : '',
    updatedAtIso: nowIso,
  })
}

/**
 * Delete a guest/owner account. Optionally clear their chat thread.
 * @param {string} accountKey
 * @param {{ clearHistory?: boolean }} [options]
 */
export async function deleteChatAccount(accountKey, options = {}) {
  const key = normalizeAccountKey(accountKey)
  if (!key) throw new Error('ユーザーIDがありません。')
  const account = chatAccountsCache.find((item) => item.key === key)
    || serializeChatAccount(key, (await getDoc(doc(db, CHAT_PROFILES_COLLECTION, key))).data() || {})
  if (account.role === 'owner') {
    const owners = listOwnerProfiles().filter((item) => item.key !== key)
    if (owners.length === 0) {
      throw new Error('最後のオーナーは削除できません。')
    }
  }
  await deleteDoc(doc(db, CHAT_PROFILES_COLLECTION, key))
  if (options.clearHistory && account.role === 'guest') {
    try {
      await clearChatThreadHistory(`guest-${key}`, { deleteThread: true })
    } catch {
      /* thread may not exist */
    }
  }
  return true
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

/**
 * Compress and upload a chat image to Storage; returns the download URL.
 * @param {string} threadId
 * @param {File|Blob} file
 */
export async function uploadChatImage(threadId, file) {
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('画像ファイルを選んでください。')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('画像は8MB以下にしてください。')
  }

  const blob = await resizeImageToJpegBlob(file, 1600)
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const objectRef = storageRef(storage, `chat-images/${tid}/${stamp}.jpg`)
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' })
  return getDownloadURL(objectRef)
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

/** Default quick-tap reaction (flower). */
export const CHAT_DEFAULT_REACTION = '🌸'

/** Fixed emoji set for per-message reactions (Hana ↔ guest). */
export const CHAT_REACTION_EMOJIS = ['🌸', '❤️', '👍', '😂', '😮', '😢', '✨', '🎉']

/**
 * Normalize reactions to { emoji: { reactorId: count } }.
 * Supports:
 * - array form [{ emoji, reactorId, count }]
 * - legacy map { emoji: { rid: count } }
 * - legacy map { emoji: [rid, rid] }
 */
function normalizeChatReactions(raw) {
  const out = {}

  const add = (emoji, rid, count = 1) => {
    const key = String(emoji || '').trim()
    const id = String(rid || '').trim().toLowerCase()
    const n = Math.min(99, Math.max(0, Number(count) || 0))
    if (!key || key.length > 8 || !id || n <= 0) return
    if (!out[key]) out[key] = {}
    out[key][id] = Math.min(99, (out[key][id] || 0) + n)
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') continue
      add(item?.emoji, item?.reactorId, item?.count ?? 1)
    }
    return out
  }

  if (!raw || typeof raw !== 'object') return out

  for (const [emoji, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const id of value) add(emoji, id, 1)
    } else if (value && typeof value === 'object') {
      for (const [id, n] of Object.entries(value)) {
        add(emoji, id, typeof n === 'number' ? n : (n ? 1 : 0))
      }
    }
  }
  return out
}

/** Firestore-safe array payload (avoid emoji map keys). */
function reactionsToFirestore(normalized) {
  const list = []
  for (const [emoji, counts] of Object.entries(normalized || {})) {
    for (const [reactorId, count] of Object.entries(counts || {})) {
      const n = Math.min(99, Math.max(0, Number(count) || 0))
      if (!emoji || !reactorId || n <= 0) continue
      list.push({ emoji: String(emoji), reactorId: String(reactorId), count: n })
    }
  }
  return list
}

export function reactionTotal(counts) {
  if (!counts) return 0
  if (Array.isArray(counts)) return counts.length
  return Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
}

export function reactionMine(counts, reactorId) {
  const rid = String(reactorId || '').trim().toLowerCase()
  if (!rid || !counts) return 0
  if (Array.isArray(counts)) return counts.filter((id) => id === rid).length
  return Number(counts[rid]) || 0
}

/**
 * Hana sticker id carried alongside the text. Kept as a loose slug check so
 * this module stays decoupled from the sticker artwork; unknown ids simply fall
 * back to rendering the message text.
 */
export function normalizeChatSticker(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!id || id.length > 32) return ''
  return /^[a-z0-9_-]+$/.test(id) ? id : ''
}

/**
 * Standalone special-effect message id (flower / party / emotion moment).
 * Same loose slug check as stickers — the UI maps known ids to big icons.
 */
export function normalizeChatEffect(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!id || id.length > 32) return ''
  return /^[a-z0-9_-]+$/.test(id) ? id : ''
}

/** HTTPS download URL for a chat image message (Firebase Storage). */
export function normalizeChatImageUrl(value) {
  const url = String(value || '').trim()
  if (!url || url.length > 2048) return ''
  if (!/^https:\/\//i.test(url)) return ''
  return url
}

function serializeChatMessage(id, data) {
  const deleted = Boolean(data?.deleted)
  return {
    id,
    text: deleted ? '（削除されたメッセージ）' : String(data?.text || ''),
    rawText: String(data?.text || ''),
    sticker: deleted ? '' : normalizeChatSticker(data?.sticker),
    effect: deleted ? '' : normalizeChatEffect(data?.effect),
    effectEmoji: deleted ? '' : String(data?.effectEmoji || '').slice(0, 8),
    imageUrl: deleted ? '' : normalizeChatImageUrl(data?.imageUrl),
    sender: data?.sender === 'hana' ? 'hana' : 'guest',
    createdAt: data?.createdAt?.toDate?.()?.toISOString?.() || data?.createdAtIso || null,
    editedAt: data?.editedAt?.toDate?.()?.toISOString?.() || data?.editedAtIso || null,
    deleted,
    reactions: normalizeChatReactions(data?.reactions),
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
    guestTypingAt: data?.guestTypingAt?.toDate?.()?.toISOString?.() || data?.guestTypingAtIso || null,
    hanaTypingAt: data?.hanaTypingAt?.toDate?.()?.toISOString?.() || data?.hanaTypingAtIso || null,
    guestStatus: normalizeChatPresenceMode(data?.guestStatus),
    hanaStatus: normalizeChatPresenceMode(data?.hanaStatus),
    lastEffect: serializeChatEffect(data?.lastEffect),
  }
}

const PRESENCE_ONLINE_MS = 45_000

/** Manual presence modes (online/offline still come from heartbeat). */
export const CHAT_PRESENCE_MODES = [
  { id: 'auto', label: 'オンライン', emoji: '🟢' },
  { id: 'busy', label: '取り込み中', emoji: '🔴' },
  { id: 'away', label: '外出中', emoji: '🟡' },
]

export function normalizeChatPresenceMode(value) {
  const mode = String(value || 'auto').trim().toLowerCase()
  if (mode === 'busy' || mode === 'away') return mode
  return 'auto'
}

/** True if last heartbeat is recent enough to count as online. */
export function isPresenceOnline(iso, now = Date.now()) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return now - t <= PRESENCE_ONLINE_MS
}

/**
 * Resolve display presence from heartbeat + optional manual mode.
 * @param {{ onlineAt?: string|null, status?: string|null }} input
 * @param {number} [now]
 */
export function resolveChatPresence(input = {}, now = Date.now()) {
  const online = isPresenceOnline(input.onlineAt, now)
  const mode = normalizeChatPresenceMode(input.status)
  if (!online) {
    return { id: 'offline', mode, label: 'オフライン', className: 'is-offline', online: false }
  }
  if (mode === 'busy') {
    return { id: 'busy', mode, label: '取り込み中', className: 'is-busy', online: true }
  }
  if (mode === 'away') {
    return { id: 'away', mode, label: '外出中', className: 'is-away', online: true }
  }
  return { id: 'online', mode: 'auto', label: 'オンライン', className: 'is-online', online: true }
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

/**
 * Ephemeral typing heartbeat. It deliberately does not touch `updatedAt`, so
 * typing never reorders the inbox or changes unread-message state.
 */
export async function setChatTyping(threadId, role, typing = true) {
  if (!threadId || (role !== 'guest' && role !== 'hana')) return
  const nowIso = new Date().toISOString()
  const patch = role === 'hana'
    ? {
        hanaTypingAt: typing ? serverTimestamp() : null,
        hanaTypingAtIso: typing ? nowIso : null,
      }
    : {
        guestTypingAt: typing ? serverTimestamp() : null,
        guestTypingAtIso: typing ? nowIso : null,
      }
  await setDoc(doc(db, CHAT_THREADS_COLLECTION, threadId), patch, { merge: true })
}

/**
 * Set manual presence mode for a role on a thread.
 * @param {string} threadId
 * @param {'guest'|'hana'} role
 * @param {'auto'|'busy'|'away'} status
 */
export async function setChatPresenceStatus(threadId, role, status) {
  if (!threadId || (role !== 'guest' && role !== 'hana')) return
  const mode = normalizeChatPresenceMode(status)
  const patch = role === 'hana'
    ? { hanaStatus: mode }
    : { guestStatus: mode }
  await setDoc(doc(db, CHAT_THREADS_COLLECTION, threadId), patch, { merge: true })
}

/**
 * Manual status lives on the profile so it is the same everywhere (main page + chat)
 * instead of being set per conversation.
 * @param {string} profileId
 * @param {'auto'|'busy'|'away'} status
 */
export async function setChatProfileStatus(profileId, status) {
  const id = String(profileId || '').trim().toLowerCase()
  if (!id) return
  await setDoc(
    doc(db, CHAT_PROFILES_COLLECTION, id),
    {
      status: normalizeChatPresenceMode(status),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true },
  )
}

/**
 * Broadcast a reaction / special effect so the other side plays the same animation.
 * Stored on the thread doc (both roles already subscribe to it).
 * @param {{
 *   threadId: string,
 *   kind: 'flower'|'party'|'moment',
 *   by: 'guest'|'hana',
 *   emoji?: string,
 *   momentId?: string,
 * }} payload
 */
export async function broadcastChatEffect({ threadId, kind, by, emoji, momentId } = {}) {
  if (!threadId) return
  const type = kind === 'party' || kind === 'moment' ? kind : 'flower'
  const role = by === 'hana' ? 'hana' : 'guest'
  await setDoc(
    doc(db, CHAT_THREADS_COLLECTION, threadId),
    {
      lastEffect: {
        nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        kind: type,
        by: role,
        emoji: String(emoji || '').slice(0, 8),
        momentId: String(momentId || '').slice(0, 32),
        atIso: new Date().toISOString(),
      },
    },
    { merge: true },
  )
}

function serializeChatEffect(raw) {
  const nonce = String(raw?.nonce || '').trim()
  if (!nonce) return null
  const atIso = String(raw?.atIso || '')
  return {
    nonce,
    kind: raw?.kind === 'party' || raw?.kind === 'moment' ? raw.kind : 'flower',
    by: raw?.by === 'hana' ? 'hana' : 'guest',
    emoji: String(raw?.emoji || ''),
    momentId: String(raw?.momentId || ''),
    atIso,
    atMs: atIso ? new Date(atIso).getTime() : 0,
  }
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
async function hashPushToken(token) {
  const raw = String(token || '')
  if (!raw) return ''
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    let hash = 0
    for (let i = 0; i < raw.length; i += 1) {
      hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0
    }
    return `f_${(hash >>> 0).toString(36)}_${raw.length}`
  }
}

/**
 * Register/update an FCM device token for a chat account key (e.g. zen, hana).
 * Used by the Capacitor shell; safe no-op if token/user missing.
 */
export async function savePushToken({ userKey, token, platform } = {}) {
  const key = normalizeAccountKey(userKey)
  const value = String(token || '').trim()
  if (!key || !value) return null
  const id = await hashPushToken(value)
  if (!id) return null
  const payload = {
    userKey: key,
    token: value,
    platform: String(platform || 'unknown').slice(0, 32),
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
  }
  await setDoc(doc(db, PUSH_TOKENS_COLLECTION, id), payload, { merge: true })
  return id
}

export async function sendChatMessage({ threadId, text, sender, guestLabel, guestKey, replyTo, sticker, effect, effectEmoji, imageUrl }) {
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

  const stickerId = normalizeChatSticker(sticker)
  const effectId = normalizeChatEffect(effect)
  const emoji = String(effectEmoji || '').slice(0, 8)
  const image = normalizeChatImageUrl(imageUrl)
  const payload = {
    text: trimmed,
    sender: role,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    deleted: false,
    ...(stickerId ? { sticker: stickerId } : {}),
    ...(effectId ? { effect: effectId } : {}),
    ...(effectId && emoji ? { effectEmoji: emoji } : {}),
    ...(image ? { imageUrl: image } : {}),
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

/**
 * Add / toggle / increment an emoji reaction on a chat message.
 * reactorId should be a stable profile key (`hana`, `hiro`, `zen`, `gabusan`, …).
 * @param {'toggle'|'increment'|'set'} [mode]
 */
export async function reactToChatMessage({
  threadId,
  messageId,
  emoji,
  reactorId,
  mode = 'toggle',
}) {
  const em = String(emoji || '').trim()
  const rid = String(reactorId || '').trim().toLowerCase()
  if (!threadId || !messageId || !em || !rid) return
  if (em.length > 8) return

  const messageRef = doc(db, CHAT_THREADS_COLLECTION, threadId, 'messages', messageId)
  const snap = await getDoc(messageRef)
  if (!snap.exists()) return

  const reactions = normalizeChatReactions(snap.data()?.reactions)
  const counts = { ...(reactions[em] || {}) }
  const mine = Number(counts[rid]) || 0

  if (mode === 'increment') {
    counts[rid] = Math.min(99, mine + 1)
  } else if (mode === 'set') {
    counts[rid] = 1
  } else {
    // toggle: clear all of mine, or set to 1
    if (mine > 0) delete counts[rid]
    else counts[rid] = 1
  }

  if (Object.keys(counts).length) reactions[em] = counts
  else delete reactions[em]

  await updateDoc(messageRef, { reactions: reactionsToFirestore(reactions) })
}

/** @deprecated Prefer reactToChatMessage — kept for call-site compatibility. */
export async function toggleChatReaction(args) {
  return reactToChatMessage({ ...args, mode: args?.mode || 'toggle' })
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

/**
 * Owner (real Hana) drafting help for guest threads.
 * @param {{ history?: { role: string, text: string }[], lastReply?: string, guestName?: string }} payload
 */
export async function suggestHanaChat(payload) {
  const callable = httpsCallable(functions, 'suggestHanaChat')
  const result = await callable({
    history: Array.isArray(payload?.history) ? payload.history.slice(-12) : [],
    lastReply: String(payload?.lastReply || '').trim().slice(0, 400),
    guestName: String(payload?.guestName || '').trim().slice(0, 40),
  })
  const data = result?.data || {}
  return {
    replies: Array.isArray(data.replies) ? data.replies.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3) : [],
    topics: Array.isArray(data.topics) ? data.topics.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2) : [],
    expressions: Array.isArray(data.expressions) ? data.expressions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3) : [],
    reason: data.reason || null,
  }
}

/**
 * Translate chat text via Cloud Function `translateHanaChat`.
 * @param {{ text: string, targetLang?: string }} payload
 */
export async function translateChatMessage(payload) {
  const callable = httpsCallable(functions, 'translateHanaChat')
  const result = await callable({
    text: String(payload?.text || '').trim().slice(0, 2000),
    targetLang: String(payload?.targetLang || 'ja').trim().toLowerCase() || 'ja',
  })
  const data = result?.data || {}
  return {
    translation: data.translation ? String(data.translation) : null,
    reason: data.reason || null,
  }
}

/**
 * Owner-only private assist for a guest message (never stored in Firestore).
 * @param {{ text: string, guestName?: string, history?: { role: string, text: string }[] }} payload
 */
export async function analyzeGuestMessageForOwner(payload) {
  const callable = httpsCallable(functions, 'analyzeGuestMessageForOwner')
  const result = await callable({
    text: String(payload?.text || '').trim().slice(0, 2000),
    guestName: String(payload?.guestName || '').trim().slice(0, 40),
    history: Array.isArray(payload?.history) ? payload.history.slice(-8) : [],
  })
  const data = result?.data || {}
  const replies = Array.isArray(data.replies)
    ? data.replies
      .map((item) => ({
        ja: String(item?.ja || '').trim(),
        vi: String(item?.vi || '').trim(),
      }))
      .filter((item) => item.ja)
      .slice(0, 3)
    : []
  return {
    translationVi: String(data.translationVi || '').trim(),
    readingHiragana: String(data.readingHiragana || '').trim(),
    replies,
    reason: data.reason || null,
  }
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

