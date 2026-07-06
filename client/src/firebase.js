// Firebase initialization — Firestore only (no Storage needed)
import { getAnalytics } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'

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
const MEDIA_COLLECTION = 'media-items'
const CHUNK_SIZE = 700_000
export const MAX_FILE_SIZE = 10 * 1024 * 1024

function sortMediaItems(items) {
  return [...items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
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

  return error?.message || 'アップロードに失敗しました。'
}

export async function uploadMediaFile(file, metadata, onProgress) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const buffer = await file.arrayBuffer()
  const totalChunks = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE))

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, buffer.byteLength)
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

export async function deleteMediaItem(itemId) {
  const chunksSnap = await getDocs(collection(db, MEDIA_COLLECTION, itemId, 'chunks'))
  const batch = writeBatch(db)

  chunksSnap.docs.forEach((document) => {
    batch.delete(document.ref)
  })
  batch.delete(doc(db, MEDIA_COLLECTION, itemId))

  await batch.commit()
}

export { analytics, app, db }
