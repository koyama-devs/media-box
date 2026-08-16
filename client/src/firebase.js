// Firebase initialization — Firestore + Auth + Storage (large PDFs)
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
    where,
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
let analytics = null
try {
  /* analytics intentionally disabled to avoid hard crash if submodule missing */
} catch (e) {
  // ignore
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
const SHARED_PHOTO_ALBUMS_DOC = 'photo-albums'
const SHARED_SPACES_DOC = 'spaces'
const SHARED_CHAT_DOC = 'chat'
const SHARED_APPEARANCE_DOC = 'site-appearance'
/** Default edit/delete window after the partner has read the message. */
export const DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES = 5
/** Max minutes an admin can configure for the edit window. */
const MAX_MESSAGE_EDIT_WINDOW_MINUTES = 7 * 24 * 60
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

/** Owner session identity. Seed default (passKey starts as key). */
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
    avatarPresetId: '',
    allowedPlaylistIds: null,
    allowedAlbumIds: null,
    accountActive: true,
    lastAccessAt: null,
    idleDays: null,
    inactiveReason: null,
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

/**
 * null = every custom playlist (backward compatible default).
 * [] = no custom playlists (すべて / お気に入り only).
 * string[] = only those playlist ids.
 */
export function normalizeAllowedPlaylistIds(raw) {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  return [...new Set(
    raw.map((id) => String(id || '').trim()).filter(Boolean),
  )]
}

export function guestMayAccessPlaylist(account, playlistId) {
  if (!account || account.role === 'owner') return true
  const allowed = normalizeAllowedPlaylistIds(account.allowedPlaylistIds)
  if (allowed == null) return true
  return allowed.includes(String(playlistId || ''))
}

/**
 * Library-track ACL for 「すべて」 / お気に入り / today pick.
 * Restricted guests hide any track that belongs to a non-allowed playlist.
 * Tracks not in any custom playlist remain visible.
 */
export function guestMayAccessTrack(account, trackId, playlists = []) {
  if (!account || account.role === 'owner') return true
  const allowed = normalizeAllowedPlaylistIds(account.allowedPlaylistIds)
  if (allowed == null) return true
  const id = String(trackId || '')
  if (!id) return false
  const allowedSet = new Set(allowed)
  for (const playlist of playlists || []) {
    if (!(playlist?.trackIds || []).includes(id)) continue
    if (!allowedSet.has(playlist.id)) return false
  }
  return true
}

/**
 * null = every photo album (default).
 * [] = no albums.
 * string[] = only those album ids.
 */
export function normalizeAllowedAlbumIds(raw) {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  return [...new Set(
    raw.map((id) => String(id || '').trim()).filter(Boolean),
  )]
}

export function guestMayAccessAlbum(account, albumId) {
  if (!account || account.role === 'owner') return true
  const allowed = normalizeAllowedAlbumIds(account.allowedAlbumIds)
  if (allowed == null) return true
  return allowed.includes(String(albumId || ''))
}

/** Hide images that only live in non-allowed albums; unassigned stay visible. */
export function guestMayAccessImage(account, imageId, albums = []) {
  if (!account || account.role === 'owner') return true
  const allowed = normalizeAllowedAlbumIds(account.allowedAlbumIds)
  if (allowed == null) return true
  const id = String(imageId || '')
  if (!id) return false
  const allowedSet = new Set(allowed)
  for (const album of albums || []) {
    if (!(album?.imageIds || []).includes(id)) continue
    if (!allowedSet.has(album.id)) return false
  }
  return true
}

/** Default idle auto-inactivate threshold (days). Overridable in admin settings. */
export const DEFAULT_ACCOUNT_IDLE_DAYS = 5
/** Legacy constant — prefer resolveAccountIdleMs(..., settings). */
export const ACCOUNT_IDLE_MS = DEFAULT_ACCOUNT_IDLE_DAYS * 24 * 60 * 60 * 1000
/** Per-account / resolved policy: never auto-inactivate. */
export const ACCOUNT_IDLE_DAYS_NEVER = -1

/** Default owner account that cannot be inactivated. */
export const PROTECTED_OWNER_KEY = OWNER_PROFILE.key

/** Shown on the login gate whenever an account is inactive. */
export const ACCOUNT_INACTIVE_LOGIN_MESSAGE =
  '長期間利用がなかったため、システムがアカウントを停止しました。管理者に連絡して処理してもらってください。'

export function isProtectedOwnerAccount(key) {
  return normalizeAccountKey(key) === PROTECTED_OWNER_KEY
}

/**
 * Normalize idle-days policy.
 * - null → inherit global default (only for per-account field)
 * - -1 → never auto-inactivate
 * - > 0 → days
 */
export function normalizeAccountIdleDays(value, { allowNull = false } = {}) {
  if (value == null || value === '') {
    return allowNull ? null : DEFAULT_ACCOUNT_IDLE_DAYS
  }
  if (value === 'never' || value === '無限' || value === '無期限') return ACCOUNT_IDLE_DAYS_NEVER
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return allowNull ? null : DEFAULT_ACCOUNT_IDLE_DAYS
  if (n === ACCOUNT_IDLE_DAYS_NEVER) return ACCOUNT_IDLE_DAYS_NEVER
  if (n <= 0) return allowNull ? null : DEFAULT_ACCOUNT_IDLE_DAYS
  return Math.min(n, 3650)
}

export function normalizeGlobalAccountIdleDays(value) {
  const n = normalizeAccountIdleDays(value, { allowNull: false })
  if (n === ACCOUNT_IDLE_DAYS_NEVER) return ACCOUNT_IDLE_DAYS_NEVER
  return n > 0 ? n : DEFAULT_ACCOUNT_IDLE_DAYS
}

/** Effective idle threshold in ms, or null when never auto-inactivate. */
export function resolveAccountIdleMs(account, settings = {}) {
  if (!account || isProtectedOwnerAccount(account.key)) return null
  const globalDays = normalizeGlobalAccountIdleDays(settings?.accountIdleDays)
  const own = normalizeAccountIdleDays(account.idleDays, { allowNull: true })
  const days = own == null ? globalDays : own
  if (days === ACCOUNT_IDLE_DAYS_NEVER) return null
  if (!(days > 0)) return null
  return days * 24 * 60 * 60 * 1000
}

export function parseAccountAccessMs(account) {
  const raw = account?.lastAccessAt || account?.lastAccessAtIso || null
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

export function isAccountLoginAllowed(account) {
  if (!account) return false
  if (isProtectedOwnerAccount(account.key)) return true
  return account.accountActive !== false
}

export function isAccountIdlePastThreshold(account, nowMs = Date.now(), settings = {}) {
  if (!account || isProtectedOwnerAccount(account.key)) return false
  if (account.accountActive === false) return false
  const idleMs = resolveAccountIdleMs(account, settings)
  if (idleMs == null) return false
  const accessMs = parseAccountAccessMs(account)
  if (accessMs == null) return false
  return nowMs - accessMs >= idleMs
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
    avatarPresetId: String(data?.avatarPresetId || '').trim(),
    allowedPlaylistIds: data?.role === 'owner'
      ? null
      : normalizeAllowedPlaylistIds(
        Object.prototype.hasOwnProperty.call(data || {}, 'allowedPlaylistIds')
          ? data.allowedPlaylistIds
          : null,
      ),
    allowedAlbumIds: data?.role === 'owner'
      ? null
      : normalizeAllowedAlbumIds(
        Object.prototype.hasOwnProperty.call(data || {}, 'allowedAlbumIds')
          ? data.allowedAlbumIds
          : null,
      ),
    accountActive: data?.accountActive === false ? false : true,
    lastAccessAt: data?.lastAccessAt?.toDate?.()?.toISOString?.()
      || data?.lastAccessAtIso
      || null,
    /** null = inherit global; -1 = never; >0 = days override. */
    idleDays: normalizeAccountIdleDays(data?.idleDays, { allowNull: true }),
    inactiveReason: data?.inactiveReason === 'idle' || data?.inactiveReason === 'admin'
      ? data.inactiveReason
      : null,
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
      allowedPlaylistIds: normalizeAllowedPlaylistIds(account.allowedPlaylistIds),
      allowedAlbumIds: normalizeAllowedAlbumIds(account.allowedAlbumIds),
      accountActive: account.accountActive !== false,
      lastAccessAt: account.lastAccessAt || null,
      idleDays: normalizeAccountIdleDays(account.idleDays, { allowNull: true }),
      inactiveReason: account.inactiveReason || null,
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
      accountActive: account.accountActive !== false,
      lastAccessAt: account.lastAccessAt || null,
      idleDays: normalizeAccountIdleDays(account.idleDays, { allowNull: true }),
      inactiveReason: account.inactiveReason || null,
    }))
}

export function findChatAccountByPassKey(passKey, accounts = chatAccountsCache) {
  const needle = normalizeAccountKey(passKey)
  if (!needle) return null
  // Login must match passKey only — account.key is a stable id and must not
  // keep working after the password is changed in admin.
  return (accounts || []).find((account) => account.passKey === needle) || null
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
      role: 'guest',
      allowedPlaylistIds: normalizeAllowedPlaylistIds(
        Object.prototype.hasOwnProperty.call(live, 'allowedPlaylistIds')
          ? live.allowedPlaylistIds
          : null,
      ),
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
      allowedPlaylistIds: guest.allowedPlaylistIds ?? null,
    }
  }
  return {
    id: 'guest',
    key: 'guest',
    displayName: 'ゲスト',
    addressAs: 'ゲスト',
    role: 'guest',
    roleLabel: 'ゲスト',
    allowedPlaylistIds: null,
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
export function resolveAvatarSrc(profileId, displayName, customUrl = '', fallbackUrl = '', presetSrc = '') {
  const url = String(customUrl || getCachedAvatarUrl(profileId) || '').trim()
  if (url && !url.startsWith('preset:')) return url
  const preset = String(presetSrc || '').trim()
  if (preset) return preset
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
    avatarPresetId: account.avatarPresetId,
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
    const nowIso = new Date().toISOString()
    await setDoc(ref, {
      role: def.role,
      roleLabel: def.roleLabel,
      passKey: def.passKey || def.key,
      displayName: def.displayName,
      addressAs: def.addressAs,
      accountActive: true,
      lastAccessAt: serverTimestamp(),
      lastAccessAtIso: nowIso,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
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
 * @param {{ key: string, passKey?: string, displayName: string, addressAs?: string, role: 'guest'|'owner', roleLabel?: string, allowedPlaylistIds?: string[]|null }} payload
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
  const allowedPlaylistIds = role === 'owner'
    ? null
    : (Object.prototype.hasOwnProperty.call(payload || {}, 'allowedPlaylistIds')
      ? normalizeAllowedPlaylistIds(payload.allowedPlaylistIds)
      : (existing.exists()
        ? normalizeAllowedPlaylistIds(existing.data()?.allowedPlaylistIds)
        : null))
  const allowedAlbumIds = role === 'owner'
    ? null
    : (Object.prototype.hasOwnProperty.call(payload || {}, 'allowedAlbumIds')
      ? normalizeAllowedAlbumIds(payload.allowedAlbumIds)
      : (existing.exists()
        ? normalizeAllowedAlbumIds(existing.data()?.allowedAlbumIds)
        : null))

  await setDoc(ref, {
    role,
    roleLabel,
    passKey,
    displayName,
    addressAs,
    ...(role === 'guest' ? { allowedPlaylistIds, allowedAlbumIds } : {}),
    ...(options.isNew || !existing.exists()
      ? {
        accountActive: true,
        lastAccessAt: serverTimestamp(),
        lastAccessAtIso: nowIso,
        inactiveReason: null,
      }
      : {}),
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })

  return serializeChatAccount(key, {
    role,
    roleLabel,
    passKey,
    displayName,
    addressAs,
    allowedPlaylistIds,
    allowedAlbumIds,
    avatarUrl: existing.exists() ? existing.data()?.avatarUrl : '',
    avatarPresetId: existing.exists() ? existing.data()?.avatarPresetId : '',
    updatedAtIso: nowIso,
  })
}

/** Update only a guest's playlist access list (admin matrix). */
export async function touchAccountAccess(accountKey) {
  const key = normalizeAccountKey(accountKey)
  if (!key) return null
  const nowIso = new Date().toISOString()
  await setDoc(doc(db, CHAT_PROFILES_COLLECTION, key), {
    lastAccessAt: serverTimestamp(),
    lastAccessAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })
  return nowIso
}

/**
 * Admin (or idle enforcer) toggle. Protected owner "hana" cannot be inactivated.
 * Reactivating refreshes lastAccessAt so the idle timer restarts.
 */
export async function setAccountActiveState(accountKey, active, options = {}) {
  const key = normalizeAccountKey(accountKey)
  if (!isValidAccountKey(key)) throw new Error('ユーザーが見つかりません。')
  if (isProtectedOwnerAccount(key) && !active) {
    throw new Error('デフォルトオーナー「hana」は停止できません。')
  }
  const nowIso = new Date().toISOString()
  const by = options.by === 'idle' ? 'idle' : 'admin'
  if (active) {
    await setDoc(doc(db, CHAT_PROFILES_COLLECTION, key), {
      accountActive: true,
      inactiveReason: null,
      lastAccessAt: serverTimestamp(),
      lastAccessAtIso: nowIso,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    }, { merge: true })
  } else {
    await setDoc(doc(db, CHAT_PROFILES_COLLECTION, key), {
      accountActive: false,
      inactiveReason: by,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    }, { merge: true })
  }
  return serializeChatAccount(key, {
    ...(chatAccountsCache.find((item) => item.key === key) || {}),
    accountActive: active,
    inactiveReason: active ? null : by,
    lastAccessAt: active ? nowIso : (chatAccountsCache.find((item) => item.key === key)?.lastAccessAt || null),
  })
}

/**
 * Stamp missing lastAccessAt, or auto-inactivate idle accounts.
 * Safe to call often (idempotent).
 * @param {object[]} [accounts]
 * @param {{ accountIdleDays?: number }} [settings]
 */
export async function syncIdleAccountStatuses(accounts = chatAccountsCache, settings = {}) {
  const now = Date.now()
  const jobs = []
  for (const account of accounts || []) {
    if (!account?.key || isProtectedOwnerAccount(account.key)) continue
    if (account.accountActive === false) continue
    const accessMs = parseAccountAccessMs(account)
    if (accessMs == null) {
      jobs.push(touchAccountAccess(account.key))
      continue
    }
    if (isAccountIdlePastThreshold(account, now, settings)) {
      jobs.push(setAccountActiveState(account.key, false, { by: 'idle' }))
    }
  }
  if (jobs.length) await Promise.allSettled(jobs)
}

/**
 * Login gate helper: may auto-inactivate then report whether login is allowed.
 * @returns {Promise<{ ok: true, account } | { ok: false, reason: 'inactive'|'missing' }>}
 */
export async function evaluateAccountLogin(account, settings = {}) {
  if (!account) return { ok: false, reason: 'missing' }
  if (isProtectedOwnerAccount(account.key)) return { ok: true, account }
  if (account.accountActive === false) return { ok: false, reason: 'inactive' }
  if (isAccountIdlePastThreshold(account, Date.now(), settings)) {
    await setAccountActiveState(account.key, false, { by: 'idle' })
    return { ok: false, reason: 'inactive' }
  }
  return { ok: true, account }
}

/** Admin: set per-account idle policy (null=inherit, -1=never, >0=days). */
export async function setAccountIdleDays(accountKey, idleDays) {
  const key = normalizeAccountKey(accountKey)
  if (!isValidAccountKey(key)) throw new Error('ユーザーが見つかりません。')
  const next = normalizeAccountIdleDays(idleDays, { allowNull: true })
  const nowIso = new Date().toISOString()
  await setDoc(doc(db, CHAT_PROFILES_COLLECTION, key), {
    idleDays: next,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })
  return serializeChatAccount(key, {
    ...(chatAccountsCache.find((item) => item.key === key) || {}),
    idleDays: next,
    updatedAt: nowIso,
  })
}

export async function setGuestPlaylistAccess(guestKey, playlistIds) {
  const key = normalizeAccountKey(guestKey)
  if (!isValidAccountKey(key)) throw new Error('ゲストIDが不正です。')
  const ref = doc(db, CHAT_PROFILES_COLLECTION, key)
  const snap = await getDoc(ref)
  if (!snap.exists() || snap.data()?.role !== 'guest') {
    throw new Error('ゲストが見つかりません。')
  }
  const allowedPlaylistIds = normalizeAllowedPlaylistIds(playlistIds)
  const nowIso = new Date().toISOString()
  await setDoc(ref, {
    allowedPlaylistIds,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })
  return serializeChatAccount(key, {
    ...snap.data(),
    allowedPlaylistIds,
    updatedAtIso: nowIso,
  })
}

export async function setGuestAlbumAccess(guestKey, albumIds) {
  const key = normalizeAccountKey(guestKey)
  if (!isValidAccountKey(key)) throw new Error('ゲストIDが不正です。')
  const ref = doc(db, CHAT_PROFILES_COLLECTION, key)
  const snap = await getDoc(ref)
  if (!snap.exists() || snap.data()?.role !== 'guest') {
    throw new Error('ゲストが見つかりません。')
  }
  const allowedAlbumIds = normalizeAllowedAlbumIds(albumIds)
  const nowIso = new Date().toISOString()
  await setDoc(ref, {
    allowedAlbumIds,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }, { merge: true })
  return serializeChatAccount(key, {
    ...snap.data(),
    allowedAlbumIds,
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
      avatarPresetId: '',
      ...(displayName ? { displayName } : {}),
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
  setCachedAvatarUrl(id, avatarUrl)
  return avatarUrl
}

/** Pick a built-in character avatar; clears uploaded avatarUrl. */
export async function setUserAvatarPreset(profileId, presetId) {
  const id = String(profileId || '').trim().toLowerCase()
  if (!id) throw new Error('プロフィールIDがありません。')
  const preset = String(presetId || '').trim()
  const nowIso = new Date().toISOString()
  await setDoc(
    doc(db, CHAT_PROFILES_COLLECTION, id),
    {
      avatarPresetId: preset,
      avatarUrl: '',
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
  setCachedAvatarUrl(id, '')
  return preset
}

/** Clear custom avatar + preset → back to initials. */
export async function clearUserAvatar(profileId) {
  const id = String(profileId || '').trim().toLowerCase()
  if (!id) throw new Error('プロフィールIDがありません。')
  const nowIso = new Date().toISOString()
  await setDoc(
    doc(db, CHAT_PROFILES_COLLECTION, id),
    {
      avatarUrl: '',
      avatarPresetId: '',
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )
  setCachedAvatarUrl(id, '')
}

export const CHAT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Phone camera clips often exceed 50MB; Storage rules do not cap this path. */
export const CHAT_MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024

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
  if (file.size > CHAT_MAX_IMAGE_BYTES) {
    throw new Error('画像は8MB以下にしてください。')
  }

  const blob = await resizeImageToJpegBlob(file, 1600)
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const objectRef = storageRef(storage, `chat-images/${tid}/${stamp}.jpg`)
  await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' })
  return getDownloadURL(objectRef)
}

export function classifyChatAttachment(fileOrMime) {
  const mime = String(
    typeof fileOrMime === 'string' ? fileOrMime : fileOrMime?.type || '',
  ).trim().toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'file'
  // Some Android pickers omit mime — fall back to extension.
  if (typeof fileOrMime !== 'string') {
    const name = String(fileOrMime?.name || '').toLowerCase()
    if (/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name)) return 'image'
    if (/\.(mp4|mov|webm|m4v|3gp|mkv)$/i.test(name)) return 'video'
    if (/\.(mp3|m4a|aac|wav|ogg|flac|opus|oga|caf|webm)$/i.test(name)) return 'file'
  }
  return 'file'
}

/** True when a chat attachment should render an inline audio player. */
export function normalizeVoiceSkin(value) {
  const id = String(value || '').trim().toLowerCase()
  if (id === 'sakura' || id === 'yozora' || id === 'tegami' || id === 'umi') return id
  return ''
}

export function isChatAudioAttachment(fileMime = '', fileName = '') {
  const mime = String(fileMime || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  return /\.(mp3|m4a|aac|wav|ogg|flac|opus|oga|caf|webm)$/i.test(String(fileName || ''))
}

export function formatChatFileSize(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function sanitizeChatUploadFileName(name = 'file') {
  const base = String(name).split(/[/\\]/).pop() || 'file'
  return base.replace(/[^\w.\-()\u3040-\u30ff\u3400-\u9fff]+/g, '_').slice(0, 120) || 'file'
}

/**
 * Upload an image, video, or arbitrary file for chat.
 * Images are still JPEG-compressed; video/files are stored as-is under chat-files/.
 */
export async function uploadChatAttachment(threadId, file) {
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  if (!file) throw new Error('ファイルを選んでください。')

  const kind = classifyChatAttachment(file)
  const fileName = sanitizeChatUploadFileName(file.name || (kind === 'video' ? 'video' : 'file'))
  const fileMime = String(file.type || 'application/octet-stream')
  const fileSize = Math.max(0, Number(file.size) || 0)

  if (kind === 'image') {
    if (fileSize > CHAT_MAX_IMAGE_BYTES) throw new Error('画像は8MB以下にしてください。')
    const url = await uploadChatImage(tid, file)
    return {
      url,
      kind: 'image',
      fileName: `${fileName.replace(/\.[^.]+$/, '') || 'image'}.jpg`,
      fileMime: 'image/jpeg',
      fileSize,
    }
  }

  if (kind === 'video' && fileSize > CHAT_MAX_VIDEO_BYTES) {
    throw new Error(`動画は${formatChatFileSize(CHAT_MAX_VIDEO_BYTES)}以下にしてください。`)
  }
  if (kind === 'file' && fileSize > CHAT_MAX_FILE_BYTES) {
    throw new Error('ファイルは25MB以下にしてください。')
  }

  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const objectRef = storageRef(storage, `chat-files/${tid}/${stamp}_${fileName}`)
  const contentType = fileMime && fileMime !== 'application/octet-stream'
    ? fileMime
    : (kind === 'video' ? 'video/mp4' : fileMime)
  await uploadBytes(objectRef, file, { contentType })
  const url = await getDownloadURL(objectRef)
  return { url, kind, fileName, fileMime: contentType, fileSize }
}

/** Resolve a friendly guest display name from thread id / guestKey / stored label. */
export function resolveGuestDisplayName({ threadId, guestKey, guestLabel } = {}) {
  const fromKey = getGuestProfile(guestKey)
  if (fromKey) return fromKey.displayName
  const id = String(threadId || '')
  const keyFromId = (id.match(/^guest-([a-z0-9_-]+)$/i) || [])[1] || ''
  const fromThreadId = getGuestProfile(keyFromId)
  if (fromThreadId) return fromThreadId.displayName
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
  const known = raw.match(/^guest-([a-z0-9_-]+)$/i)
  if (known) {
    const profile = getGuestProfile(known[1])
    if (profile) return profile.displayName
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

/** HTTPS download URL for a chat image/file message (Firebase Storage). */
export function normalizeChatImageUrl(value) {
  const url = String(value || '').trim()
  if (!url || url.length > 2048) return ''
  // Firestore / Storage only — never persist blob: or data: URLs.
  if (!/^https:\/\//i.test(url)) return ''
  return url
}

/** URLs safe to show in the chat UI (includes optimistic local blob previews). */
export function normalizeChatDisplayMediaUrl(value) {
  const url = String(value || '').trim()
  if (!url || url.length > 2048) return ''
  if (/^https:\/\//i.test(url)) return url
  if (/^blob:/i.test(url)) return url
  return ''
}

export function normalizeChatFileName(value) {
  return String(value || '').trim().slice(0, 180)
}

export function normalizeChatFileMime(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120)
}

export function normalizeChatFileKind(value, mime = '') {
  const kind = String(value || '').trim().toLowerCase()
  if (kind === 'image' || kind === 'video' || kind === 'file') return kind
  return classifyChatAttachment(mime)
}

function normalizeChatAttachmentRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  const url = normalizeChatDisplayMediaUrl(raw.url || raw.fileUrl || raw.imageUrl)
  if (!url) return null
  const fileMime = normalizeChatFileMime(raw.fileMime)
  const kind = normalizeChatFileKind(raw.kind || raw.fileKind, fileMime || (raw.imageUrl ? 'image/' : ''))
  return {
    url,
    kind,
    fileName: normalizeChatFileName(raw.fileName) || (kind === 'image' ? '写真' : kind === 'video' ? '動画' : 'ファイル'),
    fileMime,
    fileSize: Math.max(0, Number(raw.fileSize) || 0),
    voiceSkin: normalizeVoiceSkin(raw.voiceSkin),
  }
}

function normalizeChatAttachments(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value.slice(0, 12)) {
    const rec = normalizeChatAttachmentRecord(item)
    if (rec) out.push(rec)
  }
  return out
}

/** Resolve display attachment from a serialized chat message (legacy imageUrl supported). */
export function getChatMessageAttachment(message) {
  const all = getChatMessageAttachments(message)
  return all[0] || null
}

/** All media on a chat message (caption + several files in one bubble). */
export function getChatMessageAttachments(message) {
  if (!message || message.deleted) return []
  const listed = normalizeChatAttachments(message.attachments)
  if (listed.length) return listed
  // Prefer blob: local previews while uploading so the bubble is not blank.
  const fileUrl = normalizeChatDisplayMediaUrl(message.fileUrl)
  const imageUrl = normalizeChatDisplayMediaUrl(message.imageUrl)
  const url = fileUrl || imageUrl
  if (!url) return []
  const fileMime = normalizeChatFileMime(message.fileMime) || (imageUrl && !fileUrl ? 'image/*' : '')
  const kind = normalizeChatFileKind(message.fileKind, fileMime || (imageUrl ? 'image/' : ''))
  return [{
    url,
    kind,
    fileName: normalizeChatFileName(message.fileName) || (kind === 'image' ? '写真' : kind === 'video' ? '動画' : 'ファイル'),
    fileMime,
    fileSize: Math.max(0, Number(message.fileSize) || 0),
    voiceSkin: normalizeVoiceSkin(message.voiceSkin),
  }]
}

function serializeChatMessage(id, data) {
  const deleted = Boolean(data?.deleted)
  const imageUrl = deleted ? '' : normalizeChatImageUrl(data?.imageUrl)
  const fileUrl = deleted ? '' : normalizeChatImageUrl(data?.fileUrl)
  const fileMime = deleted ? '' : normalizeChatFileMime(data?.fileMime)
  const fileKind = deleted ? '' : normalizeChatFileKind(data?.fileKind, fileMime || (imageUrl ? 'image/' : ''))
  return {
    id,
    text: deleted ? '（削除されたメッセージ）' : String(data?.text || ''),
    rawText: String(data?.text || ''),
    sticker: deleted ? '' : normalizeChatSticker(data?.sticker),
    effect: deleted ? '' : normalizeChatEffect(data?.effect),
    effectEmoji: deleted ? '' : String(data?.effectEmoji || '').slice(0, 8),
    imageUrl,
    fileUrl,
    fileName: deleted ? '' : normalizeChatFileName(data?.fileName),
    fileMime,
    fileKind: deleted ? '' : fileKind,
    fileSize: deleted ? 0 : Math.max(0, Number(data?.fileSize) || 0),
    attachments: deleted ? [] : normalizeChatAttachments(data?.attachments),
    voiceSkin: deleted ? '' : normalizeVoiceSkin(data?.voiceSkin),
    sender: data?.sender === 'hana' ? 'hana' : 'guest',
    createdAt: data?.createdAt?.toDate?.()?.toISOString?.() || data?.createdAtIso || null,
    createdAtIso: data?.createdAtIso ? String(data.createdAtIso) : null,
    clientId: data?.clientId ? String(data.clientId).slice(0, 64) : null,
    editedAt: data?.editedAt?.toDate?.()?.toISOString?.() || data?.editedAtIso || null,
    deleted,
    reactions: normalizeChatReactions(data?.reactions),
    kind: data?.kind === 'call-log' ? 'call-log' : (data?.kind ? String(data.kind) : ''),
    callLog: data?.callLog && typeof data.callLog === 'object'
      ? {
          callId: String(data.callLog.callId || ''),
          status: String(data.callLog.status || ''),
          durationSec: Math.max(0, Number(data.callLog.durationSec) || 0),
          callerRole: data.callLog.callerRole === 'hana' ? 'hana' : 'guest',
          endedBy: data.callLog.endedBy === 'hana' || data.callLog.endedBy === 'guest' ? data.callLog.endedBy : '',
          answeredAtIso: data.callLog.answeredAtIso ? String(data.callLog.answeredAtIso) : null,
        }
      : null,
    replyTo: data?.replyToId
      ? {
          id: String(data.replyToId),
          text: String(data.replyToText || ''),
          sender: data.replyToSender === 'hana' ? 'hana' : data.replyToSender === 'hanachan' ? 'hanachan' : 'guest',
        }
      : null,
  }
}

/** Stable chronological sort for chat bubbles (avoids Firestore auto-id reordering). */
export function sortChatMessages(rows = []) {
  return [...rows].sort((a, b) => {
    // Prefer createdAtIso (client clock at send): serverTimestamp can resolve out of
    // order when messages are sent in quick succession, which flips bubble order.
    const ta = Date.parse(a?.createdAtIso || a?.createdAt || '') || 0
    const tb = Date.parse(b?.createdAtIso || b?.createdAt || '') || 0
    if (ta !== tb) return ta - tb
    const ca = String(a?.clientId || '')
    const cb = String(b?.clientId || '')
    if (ca && cb && ca !== cb) return ca.localeCompare(cb)
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

function serializeChatThread(id, data) {
  const guestKey = data?.guestKey || (String(id).match(/^guest-(.+)$/) || [])[1] || ''
  const lastText = String(data?.lastText || '')
  return {
    id,
    guestKey,
    guestLabel: resolveGuestDisplayName({
      threadId: id,
      guestKey,
      guestLabel: data?.guestLabel,
    }),
    lastText: lastText === '（削除されたメッセージ）' ? '' : lastText,
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
    jpTripArrivedAtIso: data?.jpTripArrivedAtIso
      || data?.jpTripArrivedAt?.toDate?.()?.toISOString?.()
      || null,
    weightGarden: serializeWeightGarden(data?.weightGarden),
    pokeZukan: serializePokeZukan(data?.pokeZukan),
    pinnedMessages: serializeThreadPinnedMessages(data?.pinnedMessages),
  }
}

const THREAD_PIN_LIMIT = 20

export function serializeThreadPinnedMessages(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const messageId = String(entry.messageId || entry.id || '').trim()
    if (!messageId || seen.has(messageId)) continue
    seen.add(messageId)
    out.push({
      messageId,
      text: String(entry.text || '').slice(0, 500),
      sender: String(entry.sender || entry.role || ''),
      createdAt: entry.createdAt || null,
      pinnedAt: entry.pinnedAt || null,
      pinnedBy: String(entry.pinnedBy || ''),
    })
    if (out.length >= THREAD_PIN_LIMIT) break
  }
  return out
}

/**
 * Shared thread pins — visible to both Hana and the guest on this thread.
 * @returns {Promise<{ pinned: boolean, list: Array }>}
 */
export async function toggleThreadChatPin({
  threadId,
  message,
  pinnedBy = '',
} = {}) {
  const tid = String(threadId || '').trim()
  const messageId = String(message?.serverId || message?.id || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  if (!messageId || messageId.startsWith('pending-')) {
    throw new Error('送信が終わるまでピン留めできません。')
  }

  const threadRef = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(threadRef)
  const list = serializeThreadPinnedMessages(snap.data()?.pinnedMessages)
  const existing = list.findIndex((entry) => entry.messageId === messageId)
  let next
  let pinned
  if (existing >= 0) {
    next = list.filter((_, index) => index !== existing)
    pinned = false
  } else {
    const preview = String(message?.rawText || message?.text || '').trim()
      || (message?.imageUrl || message?.fileKind === 'image' ? '写真' : '')
      || (message?.fileKind === 'video' || String(message?.fileMime || '').startsWith('video/') ? '動画' : '')
      || (message?.sticker ? 'スタンプ' : '')
      || (message?.fileUrl ? (message?.fileName || 'ファイル') : '')
      || 'メッセージ'
    next = [
      {
        messageId,
        text: preview.slice(0, 500),
        sender: String(message?.sender || message?.role || ''),
        createdAt: message?.createdAt || message?.createdAtIso || null,
        pinnedAt: new Date().toISOString(),
        pinnedBy: String(pinnedBy || '').trim().toLowerCase(),
      },
      ...list,
    ].slice(0, THREAD_PIN_LIMIT)
    pinned = true
  }
  await setDoc(threadRef, { pinnedMessages: next }, { merge: true })
  await mirrorPinnedMessagesToCanonical(tid, snap.data(), next)
  return { pinned, list: next }
}

export async function unpinThreadChatMessage({ threadId, messageId } = {}) {
  const tid = String(threadId || '').trim()
  const mid = String(messageId || '').trim()
  if (!tid || !mid) return []
  const threadRef = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(threadRef)
  const next = serializeThreadPinnedMessages(snap.data()?.pinnedMessages)
    .filter((entry) => entry.messageId !== mid)
  await setDoc(threadRef, { pinnedMessages: next }, { merge: true })
  await mirrorPinnedMessagesToCanonical(tid, snap.data(), next)
  return next
}

async function mirrorPinnedMessagesToCanonical(threadId, threadData, pinnedMessages) {
  const tid = String(threadId || '').trim()
  const guestKey = String(
    threadData?.guestKey
    || (tid.match(/^guest-([a-z0-9_-]+)$/i) || [])[1]
    || '',
  ).trim().toLowerCase()
  if (!guestKey) return
  const canon = `guest-${guestKey}`
  if (canon === tid) return
  await setDoc(
    doc(db, CHAT_THREADS_COLLECTION, canon),
    { pinnedMessages },
    { merge: true },
  )
}

/**
 * One-shot: push device-local pins for this conversation into the shared
 * thread doc so the other side (and refresh) can see them.
 */
export async function migrateLocalPinsToThread({
  threadId,
  relatedThreadIds = [],
  localPins = [],
  includeOrphanPins = false,
  guestKey = '',
} = {}) {
  const tid = String(threadId || '').trim()
  if (!tid) return null
  const related = new Set(
    [tid, ...relatedThreadIds].map((id) => String(id || '').trim()).filter(Boolean),
  )
  const key = String(guestKey || '').trim().toLowerCase()
  const locals = (Array.isArray(localPins) ? localPins : [])
    .filter((entry) => {
      const pinThread = String(entry?.threadId || '').trim()
      if (!pinThread) return includeOrphanPins
      if (related.has(pinThread)) return true
      if (key && (
        pinThread === `guest-${key}`
        || pinThread.endsWith(`-${key}`)
        || pinThread.includes(key)
      )) return true
      return false
    })
    .map((entry) => ({
      messageId: String(entry?.messageId || '').trim(),
      text: String(entry?.text || '').slice(0, 500),
      sender: String(entry?.sender || ''),
      createdAt: entry?.createdAt || null,
      pinnedAt: entry?.pinnedAt || new Date().toISOString(),
      pinnedBy: String(entry?.pinnedBy || 'local'),
    }))
    .filter((entry) => entry.messageId && !entry.messageId.startsWith('pending-'))
  if (!locals.length) return null

  const threadRef = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(threadRef)
  const remote = serializeThreadPinnedMessages(snap.data()?.pinnedMessages)
  const byId = new Map()
  for (const entry of remote) byId.set(entry.messageId, entry)
  let added = 0
  for (const entry of locals) {
    if (byId.has(entry.messageId)) continue
    byId.set(entry.messageId, entry)
    added += 1
  }
  if (!added) return remote
  const next = [...byId.values()].slice(0, THREAD_PIN_LIMIT)
  await setDoc(threadRef, { pinnedMessages: next }, { merge: true })
  await mirrorPinnedMessagesToCanonical(tid, snap.data() || { guestKey: key }, next)
  return next
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
 * Hana confirms arrival in Japan — hides the shared trip countdown for both sides.
 * @param {string} threadId
 */
export async function confirmJpTripArrived(threadId) {
  if (!threadId) return
  const nowIso = new Date().toISOString()
  await setDoc(doc(db, CHAT_THREADS_COLLECTION, threadId), {
    jpTripArrivedAt: serverTimestamp(),
    jpTripArrivedAtIso: nowIso,
  }, { merge: true })
}

/** Default start/goal for Gabu sakura weight garden (kg). */
export const WEIGHT_GARDEN_DEFAULT_START_KG = 65
export const WEIGHT_GARDEN_DEFAULT_GOAL_KG = 55
export const WEIGHT_GARDEN_STAGE_COUNT = 12
export const WEIGHT_GARDEN_LOG_LIMIT = 60

function clampWeightKg(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(80, Math.max(40, Math.round(n * 10) / 10))
}

export function serializeWeightGarden(raw) {
  const startKg = clampWeightKg(raw?.startKg, WEIGHT_GARDEN_DEFAULT_START_KG)
  const goalKg = clampWeightKg(raw?.goalKg, WEIGHT_GARDEN_DEFAULT_GOAL_KG)
  const logs = []
  if (Array.isArray(raw?.logs)) {
    for (const entry of raw.logs) {
      if (!entry || typeof entry !== 'object') continue
      const kg = Number(entry.kg)
      if (!Number.isFinite(kg) || kg < 30 || kg > 200) continue
      const atIso = String(entry.atIso || entry.at || '').trim()
      if (!atIso) continue
      logs.push({
        kg: Math.round(kg * 10) / 10,
        atIso,
        note: String(entry.note || '').trim().slice(0, 80),
      })
      if (logs.length >= WEIGHT_GARDEN_LOG_LIMIT) break
    }
  }
  return { startKg, goalKg, logs }
}

export function weightGardenProgress(garden) {
  const data = serializeWeightGarden(garden)
  const currentKg = data.logs.length
    ? data.logs[0].kg
    : data.startKg
  const span = data.startKg - data.goalKg
  const gained = data.startKg - currentKg
  const ratio = span > 0 ? gained / span : 0
  const progress = Math.min(1, Math.max(0, ratio))
  const stage = Math.round(progress * WEIGHT_GARDEN_STAGE_COUNT)
  const remaining = Math.max(0, Math.round((currentKg - data.goalKg) * 10) / 10)
  const reached = currentKg <= data.goalKg
  return {
    ...data,
    currentKg,
    progress,
    stage: reached ? WEIGHT_GARDEN_STAGE_COUNT : stage,
    remaining,
    reached,
  }
}

/** Seed defaults on the thread if weightGarden is missing. */
export async function ensureWeightGardenDefaults(threadId) {
  const tid = String(threadId || '').trim()
  if (!tid) return null
  const ref = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(ref)
  const existing = snap.exists() ? snap.data()?.weightGarden : null
  if (existing && typeof existing === 'object') {
    return serializeWeightGarden(existing)
  }
  const weightGarden = serializeWeightGarden({
    startKg: WEIGHT_GARDEN_DEFAULT_START_KG,
    goalKg: WEIGHT_GARDEN_DEFAULT_GOAL_KG,
    logs: [],
  })
  await setDoc(ref, { weightGarden }, { merge: true })
  return weightGarden
}

/** Guest logs a weigh-in (newest first). */
export async function logWeightGardenEntry(threadId, { kg, note = '' } = {}) {
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  const nextKg = Number(kg)
  if (!Number.isFinite(nextKg) || nextKg < 30 || nextKg > 200) {
    throw new Error('体重を正しく入力してください。')
  }
  const ref = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(ref)
  const prev = serializeWeightGarden(snap.exists() ? snap.data()?.weightGarden : null)
  const entry = {
    kg: Math.round(nextKg * 10) / 10,
    atIso: new Date().toISOString(),
    note: String(note || '').trim().slice(0, 80),
  }
  const weightGarden = {
    startKg: prev.startKg,
    goalKg: prev.goalKg,
    logs: [entry, ...prev.logs].slice(0, WEIGHT_GARDEN_LOG_LIMIT),
  }
  await setDoc(ref, { weightGarden }, { merge: true })
  return weightGardenProgress(weightGarden)
}

/** Guest updates the goal weight (40–80 kg). */
export async function setWeightGardenGoal(threadId, goalKg) {
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  const ref = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(ref)
  const prev = serializeWeightGarden(snap.exists() ? snap.data()?.weightGarden : null)
  const weightGarden = {
    ...prev,
    goalKg: clampWeightKg(goalKg, prev.goalKg),
  }
  await setDoc(ref, { weightGarden }, { merge: true })
  return weightGardenProgress(weightGarden)
}

const POKE_ZUKAN_ENTRY_LIMIT = 80
const POKE_CHEERS = new Set(['すごい！', 'がんばれ', 'いいね', '今日もエースだね'])

function emptyPokeDuo() {
  return {
    ymd: '',
    promptId: '',
    promptBy: '',
    cheer: '',
    cheerAtIso: '',
    cheerBy: '',
    supportType: '',
    supportOk: false,
    supportBy: '',
  }
}

function emptyExpedition() {
  return {
    ymd: '',
    hunts: { hana: [], guest: [] },
    foundRare: { hana: false, guest: false },
    energyPick: { hana: '', guest: '' },
    comboMove: { hana: '', guest: '' },
    tradePick: { hana: '', guest: '' },
    giftedSpeciesId: '',
    giftedBy: '',
  }
}

function serializeHuntList(raw) {
  const out = []
  if (!Array.isArray(raw)) return out
  for (const id of raw) {
    const key = String(id || '').trim().slice(0, 8)
    if (!key || out.includes(key)) continue
    out.push(key)
    if (out.length >= 6) break
  }
  return out
}

export function serializePokeZukan(raw) {
  const entries = {}
  const src = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {}
  let n = 0
  for (const [key, value] of Object.entries(src)) {
    const id = String(Number(key) || key).trim()
    if (!id || !value || typeof value !== 'object') continue
    entries[id] = {
      caughtAtIso: String(value.caughtAtIso || '').trim(),
      photoUrl: String(value.photoUrl || '').trim(),
      foil: Boolean(value.foil),
      nickname: String(value.nickname || '').trim().slice(0, 24),
    }
    n += 1
    if (n >= POKE_ZUKAN_ENTRY_LIMIT) break
  }
  const partyIds = []
  if (Array.isArray(raw?.partyIds)) {
    for (const id of raw.partyIds) {
      const sid = String(Number(id) || '').trim()
      if (!sid || partyIds.includes(sid)) continue
      partyIds.push(sid)
      if (partyIds.length >= 3) break
    }
  }
  const duoRaw = raw?.duo && typeof raw.duo === 'object' ? raw.duo : {}
  const cheer = String(duoRaw.cheer || '').trim()
  const expRaw = raw?.expedition && typeof raw.expedition === 'object' ? raw.expedition : {}
  const foundRare = expRaw.foundRare && typeof expRaw.foundRare === 'object' ? expRaw.foundRare : {}
  const energyPick = expRaw.energyPick && typeof expRaw.energyPick === 'object' ? expRaw.energyPick : {}
  const comboMove = expRaw.comboMove && typeof expRaw.comboMove === 'object' ? expRaw.comboMove : {}
  const tradePick = expRaw.tradePick && typeof expRaw.tradePick === 'object' ? expRaw.tradePick : {}
  const hunts = expRaw.hunts && typeof expRaw.hunts === 'object' ? expRaw.hunts : {}
  return {
    hanaStreak: Math.max(0, Number(raw?.hanaStreak) || 0),
    guestStreak: Math.max(0, Number(raw?.guestStreak ?? raw?.gabuStreak) || 0),
    hanaDoneYmd: String(raw?.hanaDoneYmd || '').trim(),
    guestDoneYmd: String(raw?.guestDoneYmd || raw?.gabuDoneYmd || '').trim(),
    duoStreak: Math.max(0, Number(raw?.duoStreak) || 0),
    duoStars: Math.max(0, Number(raw?.duoStars) || 0),
    duoStarYmd: String(raw?.duoStarYmd || '').trim(),
    trainerXp: Math.max(0, Number(raw?.trainerXp) || 0),
    partyIds,
    partyScoreYmd: String(raw?.partyScoreYmd || '').trim(),
    partyScore: Math.max(0, Number(raw?.partyScore) || 0),
    duo: {
      ...emptyPokeDuo(),
      ymd: String(duoRaw.ymd || '').trim(),
      promptId: String(duoRaw.promptId || '').trim().slice(0, 80),
      promptBy: String(duoRaw.promptBy || '').trim().slice(0, 12),
      cheer: POKE_CHEERS.has(cheer) ? cheer : cheer.slice(0, 16),
      cheerAtIso: String(duoRaw.cheerAtIso || '').trim(),
      cheerBy: String(duoRaw.cheerBy || '').trim().slice(0, 12),
      supportType: String(duoRaw.supportType || '').trim().slice(0, 16),
      supportOk: Boolean(duoRaw.supportOk),
      supportBy: String(duoRaw.supportBy || '').trim().slice(0, 12),
    },
    expedition: {
      ...emptyExpedition(),
      ymd: String(expRaw.ymd || '').trim(),
      hunts: {
        hana: serializeHuntList(hunts.hana),
        guest: serializeHuntList(hunts.guest),
      },
      foundRare: {
        hana: Boolean(foundRare.hana),
        guest: Boolean(foundRare.guest),
      },
      energyPick: {
        hana: String(energyPick.hana || '').trim().slice(0, 16),
        guest: String(energyPick.guest || '').trim().slice(0, 16),
      },
      comboMove: {
        hana: String(comboMove.hana || '').trim().slice(0, 24),
        guest: String(comboMove.guest || '').trim().slice(0, 24),
      },
      tradePick: {
        hana: String(tradePick.hana || '').trim().slice(0, 12),
        guest: String(tradePick.guest || '').trim().slice(0, 12),
      },
      giftedSpeciesId: String(expRaw.giftedSpeciesId || '').trim().slice(0, 12),
      giftedBy: String(expRaw.giftedBy || '').trim().slice(0, 12),
    },
    entries,
  }
}

function tokyoPokeYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function pokeRoleKey(role) {
  return role === 'hana' ? 'hana' : 'guest'
}

function applyDuoStar(prev, ymd) {
  const hanaDone = prev.hanaDoneYmd === ymd
  const guestDone = prev.guestDoneYmd === ymd
  if (!hanaDone || !guestDone) return prev
  if (String(prev.duoStarYmd || '') === ymd) return prev
  return {
    ...prev,
    duoStars: prev.duoStars + 1,
    duoStreak: prev.duoStreak + 1,
    duoStarYmd: ymd,
  }
}

async function patchPokeZukan(threadId, mutator) {
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('スレッドがありません。')
  const ref = doc(db, CHAT_THREADS_COLLECTION, tid)
  const snap = await getDoc(ref)
  const prev = serializePokeZukan(snap.exists() ? snap.data()?.pokeZukan : null)
  const next = serializePokeZukan(mutator(prev))
  await setDoc(ref, { pokeZukan: next }, { merge: true })
  return next
}

export async function recordPokeZukanCatch(threadId, { role, speciesId, ymd, foil = false } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const sid = String(Number(speciesId) || '').trim()
  if (!sid) throw new Error('図鑑番号がありません。')
  return patchPokeZukan(threadId, (prev) => {
    const already = who === 'hana' ? prev.hanaDoneYmd === day : prev.guestDoneYmd === day
    const entries = { ...prev.entries }
    if (!entries[sid]) {
      entries[sid] = {
        caughtAtIso: new Date().toISOString(),
        photoUrl: '',
        foil: Boolean(foil),
        nickname: '',
      }
    } else if (foil) {
      entries[sid] = { ...entries[sid], foil: true }
    }
    const duo = prev.duo?.ymd === day ? prev.duo : null
    const cheeredByPartner = Boolean(duo?.cheer) && duo.cheerBy && duo.cheerBy !== who
    const cheerBonus = !already && cheeredByPartner
      ? (String(duo.cheer).includes('エース') ? 2 : 1)
      : 0
    const next = {
      ...prev,
      entries,
      hanaDoneYmd: who === 'hana' ? day : prev.hanaDoneYmd,
      guestDoneYmd: who === 'guest' ? day : prev.guestDoneYmd,
      hanaStreak: who === 'hana' && !already ? prev.hanaStreak + 1 : prev.hanaStreak,
      guestStreak: who === 'guest' && !already ? prev.guestStreak + 1 : prev.guestStreak,
      trainerXp: prev.trainerXp + cheerBonus,
    }
    return applyDuoStar(next, day)
  })
}

export async function setPokeZukanDuoPrompt(threadId, { role, promptId, ymd } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const id = String(promptId || '').trim()
  if (!id) throw new Error('お題がありません。')
  return patchPokeZukan(threadId, (prev) => {
    const duo = prev.duo?.ymd === day ? { ...prev.duo } : { ...emptyPokeDuo(), ymd: day }
    return {
      ...prev,
      duo: { ...duo, ymd: day, promptId: id, promptBy: who },
    }
  })
}

export async function setPokeZukanCheer(threadId, { role, cheer, ymd } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const text = String(cheer || '').trim()
  if (!POKE_CHEERS.has(text)) throw new Error('応援を選んでください。')
  return patchPokeZukan(threadId, (prev) => {
    const duo = prev.duo?.ymd === day ? { ...prev.duo } : { ...emptyPokeDuo(), ymd: day }
    return {
      ...prev,
      duo: {
        ...duo,
        ymd: day,
        cheer: text,
        cheerAtIso: new Date().toISOString(),
        cheerBy: who,
      },
    }
  })
}

export async function setPokeZukanParty(threadId, partyIds = []) {
  return patchPokeZukan(threadId, (prev) => ({
    ...prev,
    partyIds: [...partyIds].map((id) => String(Number(id) || '').trim()).filter(Boolean).slice(0, 3),
  }))
}

export async function setPokeZukanSupport(threadId, { role, supportType, supportOk = false, ymd, score } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const t = String(supportType || '').trim()
  return patchPokeZukan(threadId, (prev) => {
    const duo = prev.duo?.ymd === day ? { ...prev.duo } : { ...emptyPokeDuo(), ymd: day }
    return {
      ...prev,
      partyScore: Number.isFinite(Number(score)) ? Math.max(0, Number(score)) : prev.partyScore,
      partyScoreYmd: day,
      duo: {
        ...duo,
        ymd: day,
        supportType: t,
        supportOk: Boolean(supportOk),
        supportBy: who,
      },
    }
  })
}

export async function setPokeZukanCardPhoto(threadId, { speciesId, photoUrl } = {}) {
  const sid = String(Number(speciesId) || '').trim()
  const url = String(photoUrl || '').trim()
  if (!sid || !url) throw new Error('カード写真がありません。')
  return patchPokeZukan(threadId, (prev) => {
    const prevEntry = prev.entries[sid] || {
      caughtAtIso: new Date().toISOString(),
      photoUrl: '',
      foil: false,
      nickname: '',
    }
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [sid]: { ...prevEntry, photoUrl: url.slice(0, 2000) },
      },
    }
  })
}

function expeditionForDay(prev, ymd) {
  if (prev.expedition?.ymd === ymd) return { ...prev.expedition }
  return { ...emptyExpedition(), ymd }
}

export async function flipPokeHuntTile(threadId, {
  role,
  tileId,
  kind,
  speciesId,
  ymd,
} = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const tile = String(tileId || '').trim()
  if (!tile) throw new Error('マスがありません。')
  const sid = String(Number(speciesId) || '').trim()
  return patchPokeZukan(threadId, (prev) => {
    const expedition = expeditionForDay(prev, day)
    const mine = [...(expedition.hunts[who] || [])]
    if (mine.includes(tile) || mine.length >= 3) return prev
    mine.push(tile)
    const foundRare = { ...expedition.foundRare }
    if (kind === 'rare') foundRare[who] = true
    const foil = Boolean(foundRare[who])
    const entries = { ...prev.entries }
    const finished = mine.length >= 3
    if (finished && sid && !entries[sid]) {
      entries[sid] = {
        caughtAtIso: new Date().toISOString(),
        photoUrl: '',
        foil,
        nickname: '',
      }
    } else if (finished && sid && foil && entries[sid]) {
      entries[sid] = { ...entries[sid], foil: true }
    }
    const already = who === 'hana' ? prev.hanaDoneYmd === day : prev.guestDoneYmd === day
    let next = {
      ...prev,
      entries,
      expedition: {
        ...expedition,
        ymd: day,
        hunts: { ...expedition.hunts, [who]: mine },
        foundRare,
      },
      hanaDoneYmd: who === 'hana' && finished ? day : prev.hanaDoneYmd,
      guestDoneYmd: who === 'guest' && finished ? day : prev.guestDoneYmd,
      hanaStreak: who === 'hana' && finished && !already ? prev.hanaStreak + 1 : prev.hanaStreak,
      guestStreak: who === 'guest' && finished && !already ? prev.guestStreak + 1 : prev.guestStreak,
    }
    return applyDuoStar(next, day)
  })
}

export async function setPokeExpeditionPick(threadId, { role, field, value, ymd } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const key = String(field || '').trim()
  if (!['energyPick', 'comboMove', 'tradePick'].includes(key)) {
    throw new Error('選択できません。')
  }
  return patchPokeZukan(threadId, (prev) => {
    const expedition = expeditionForDay(prev, day)
    if (expedition[key]?.[who]) return prev
    return {
      ...prev,
      expedition: {
        ...expedition,
        ymd: day,
        [key]: { ...expedition[key], [who]: String(value || '').trim().slice(0, 24) },
      },
    }
  })
}

export async function giftPokeDailyCard(threadId, { role, speciesId, ymd } = {}) {
  const who = pokeRoleKey(role)
  const day = String(ymd || tokyoPokeYmd())
  const sid = String(Number(speciesId) || '').trim()
  if (!sid) throw new Error('カードがありません。')
  return patchPokeZukan(threadId, (prev) => {
    const expedition = expeditionForDay(prev, day)
    return {
      ...prev,
      expedition: {
        ...expedition,
        ymd: day,
        giftedSpeciesId: sid,
        giftedBy: who,
      },
    }
  })
}

export async function stampPokeFoil(threadId, speciesId) {
  const sid = String(Number(speciesId) || '').trim()
  if (!sid) return null
  return patchPokeZukan(threadId, (prev) => {
    const prevEntry = prev.entries[sid]
    if (!prevEntry) return prev
    return {
      ...prev,
      entries: {
        ...prev.entries,
        [sid]: { ...prevEntry, foil: true },
      },
    }
  })
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
  // Must orderBy newest-first. limit(N) alone returns arbitrary/oldest docs,
  // so new sends never appear in the bubble list (push/preview still work).
  const messagesRef = collection(db, CHAT_THREADS_COLLECTION, threadId, 'messages')
  return onSnapshot(
    query(messagesRef, orderBy('createdAtIso', 'desc'), limit(300)),
    (snap) => {
      const rows = sortChatMessages(
        snap.docs
          .map((document) => serializeChatMessage(document.id, document.data()))
          .filter((message) => !message.deleted),
      )
      onData?.(rows)
    },
    (error) => onError?.(error),
  )
}

const CHAT_CALLS_SUBCOLLECTION = 'calls'
const CHAT_CALL_HISTORY_COLLECTION = 'chat-call-history'

function chatCallRef(threadId, callId) {
  return doc(db, CHAT_THREADS_COLLECTION, threadId, CHAT_CALLS_SUBCOLLECTION, callId)
}

/**
 * Create a WebRTC signaling record. Media never passes through Firebase;
 * only the offer/answer and ICE candidates are stored here.
 */
export async function createChatCall({ threadId, callerRole, type }) {
  if (!threadId || !['guest', 'hana'].includes(callerRole)) {
    throw new Error('Invalid call target.')
  }
  const now = new Date().toISOString()
  const ref = await addDoc(
    collection(db, CHAT_THREADS_COLLECTION, threadId, CHAT_CALLS_SUBCOLLECTION),
    {
      callerRole,
      calleeRole: callerRole === 'hana' ? 'guest' : 'hana',
      type: type === 'video' ? 'video' : 'voice',
      status: 'ringing',
      offer: null,
      answer: null,
      createdAt: serverTimestamp(),
      createdAtIso: now,
      updatedAt: serverTimestamp(),
      updatedAtIso: now,
    },
  )
  return ref.id
}

export async function updateChatCall(threadId, callId, patch) {
  if (!threadId || !callId) return
  await setDoc(
    chatCallRef(threadId, callId),
    {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true },
  )
}

function formatCallDurationLabel(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Japanese call-log text for chat timeline (LINE-style). */
export function buildChatCallLogText({ status, durationSec = 0 } = {}) {
  const st = String(status || '').trim()
  const dur = Math.max(0, Math.floor(Number(durationSec) || 0))
  if (st === 'ended' && dur > 0) return `通話 ${formatCallDurationLabel(dur)}`
  if (st === 'ended') return '通話をキャンセル'
  if (st === 'missed') return '不在着信'
  if (st === 'rejected') return '通話を拒否'
  if (st === 'failed') return '通話に失敗'
  return '通話'
}

/**
 * Write / upsert a call log bubble into the chat thread.
 * Uses a stable message id so both peers can call this safely.
 */
export async function postChatCallLog({
  threadId,
  callId,
  status,
  callerRole,
  endedBy,
  durationSec = 0,
  answeredAtIso = null,
}) {
  const tid = String(threadId || '').trim()
  const cid = String(callId || '').trim()
  const st = String(status || '').trim()
  if (!tid || !cid || !st) return null

  const dur = Math.max(0, Math.floor(Number(durationSec) || 0))
  const text = buildChatCallLogText({ status: st, durationSec: dur })
  const senderRole = endedBy === 'hana' || endedBy === 'guest'
    ? endedBy
    : (callerRole === 'hana' ? 'hana' : 'guest')
  const nowIso = new Date().toISOString()
  const messageId = `calllog-${cid}`.slice(0, 64)

  const threadRef = doc(db, CHAT_THREADS_COLLECTION, tid)
  const messageRef = doc(db, CHAT_THREADS_COLLECTION, tid, 'messages', messageId)
  const callRef = chatCallRef(tid, cid)

  const [messageSnap, callSnap] = await Promise.all([getDoc(messageRef), getDoc(callRef)])
  if (callSnap.exists() && callSnap.data()?.logPosted && messageSnap.exists()) {
    // Already logged — only upgrade duration text if we now know a longer call.
    const prevDur = Math.max(0, Number(messageSnap.data()?.callLog?.durationSec) || 0)
    if (dur > prevDur) {
      await setDoc(messageRef, {
        text,
        callLog: {
          callId: cid,
          status: st,
          durationSec: dur,
          callerRole: callerRole === 'hana' ? 'hana' : 'guest',
          endedBy: endedBy === 'hana' || endedBy === 'guest' ? endedBy : '',
          answeredAtIso: answeredAtIso ? String(answeredAtIso) : null,
        },
      }, { merge: true })
      await setDoc(threadRef, { lastText: text.slice(0, 160) }, { merge: true })
    }
    return messageId
  }

  const isNew = !messageSnap.exists()
  await setDoc(messageRef, {
    text,
    sender: senderRole,
    createdAt: messageSnap.exists() ? (messageSnap.data()?.createdAt || serverTimestamp()) : serverTimestamp(),
    createdAtIso: messageSnap.exists() ? (messageSnap.data()?.createdAtIso || nowIso) : nowIso,
    deleted: false,
    clientId: messageId,
    kind: 'call-log',
    callLog: {
      callId: cid,
      status: st,
      durationSec: dur,
      callerRole: callerRole === 'hana' ? 'hana' : 'guest',
      endedBy: endedBy === 'hana' || endedBy === 'guest' ? endedBy : '',
      answeredAtIso: answeredAtIso ? String(answeredAtIso) : null,
    },
  }, { merge: true })

  await setDoc(
    threadRef,
    {
      lastText: text.slice(0, 160),
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      ...(isNew
        ? (senderRole === 'guest'
          ? {
              unreadByHana: true,
              unreadCountHana: increment(1),
            }
          : {
              unreadByGuest: true,
              unreadCountGuest: increment(1),
            })
        : {}),
    },
    { merge: true },
  )

  await setDoc(
    callRef,
    {
      logPosted: true,
      durationSec: dur,
      status: st,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  )

  // Admin history (includes technical fail fields when present).
  try {
    const callData = callSnap.exists() ? (callSnap.data() || {}) : {}
    await upsertChatCallHistory({
      callId: cid,
      threadId: tid,
      status: st,
      durationSec: dur,
      callerRole: callerRole === 'hana' ? 'hana' : 'guest',
      endedBy: endedBy === 'hana' || endedBy === 'guest' ? endedBy : '',
      answeredAtIso: answeredAtIso ? String(answeredAtIso) : null,
      createdAtIso: callData.createdAtIso || nowIso,
      endedAtIso: callData.endedAtIso || nowIso,
      failCode: callData.failCode || '',
      failReason: callData.failReason || '',
      failByRole: callData.failByRole || '',
      guestKey: callData.guestKey || '',
      type: callData.type || 'video',
    })
  } catch {
    // History is best-effort; chat log already wrote.
  }

  return messageId
}

/**
 * Upsert a flat admin-facing call history row (tech details for failures).
 */
export async function upsertChatCallHistory(entry = {}) {
  const callId = String(entry.callId || '').trim()
  if (!callId) return null
  const nowIso = new Date().toISOString()
  const payload = {
    callId,
    threadId: String(entry.threadId || '').trim(),
    status: String(entry.status || '').trim(),
    durationSec: Math.max(0, Math.floor(Number(entry.durationSec) || 0)),
    callerRole: entry.callerRole === 'hana' ? 'hana' : 'guest',
    endedBy: entry.endedBy === 'hana' || entry.endedBy === 'guest' ? entry.endedBy : '',
    answeredAtIso: entry.answeredAtIso ? String(entry.answeredAtIso) : null,
    createdAtIso: String(entry.createdAtIso || nowIso),
    endedAtIso: entry.endedAtIso ? String(entry.endedAtIso) : null,
    failCode: String(entry.failCode || '').slice(0, 64),
    failReason: String(entry.failReason || '').slice(0, 800),
    failByRole: entry.failByRole === 'hana' || entry.failByRole === 'guest' ? entry.failByRole : '',
    guestKey: String(entry.guestKey || '').slice(0, 80),
    type: entry.type === 'voice' ? 'voice' : 'video',
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }
  if (!entry.createdAtIso) {
    payload.createdAt = serverTimestamp()
  }
  await setDoc(doc(db, CHAT_CALL_HISTORY_COLLECTION, callId), payload, { merge: true })
  return callId
}

export function subscribeChatCallHistory(onData, onError, { limitCount = 100 } = {}) {
  return onSnapshot(
    query(
      collection(db, CHAT_CALL_HISTORY_COLLECTION),
      orderBy('createdAtIso', 'desc'),
      limit(Math.max(1, Math.min(200, Number(limitCount) || 100))),
    ),
    (snap) => {
      onData?.(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
    },
    (error) => onError?.(error),
  )
}

export function subscribeChatCalls(threadId, onData, onError) {
  if (!threadId) {
    onData?.([])
    return () => {}
  }
  return onSnapshot(
    query(
      collection(db, CHAT_THREADS_COLLECTION, threadId, CHAT_CALLS_SUBCOLLECTION),
      orderBy('createdAtIso', 'desc'),
      limit(12),
    ),
    (snap) => {
      const calls = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')))
      onData?.(calls)
    },
    (error) => onError?.(error),
  )
}

export async function addChatCallCandidate(threadId, callId, role, candidate) {
  if (!threadId || !callId || !candidate || !['guest', 'hana'].includes(role)) return
  await addDoc(
    collection(
      db,
      CHAT_THREADS_COLLECTION,
      threadId,
      CHAT_CALLS_SUBCOLLECTION,
      callId,
      `${role}Candidates`,
    ),
    {
      candidate,
      createdAt: serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    },
  )
}

export function subscribeChatCallCandidates(threadId, callId, role, onCandidate, onError) {
  if (!threadId || !callId || !['guest', 'hana'].includes(role)) return () => {}
  return onSnapshot(
    collection(
      db,
      CHAT_THREADS_COLLECTION,
      threadId,
      CHAT_CALLS_SUBCOLLECTION,
      callId,
      `${role}Candidates`,
    ),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') onCandidate?.(change.doc.data()?.candidate)
      })
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

  // Fast path: canonical already has history — open that, not the legacy id.
  const canonMessagesRef = collection(db, CHAT_THREADS_COLLECTION, canonicalId, 'messages')
  const canonSnap = await getDocs(query(canonMessagesRef, limit(1)))
  if (!canonSnap.empty) return canonicalId

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

/** Admin: watch recent threads + every known guest-* (zen must never drop off). */
export function subscribeChatThreads(onData, onError) {
  const threadsQuery = query(
    collection(db, CHAT_THREADS_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(250),
  )
  const knownIds = listGuestProfiles().map((profile) => `guest-${profile.key}`)
  let mainRows = []
  const knownRows = new Map()

  const emit = () => {
    const byId = new Map()
    mainRows.forEach((row) => byId.set(row.id, row))
    knownRows.forEach((row, id) => {
      if (row) byId.set(id, row)
    })
    const rows = [...byId.values()].sort((a, b) => (
      String(b.updatedAt || b.updatedAtIso || '').localeCompare(String(a.updatedAt || a.updatedAtIso || ''))
    ))
    onData?.(rows)
  }

  const unsubMain = onSnapshot(
    threadsQuery,
    (snap) => {
      mainRows = snap.docs.map((document) => serializeChatThread(document.id, document.data()))
      emit()
    },
    (error) => onError?.(error),
  )

  const unsubsKnown = knownIds.map((id) => onSnapshot(
    doc(db, CHAT_THREADS_COLLECTION, id),
    (snap) => {
      knownRows.set(id, snap.exists() ? serializeChatThread(snap.id, snap.data()) : null)
      emit()
    },
    () => {},
  ))

  return () => {
    unsubMain()
    unsubsKnown.forEach((unsub) => unsub())
  }
}

/** Prefer the thread that actually has history for a known guest (fixes empty guest-zen). */
export async function resolveGuestThreadWithHistory({
  guestKey = '',
  canonicalId = '',
  guestLabel = '',
  preferredId = '',
} = {}) {
  const key = normalizeAccountKey(guestKey || String(canonicalId || '').replace(/^guest-/, ''))
  const canon = canonicalId || (key ? `guest-${key}` : '')
  const label = String(guestLabel || '').trim()
  const candidates = new Map()

  const consider = (id, data) => {
    if (!id || !data) return
    candidates.set(id, serializeChatThread(id, data))
  }

  const jobs = []
  if (preferredId) {
    jobs.push(getDoc(doc(db, CHAT_THREADS_COLLECTION, preferredId)).then((snap) => {
      if (snap.exists()) consider(snap.id, snap.data())
    }))
  }
  if (canon && canon !== preferredId) {
    jobs.push(getDoc(doc(db, CHAT_THREADS_COLLECTION, canon)).then((snap) => {
      if (snap.exists()) consider(snap.id, snap.data())
    }))
  }
  if (key) {
    jobs.push(
      getDocs(query(
        collection(db, CHAT_THREADS_COLLECTION),
        where('guestKey', '==', key),
        limit(25),
      )).then((snap) => {
        snap.docs.forEach((document) => consider(document.id, document.data()))
      }).catch(() => {}),
    )
  }
  if (label) {
    jobs.push(
      getDocs(query(
        collection(db, CHAT_THREADS_COLLECTION),
        where('guestLabel', '==', label),
        limit(25),
      )).then((snap) => {
        snap.docs.forEach((document) => consider(document.id, document.data()))
      }).catch(() => {}),
    )
  }
  await Promise.all(jobs)

  const rows = [...candidates.values()]
  if (!rows.length) return preferredId || canon || ''

  // Empty guest-{key} shells often beat UUID threads that still hold history but
  // lack lastText. Probe messages so real history always wins.
  await Promise.all(rows.map(async (entry) => {
    if (String(entry.lastText || '').trim()) {
      entry._hasMessages = true
      return
    }
    try {
      const snap = await getDocs(query(
        collection(db, CHAT_THREADS_COLLECTION, entry.id, 'messages'),
        limit(1),
      ))
      entry._hasMessages = !snap.empty
    } catch {
      entry._hasMessages = false
    }
  }))

  rows.sort((a, b) => {
    const score = (entry) => {
      const hasHistory = (String(entry.lastText || '').trim() || entry._hasMessages) ? 40 : 0
      // Prefer canonical guest-{key} when it already has history so new sends
      // land where reopen will look.
      const canonWithHistory = canon && entry.id === canon && entry._hasMessages ? 16 : 0
      const keyHit = key && entry.guestKey === key ? 4 : 0
      const canonHit = canon && entry.id === canon ? 2 : 0
      const preferredHit = preferredId && entry.id === preferredId ? 1 : 0
      return hasHistory + canonWithHistory + keyHit + canonHit + preferredHit
    }
    const diff = score(b) - score(a)
    if (diff !== 0) return diff
    return String(b.updatedAt || b.updatedAtIso || '').localeCompare(String(a.updatedAt || a.updatedAtIso || ''))
  })
  return rows[0].id
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
 * Stable account id used for pushTokens.userKey (must match Cloud Functions
 * lookup: owner → "hana", guest → profile.key). Never use the login passKey.
 */
export function resolvePushUserKey(authRole, passOrKey = '') {
  const profile = resolveSessionProfile(authRole === 'owner' ? 'owner' : 'guest', passOrKey)
  const key = normalizeAccountKey(profile?.key)
  if (authRole === 'owner') return key || 'hana'
  return key || ''
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

export async function sendChatMessage({
  threadId,
  text,
  sender,
  guestLabel,
  guestKey,
  replyTo,
  sticker,
  effect,
  effectEmoji,
  imageUrl,
  fileUrl,
  fileName,
  fileMime,
  fileKind,
  fileSize,
  attachments,
  clientId,
}) {
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
  const safeClientId = String(clientId || '').trim().slice(0, 64)

  const stickerId = normalizeChatSticker(sticker)
  const effectId = normalizeChatEffect(effect)
  const emoji = String(effectEmoji || '').slice(0, 8)
  const image = normalizeChatImageUrl(imageUrl)
  const file = normalizeChatImageUrl(fileUrl)
  const mime = normalizeChatFileMime(fileMime)
  const kind = file || image
    ? normalizeChatFileKind(fileKind, mime || (image ? 'image/' : ''))
    : ''
  const name = normalizeChatFileName(fileName)
  const size = Math.max(0, Math.floor(Number(fileSize) || 0))
  const payload = {
    text: trimmed,
    sender: role,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    deleted: false,
    ...(safeClientId ? { clientId: safeClientId } : {}),
    ...(stickerId ? { sticker: stickerId } : {}),
    ...(effectId ? { effect: effectId } : {}),
    ...(effectId && emoji ? { effectEmoji: emoji } : {}),
    ...(image ? { imageUrl: image } : {}),
    ...(file ? { fileUrl: file } : {}),
    ...(file || image ? {
      fileName: name || (kind === 'image' ? '写真' : kind === 'video' ? '動画' : 'ファイル'),
      fileMime: mime || (image ? 'image/jpeg' : ''),
      fileKind: kind || 'file',
      fileSize: size,
    } : {}),
  }
  const attachmentSource = Array.isArray(attachments) && attachments.length
    ? attachments
    : ((file || image)
      ? [{
          url: file || image,
          kind: kind || 'file',
          fileName: name,
          fileMime: mime,
          fileSize: size,
        }]
      : [])
  const storedAttachments = []
  for (const item of attachmentSource.slice(0, 12)) {
    const storedUrl = normalizeChatImageUrl(item?.url)
    if (!storedUrl) continue
    const itemMime = normalizeChatFileMime(item?.fileMime)
    const itemKind = normalizeChatFileKind(item?.kind || item?.fileKind, itemMime || (kind ? `${kind}/` : ''))
    storedAttachments.push({
      url: storedUrl,
      kind: itemKind || kind || 'file',
      fileName: normalizeChatFileName(item?.fileName) || name || 'ファイル',
      fileMime: itemMime,
      fileSize: Math.max(0, Math.floor(Number(item?.fileSize) || 0)),
      ...(normalizeVoiceSkin(item?.voiceSkin) ? { voiceSkin: normalizeVoiceSkin(item.voiceSkin) } : {}),
    })
  }
  if (storedAttachments.length) {
    payload.attachments = storedAttachments
    const voiceSkin = storedAttachments.map((item) => item.voiceSkin).find(Boolean)
    if (voiceSkin) payload.voiceSkin = voiceSkin
  }
  if (replyTo?.id) {
    payload.replyToId = String(replyTo.id)
    payload.replyToText = String(replyTo.text || '').slice(0, 120)
    payload.replyToSender = String(replyTo.sender || 'guest')
  }

  // Atomic: never update thread preview without the message doc (and vice versa).
  const messageRef = doc(messagesRef)
  const batch = writeBatch(db)
  batch.set(messageRef, payload)
  batch.set(
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
  await batch.commit()
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

export async function deleteChatMessage({ threadId, messageId }) {
  if (!threadId || !messageId) return

  const messageRef = doc(db, CHAT_THREADS_COLLECTION, threadId, 'messages', messageId)
  const messageSnap = await getDoc(messageRef)
  const imageUrl = String(messageSnap.data()?.imageUrl || '').trim()
  const fileUrl = String(messageSnap.data()?.fileUrl || '').trim()

  // Remove the doc first so listeners drop the bubble immediately.
  await deleteDoc(messageRef)

  // Preview + storage cleanup can finish in the background.
  void (async () => {
    try {
      const remainingSnap = await getDocs(
        query(
          collection(db, CHAT_THREADS_COLLECTION, threadId, 'messages'),
          orderBy('createdAtIso', 'desc'),
          limit(1),
        ),
      )
      const latest = remainingSnap.docs[0]
        ? serializeChatMessage(remainingSnap.docs[0].id, remainingSnap.docs[0].data())
        : null
      await setDoc(
        doc(db, CHAT_THREADS_COLLECTION, threadId),
        {
          lastText: String(latest?.text || '').slice(0, 160),
        },
        { merge: true },
      )
    } catch {
      /* ignore preview refresh */
    }

    for (const url of [imageUrl, fileUrl]) {
      if (!url) continue
      try {
        await deleteObject(storageRef(storage, url))
      } catch {
        /* ignore */
      }
    }
  })()
}

/**
 * Add / toggle / increment an emoji reaction on a chat message.
 * reactorId should be a stable profile key (`hana`, `hiro`, `zen`, `gabusan`, …).
 * @param {'toggle'|'increment'|'set'} [mode]
 */
export function applyReactionLocally(reactions, emoji, reactorId, mode = 'toggle') {
  const em = String(emoji || '').trim()
  const rid = String(reactorId || '').trim().toLowerCase()
  if (!em || !rid || em.length > 8) return reactions || {}
  const next = { ...(reactions || {}) }
  const counts = { ...(next[em] || {}) }
  const mine = Number(counts[rid]) || 0

  if (mode === 'increment') {
    counts[rid] = Math.min(99, mine + 1)
  } else if (mode === 'set') {
    counts[rid] = 1
  } else if (mine > 0) {
    delete counts[rid]
  } else {
    counts[rid] = 1
  }

  if (Object.keys(counts).length) next[em] = counts
  else delete next[em]
  return next
}

export async function reactToChatMessage({
  threadId,
  messageId,
  emoji,
  reactorId,
  mode = 'toggle',
}) {
  const em = String(emoji || '').trim()
  const rid = String(reactorId || '').trim().toLowerCase()
  if (!threadId || !messageId || !em || !rid) {
    throw new Error('リアクションできません（対象が不正です）。')
  }
  if (em.length > 8) {
    throw new Error('この絵文字は使えません。')
  }

  const messageRef = doc(db, CHAT_THREADS_COLLECTION, threadId, 'messages', messageId)
  const snap = await getDoc(messageRef)
  if (!snap.exists()) {
    const error = new Error('メッセージが見つかりません（まだ送信中かも）。')
    error.code = 'chat/reaction-missing'
    throw error
  }

  const reactions = applyReactionLocally(
    normalizeChatReactions(snap.data()?.reactions),
    em,
    rid,
    mode,
  )

  await updateDoc(messageRef, { reactions: reactionsToFirestore(reactions) })
  return reactions
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
      .slice(0, 2)
    : []
  return {
    translationVi: String(data.translationVi || '').trim(),
    readingHiragana: String(data.readingHiragana || '').trim(),
    replies,
    reason: data.reason || null,
  }
}

/**
 * Owner-only live call assist (guest audio → transcript + spoken reply drafts).
 * Never stored in Firestore.
 */
export async function assistLiveCallForOwner(payload) {
  const callable = httpsCallable(functions, 'assistLiveCallForOwner', { timeout: 60_000 })
  const result = await callable({
    audioBase64: String(payload?.audioBase64 || ''),
    mimeType: String(payload?.mimeType || 'audio/webm').slice(0, 80),
    guestName: String(payload?.guestName || '').trim().slice(0, 40),
    recentTranscript: String(payload?.recentTranscript || '').trim().slice(0, 800),
  })
  const data = result?.data || {}
  const replies = Array.isArray(data.replies)
    ? data.replies
      .map((item) => ({
        ja: String(item?.ja || '').trim(),
        vi: String(item?.vi || '').trim(),
      }))
      .filter((item) => item.ja)
      .slice(0, 2)
    : []
  return {
    transcript: String(data.transcript || '').trim(),
    translationVi: String(data.translationVi || '').trim(),
    replies,
    reason: data.reason || null,
  }
}

/**
 * Owner-only private assist for a book page (never stored in Firestore).
 * @param {{ text: string, title?: string, page?: number }} payload
 */
export async function analyzeBookPageForOwner(payload) {
  const callable = httpsCallable(functions, 'analyzeBookPageForOwner', { timeout: 120_000 })
  const imageBase64 = String(payload?.imageBase64 || '')
    .replace(/^data:image\/\w+;base64,/, '')
    .trim()
  const result = await callable({
    imageBase64,
    imageMimeType: String(payload?.imageMimeType || 'image/jpeg').slice(0, 64) || 'image/jpeg',
    text: String(payload?.text || '').trim().slice(0, 4000),
    title: String(payload?.title || '').trim().slice(0, 80),
    page: Math.max(0, Math.floor(Number(payload?.page) || 0)),
  })
  const data = result?.data || {}
  return {
    translationVi: String(data.translationVi || '').trim(),
    readingHiragana: String(data.readingHiragana || '').trim(),
    reason: data.reason || null,
  }
}

/** Admin: recent Firebase Hosting releases on the live channel. */
export async function fetchHostingReleases() {
  const callable = httpsCallable(functions, 'getHostingReleases')
  const result = await callable({})
  const data = result?.data || {}
  return {
    site: String(data.site || 'hana-mediabox'),
    liveHostingVersionId: data.liveHostingVersionId ? String(data.liveHostingVersionId) : null,
    releases: Array.isArray(data.releases)
      ? data.releases.map((item) => ({
        hostingVersionId: String(item?.hostingVersionId || ''),
        releaseName: item?.releaseName || null,
        releaseTime: item?.releaseTime || null,
        type: item?.type || null,
        isLive: Boolean(item?.isLive),
        fileCount: item?.fileCount == null ? null : Number(item.fileCount),
      })).filter((item) => item.hostingVersionId)
      : [],
  }
}

/** Admin: promote a Hosting version to live (instant rollback). */
export async function rollbackHostingRelease({ hostingVersionId, appVersion } = {}) {
  const callable = httpsCallable(functions, 'rollbackHostingRelease')
  const result = await callable({
    hostingVersionId: String(hostingVersionId || '').trim() || null,
    appVersion: String(appVersion || '').trim() || null,
  })
  return result?.data || { ok: false }
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

function normalizePhotoAlbums(albums) {
  if (!Array.isArray(albums)) return []
  return albums
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || 'Untitled').slice(0, 40),
      imageIds: Array.isArray(item.imageIds)
        ? item.imageIds.filter((id) => typeof id === 'string')
        : [],
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    }))
    .filter((item) => item.id)
}

export function subscribeToSharedPhotoAlbums(onData, onError) {
  return onSnapshot(
    doc(db, SHARED_STATE_COLLECTION, SHARED_PHOTO_ALBUMS_DOC),
    (snapshot) => {
      const data = snapshot.data() || {}
      const albums = normalizePhotoAlbums(data.albums)
      onData(albums, snapshot.exists())
    },
    onError,
  )
}

export async function saveSharedPhotoAlbums(albums) {
  await setDoc(
    doc(db, SHARED_STATE_COLLECTION, SHARED_PHOTO_ALBUMS_DOC),
    {
      albums: normalizePhotoAlbums(albums),
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

/**
 * Normalize the admin-configured edit/delete window.
 * - positive minutes → that many minutes after read
 * - 0 → unlimited
 * - missing / invalid → default 5 minutes
 */
export function normalizeMessageEditWindowMinutes(value) {
  if (value === 0 || value === '0') return 0
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES
  return Math.min(n, MAX_MESSAGE_EDIT_WINDOW_MINUTES)
}

export function messageEditWindowMsFromMinutes(minutes) {
  const n = normalizeMessageEditWindowMinutes(minutes)
  if (n === 0) return Infinity
  return n * 60 * 1000
}

function normalizeChatAppSettings(data = {}) {
  return {
    messageEditWindowMinutes: normalizeMessageEditWindowMinutes(data?.messageEditWindowMinutes),
    /** Default on: missing field keeps はな専用 available. */
    ownerAssistEnabled: data?.ownerAssistEnabled !== false,
    accountIdleDays: normalizeGlobalAccountIdleDays(
      Object.prototype.hasOwnProperty.call(data || {}, 'accountIdleDays')
        ? data.accountIdleDays
        : DEFAULT_ACCOUNT_IDLE_DAYS,
    ),
  }
}

export function subscribeChatAppSettings(onData, onError) {
  return onSnapshot(
    doc(db, SHARED_STATE_COLLECTION, SHARED_CHAT_DOC),
    (snapshot) => {
      onData(normalizeChatAppSettings(snapshot.data() || {}), snapshot.exists())
    },
    onError,
  )
}

export async function saveChatAppSettings(patch = {}) {
  const next = {
    updatedAt: serverTimestamp(),
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'messageEditWindowMinutes')) {
    next.messageEditWindowMinutes = normalizeMessageEditWindowMinutes(patch.messageEditWindowMinutes)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'ownerAssistEnabled')) {
    next.ownerAssistEnabled = patch.ownerAssistEnabled !== false
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'accountIdleDays')) {
    next.accountIdleDays = normalizeGlobalAccountIdleDays(patch.accountIdleDays)
  }
  await setDoc(
    doc(db, SHARED_STATE_COLLECTION, SHARED_CHAT_DOC),
    next,
    { merge: true },
  )
  return {
    ...(Object.prototype.hasOwnProperty.call(next, 'messageEditWindowMinutes')
      ? { messageEditWindowMinutes: next.messageEditWindowMinutes }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(next, 'ownerAssistEnabled')
      ? { ownerAssistEnabled: next.ownerAssistEnabled }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(next, 'accountIdleDays')
      ? { accountIdleDays: next.accountIdleDays }
      : {}),
  }
}

function normalizeSiteAppearance(data = {}) {
  const raw = String(data?.themeId || '').trim()
  const allowed = new Set(['default', 'natsu'])
  return {
    themeId: allowed.has(raw) ? raw : 'default',
  }
}

/** Site-wide theme (Admin). Everyone can read; writes go through Admin UI. */
export function subscribeSiteAppearance(onData, onError) {
  return onSnapshot(
    doc(db, SHARED_STATE_COLLECTION, SHARED_APPEARANCE_DOC),
    (snapshot) => {
      onData(normalizeSiteAppearance(snapshot.data() || {}), snapshot.exists())
    },
    onError,
  )
}

export async function saveSiteAppearance(patch = {}) {
  const themeId = normalizeSiteAppearance(patch).themeId
  await setDoc(
    doc(db, SHARED_STATE_COLLECTION, SHARED_APPEARANCE_DOC),
    {
      themeId,
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true },
  )
  return { themeId }
}

const APP_RELEASES_COLLECTION = 'app-releases'

function normalizeAppRelease(id, data = {}) {
  return {
    id: String(id || data.version || ''),
    version: String(data.version || id || ''),
    notes: String(data.notes || '').trim(),
    builtAt: data.builtAt || data.createdAtIso || null,
    previousVersion: data.previousVersion ? String(data.previousVersion) : null,
    previousHostingVersionId: data.previousHostingVersionId
      ? String(data.previousHostingVersionId)
      : null,
    hostingVersionId: data.hostingVersionId ? String(data.hostingVersionId) : null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAtIso || null,
  }
}

export function subscribeAppReleases(onData, onError) {
  return onSnapshot(
    query(collection(db, APP_RELEASES_COLLECTION), orderBy('createdAt', 'desc'), limit(40)),
    (snapshot) => {
      const releases = snapshot.docs.map((document) => normalizeAppRelease(document.id, document.data()))
      onData(releases)
    },
    onError,
  )
}

/** Upsert a release note entry (admin). */
export async function recordAppRelease(payload = {}) {
  const version = String(payload.version || '').trim()
  if (!version) throw new Error('version がありません。')
  const notes = String(payload.notes || '').trim()
  if (!notes) throw new Error('リリースノートを入力してください。')
  const nowIso = new Date().toISOString()
  const body = {
    version,
    notes: notes.slice(0, 2000),
    builtAt: payload.builtAt || nowIso,
    previousVersion: payload.previousVersion ? String(payload.previousVersion) : null,
    previousHostingVersionId: payload.previousHostingVersionId
      ? String(payload.previousHostingVersionId)
      : null,
    hostingVersionId: payload.hostingVersionId ? String(payload.hostingVersionId) : null,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
    updatedAt: serverTimestamp(),
    updatedAtIso: nowIso,
  }
  await setDoc(doc(db, APP_RELEASES_COLLECTION, version), body, { merge: true })
  return normalizeAppRelease(version, { ...body, createdAtIso: nowIso })
}

export async function fetchLiveVersionInfo() {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`version fetch ${response.status}`)
  return response.json()
}

export async function fetchReleasesHistoryFile() {
  try {
    const response = await fetch(`/releases-history.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data?.releases) ? data.releases : []
  } catch {
    return []
  }
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

export async function updateMediaCaption(itemId, fields = {}) {
  const id = String(itemId || '').trim()
  if (!id) throw new Error('画像IDがありません。')
  const payload = {}
  if (Object.prototype.hasOwnProperty.call(fields, 'caption')) {
    payload.caption = String(fields.caption || '').trim().slice(0, 280) || null
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'location')) {
    payload.location = String(fields.location || '').trim().slice(0, 80) || null
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'event')) {
    payload.event = String(fields.event || '').trim().slice(0, 80) || null
  }
  if (!Object.keys(payload).length) return
  await setDoc(doc(db, MEDIA_COLLECTION, id), payload, { merge: true })
}

export async function toggleMediaLike(mediaId, profileKey) {
  const id = String(mediaId || '').trim()
  const key = String(profileKey || '').trim().toLowerCase()
  if (!id || !key) throw new Error('いいねできません。')
  const ref = doc(db, MEDIA_COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('画像が見つかりません。')
  const likedBy = Array.isArray(snap.data()?.likedBy)
    ? snap.data().likedBy.map(String)
    : []
  const mine = likedBy.includes(key)
  const next = mine ? likedBy.filter((entry) => entry !== key) : [...likedBy, key]
  await setDoc(ref, {
    likedBy: next,
    likeCount: next.length,
  }, { merge: true })
  return { liked: !mine, likeCount: next.length, likedBy: next }
}

export function subscribeMediaComments(mediaId, onData, onError) {
  const id = String(mediaId || '').trim()
  if (!id) {
    onData([])
    return () => {}
  }
  return onSnapshot(
    query(
      collection(db, MEDIA_COLLECTION, id, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(80),
    ),
    (snapshot) => {
      const comments = snapshot.docs.map((document) => {
        const data = document.data() || {}
        return {
          id: document.id,
          text: String(data.text || ''),
          authorKey: String(data.authorKey || ''),
          authorName: String(data.authorName || data.authorKey || ''),
          createdAt: data.createdAt?.toDate?.()?.toISOString?.()
            || data.createdAtIso
            || null,
        }
      })
      onData(comments)
    },
    onError,
  )
}

export async function addMediaComment(mediaId, { text, authorKey, authorName }) {
  const id = String(mediaId || '').trim()
  const body = String(text || '').trim().slice(0, 400)
  const key = String(authorKey || '').trim().toLowerCase()
  if (!id || !body || !key) throw new Error('コメントを入力してください。')
  const nowIso = new Date().toISOString()
  await addDoc(collection(db, MEDIA_COLLECTION, id, 'comments'), {
    text: body,
    authorKey: key,
    authorName: String(authorName || key).trim() || key,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  })
}

export async function deleteMediaComment(mediaId, commentId) {
  const mid = String(mediaId || '').trim()
  const cid = String(commentId || '').trim()
  if (!mid || !cid) return
  await deleteDoc(doc(db, MEDIA_COLLECTION, mid, 'comments', cid))
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

