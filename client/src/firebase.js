// Firebase initialization — Firestore + Auth (admin); no Storage
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
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'firebase/firestore'
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
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const MEDIA_COLLECTION = 'media-items'
const ACCESS_LOGS_COLLECTION = 'access-logs'
const SHARED_STATE_COLLECTION = 'shared-state'
const SHARED_PLAYLISTS_DOC = 'playlists'
const CHUNK_SIZE = 700_000
export const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCESS_LOG_SESSION_KEY = 'hana-mediabox-access-logged'

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

  return error?.message || 'アップロードに失敗しました。'
}

export function subscribeToAdminAuth(onChange) {
  return onAuthStateChanged(auth, (user) => {
    if (user && !isAdminEmailAllowed(user.email)) {
      signOut(auth).finally(() => onChange(null))
      return
    }
    onChange(user)
  })
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

export async function loadMediaBlobUrl(itemId, mimeType) {
  const itemSnap = await getDoc(doc(db, MEDIA_COLLECTION, itemId))
  if (!itemSnap.exists()) {
    throw new Error('メディアが見つかりません。')
  }

  const { chunkCount = 1 } = itemSnap.data()
  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const chunks = chunksSnap.docs
    .map((document) => document.data())
    .sort((a, b) => a.index - b.index)

  if (chunks.length === 0) {
    throw new Error('ファイルデータが見つかりません。')
  }

  const parts = chunks.slice(0, chunkCount).map((chunk) => base64ToUint8Array(chunk.data))
  const blob = new Blob(parts, { type: mimeType || 'application/octet-stream' })
  return URL.createObjectURL(blob)
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
  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const batch = writeBatch(db)

  chunksSnap.docs.forEach((document) => {
    batch.delete(document.ref)
  })
  batch.delete(doc(db, MEDIA_COLLECTION, itemId))

  await batch.commit()
}

export { analytics, app, auth, db }

