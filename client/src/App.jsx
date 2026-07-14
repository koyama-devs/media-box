import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import {
  deleteMediaItem,
  getFirebaseErrorMessage,
  loadMediaBlobUrl,
  MAX_FILE_SIZE,
  recordAccessVisit,
  sortMediaItems,
  subscribeToMediaItems,
  updateMediaCover,
  updateMediaJacket,
  updateMediaJacketStyle,
  updateMediaLyrics,
  updateMediaName,
  updatePlaylistOrder,
  uploadMediaFile,
} from './firebase'
import LyricsPanel from './LyricsPanel'
import VinylPlayer from './VinylPlayer'
import {
  createPlaylistId,
  loadCustomPlaylists,
  loadFavoriteIds,
  loadListFilter,
  saveCustomPlaylists,
  saveFavoriteIds,
  saveListFilter,
} from './userPlaylists'

const AUTH_KEY = 'media-share-lite-auth'
const PASSWORD = 'hiro'
const TRACK_QUERY_KEY = 'track'

function getTrackShareUrl(itemId) {
  const url = new URL(window.location.href)
  url.searchParams.set(TRACK_QUERY_KEY, itemId)
  return url.toString()
}

function syncTrackQuery(itemId) {
  try {
    const url = new URL(window.location.href)
    if (itemId) {
      url.searchParams.set(TRACK_QUERY_KEY, itemId)
    } else {
      url.searchParams.delete(TRACK_QUERY_KEY)
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}

function getMediaKind(fileType, fileName = '') {
  const type = (fileType || '').toLowerCase()
  const extension = (fileName || '').toLowerCase().split('.').pop() || ''

  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'

  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogg'].includes(extension)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(extension)) return 'audio'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image'

  return 'file'
}

function getFileExtension(fileName = '') {
  const base = String(fileName).trim()
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

function getDisplayName(fileName = '') {
  const base = String(fileName).trim()
  if (!base) return '無題'
  const extension = getFileExtension(base)
  if (!extension) return base
  return base.slice(0, -(extension.length + 1)) || base
}

function withOriginalExtension(displayName, originalName = '') {
  const trimmed = String(displayName || '').trim()
  if (!trimmed) return ''

  // User typed an extension themselves — keep as-is
  if (getFileExtension(trimmed)) return trimmed

  const extension = getFileExtension(originalName)
  return extension ? `${trimmed}.${extension}` : trimmed
}

function getKindLabel(kind) {
  if (kind === 'audio') return '音声'
  if (kind === 'video') return '動画'
  if (kind === 'image') return '画像'
  return 'ファイル'
}

function createMediaMetadata(file, extras = {}) {
  return {
    name: getDisplayName(file.name),
    originalName: file.name,
    type: file.type || 'application/octet-stream',
    kind: getMediaKind(file.type, file.name),
    ...extras,
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function HeartIcon({ filled = false }) {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M12 20s-6.4-3.9-8.6-7.2C1.7 10.3 2.5 6.8 5.4 5.6c1.7-.7 3.6-.2 4.8 1.1L12 8.5l1.8-1.8c1.2-1.3 3.1-1.8 4.8-1.1 2.9 1.2 3.7 4.7 2 7.2C18.4 16.1 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlaylistAddIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h11M4 12h8M4 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14v6M13 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.2 10.8 15.7 6.4M8.2 13.2 15.7 17.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.07.07l1.86-1.86a5 5 0 0 0-7.07-7.07L10.4 5.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07-.07L5.07 12.8a5 5 0 0 0 7.07 7.07L13.6 18.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.5 12.5 10 17l8.5-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg className="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19h3.2L18.4 8.8a1.9 1.9 0 0 0 0-2.7L17 4.7a1.9 1.9 0 0 0-2.7 0L4.1 14.9V19z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.4 5.6 17.5 9.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="action-icon action-icon--spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeOpacity="0.25"
      />
      <path
        d="M12 4a8 8 0 0 1 8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return window.localStorage.getItem(AUTH_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFileName, setUploadingFileName] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [playlistMode, setPlaylistMode] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteIds())
  const [customPlaylists, setCustomPlaylists] = useState(() => loadCustomPlaylists())
  const [listFilter, setListFilter] = useState(() => loadListFilter())
  const [playlistMenuItemId, setPlaylistMenuItemId] = useState(null)
  const [playlistMenuPos, setPlaylistMenuPos] = useState(null)
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [playlistNameDraft, setPlaylistNameDraft] = useState('')
  const [renamingPlaylistId, setRenamingPlaylistId] = useState(null)
  const [pendingPlaylistTrackId, setPendingPlaylistTrackId] = useState(null)
  const [isMediaPlaying, setIsMediaPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(0)
  const [lyricsBusy, setLyricsBusy] = useState(false)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null)
  const [jacketPreviewUrl, setJacketPreviewUrl] = useState(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [jacketBusy, setJacketBusy] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [dragItemId, setDragItemId] = useState(null)
  const [dragOverItemId, setDragOverItemId] = useState(null)
  const [copiedItemId, setCopiedItemId] = useState(null)
  const [sharingItemId, setSharingItemId] = useState(null)
  const [sharedItemId, setSharedItemId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [swipeReveal, setSwipeReveal] = useState(null)
  const urlTrackAppliedRef = useRef(false)
  const swipeStartRef = useRef({ x: 0, y: 0, id: null, ignoring: false })
  const swipeOffsetRef = useRef(0)
  const blobUrlsRef = useRef(new Set())
  const mediaUrlCacheRef = useRef(new Map())

  // Ref tới player hiện tại (audio hoặc video)
  const mediaRef = useRef(null)
  
  // Có cần autoplay sau khi đổi bài không
  const shouldAutoPlayRef = useRef(false)
  
  // Đánh dấu media hiện tại đã sẵn sàng
  const mediaReadyRef = useRef(false)
  
  // Tránh play() nhiều lần
  const playRequestRef = useRef(0)

  const previewRequestRef = useRef(0)

  // Đang chuyển bài trong playlist — bỏ qua pause/reset
  const isPlaylistAdvancingRef = useRef(false)

  const playableItems = useMemo(
    () => items.filter((item) => item.kind === 'audio' || item.kind === 'video'),
    [items],
  )

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const visiblePlayableItems = useMemo(() => {
    if (listFilter === 'all') return playableItems
    if (listFilter === 'favorites') {
      return playableItems.filter((item) => favoriteIdSet.has(item.id))
    }
    const playlist = customPlaylists.find((entry) => entry.id === listFilter)
    if (!playlist) return playableItems
    const order = new Map(playlist.trackIds.map((id, index) => [id, index]))
    return playableItems
      .filter((item) => order.has(item.id))
      .sort((a, b) => order.get(a.id) - order.get(b.id))
  }, [playableItems, listFilter, favoriteIdSet, customPlaylists])

  const imageItems = useMemo(
    () => items.filter((item) => item.kind === 'image' && item.inLibrary !== false),
    [items],
  )

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || visiblePlayableItems[0] || playableItems[0] || null,
    [items, selectedItemId, visiblePlayableItems, playableItems],
  )

  const selectedPlayableIndex = useMemo(
    () => visiblePlayableItems.findIndex((item) => item.id === selectedItemId),
    [visiblePlayableItems, selectedItemId],
  )

  const getItemIdAtOffset = useCallback((offset) => {
    if (visiblePlayableItems.length === 0) return null
    const baseIndex = selectedPlayableIndex >= 0 ? selectedPlayableIndex : 0
    const nextIndex = (baseIndex + offset + visiblePlayableItems.length) % visiblePlayableItems.length
    return visiblePlayableItems[nextIndex]?.id || null
  }, [visiblePlayableItems, selectedPlayableIndex])

  useEffect(() => {
    saveFavoriteIds(favoriteIds)
  }, [favoriteIds])

  useEffect(() => {
    saveCustomPlaylists(customPlaylists)
  }, [customPlaylists])

  useEffect(() => {
    saveListFilter(listFilter)
  }, [listFilter])

  useEffect(() => {
    if (listFilter === 'all' || listFilter === 'favorites') return
    if (!customPlaylists.some((playlist) => playlist.id === listFilter)) {
      setListFilter('all')
    }
  }, [listFilter, customPlaylists])

  useEffect(() => {
    if (!playlistMenuItemId) return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.playlist-add-wrap') || target.closest('.playlist-add-menu')) return
      setPlaylistMenuItemId(null)
      setPlaylistMenuPos(null)
    }
    const onRepositionClose = () => {
      setPlaylistMenuItemId(null)
      setPlaylistMenuPos(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onRepositionClose)
    window.addEventListener('scroll', onRepositionClose, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onRepositionClose)
      window.removeEventListener('scroll', onRepositionClose, true)
    }
  }, [playlistMenuItemId])

  const toggleFavorite = useCallback((itemId) => {
    setFavoriteIds((current) => (
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    ))
  }, [])

  const createCustomPlaylist = useCallback((name, initialTrackId = null) => {
    const trimmed = String(name || '').trim().slice(0, 40)
    if (!trimmed) return null
    const playlist = {
      id: createPlaylistId(),
      name: trimmed,
      trackIds: initialTrackId ? [initialTrackId] : [],
    }
    setCustomPlaylists((current) => [...current, playlist])
    return playlist.id
  }, [])

  const renameCustomPlaylist = useCallback((playlistId, name) => {
    const trimmed = String(name || '').trim().slice(0, 40)
    if (!trimmed) return
    setCustomPlaylists((current) =>
      current.map((playlist) => (
        playlist.id === playlistId ? { ...playlist, name: trimmed } : playlist
      )),
    )
  }, [])

  const deleteCustomPlaylist = useCallback((playlistId) => {
    setCustomPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId))
    setListFilter((current) => (current === playlistId ? 'all' : current))
  }, [])

  const toggleTrackInPlaylist = useCallback((playlistId, trackId) => {
    setCustomPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist
        const exists = playlist.trackIds.includes(trackId)
        return {
          ...playlist,
          trackIds: exists
            ? playlist.trackIds.filter((id) => id !== trackId)
            : [...playlist.trackIds, trackId],
        }
      }),
    )
  }, [])

  const ensureMediaUrl = useCallback(async (itemId, mimeType) => {
    const cached = mediaUrlCacheRef.current.get(itemId)
    if (cached) return cached

    const url = await loadMediaBlobUrl(itemId, mimeType)
    mediaUrlCacheRef.current.set(itemId, url)
    blobUrlsRef.current.add(url)
    return url
  }, [])

  const prefetchMediaUrl = useCallback((item) => {
    if (!item || item.kind === 'image') return
    if (mediaUrlCacheRef.current.has(item.id)) return

    ensureMediaUrl(item.id, item.type).catch((err) => {
      console.error('Prefetch failed:', err)
    })
  }, [ensureMediaUrl])

  const selectItem = useCallback((itemId, autoPlay = false) => {

    mediaReadyRef.current = false

    playRequestRef.current++

    shouldAutoPlayRef.current = autoPlay

    setSelectedItemId(itemId)
    syncTrackQuery(itemId)

}, [])

  useEffect(() => {
    recordAccessVisit().catch((accessError) => {
      console.warn('Access log skipped:', accessError)
    })
  }, [])

  useEffect(() => {
    if (urlTrackAppliedRef.current || playableItems.length === 0) return
    urlTrackAppliedRef.current = true
    try {
      const trackId = new URLSearchParams(window.location.search).get(TRACK_QUERY_KEY)
      if (trackId && playableItems.some((item) => item.id === trackId)) {
        selectItem(trackId, false)
      }
    } catch {
      /* ignore */
    }
  }, [playableItems, selectItem])

  const advancePlaylistToItem = useCallback((nextItem, playImmediately = false) => {
    if (!nextItem || nextItem.kind === 'image') return false

    const nextUrl = mediaUrlCacheRef.current.get(nextItem.id)
    const media = mediaRef.current

    if (!playImmediately || !nextUrl || !media) {
      selectItem(nextItem.id, playlistMode)
      return false
    }

    isPlaylistAdvancingRef.current = true
    shouldAutoPlayRef.current = true
    mediaReadyRef.current = false
    playRequestRef.current++

    setSelectedItemId(nextItem.id)
    syncTrackQuery(nextItem.id)
    setPlaybackTime(0)
    setPlaybackDuration(0)
    setPreviewUrl(nextUrl)
    setLoadingPreview(false)

    media.src = nextUrl
    media.load()

    const playPromise = media.play()
    if (playPromise) {
      playPromise
        .then(() => {
          shouldAutoPlayRef.current = false
        })
        .catch(() => {
          // Mobile có thể chặn — handleMediaCanPlay sẽ thử lại
        })
        .finally(() => {
          isPlaylistAdvancingRef.current = false
        })
    } else {
      isPlaylistAdvancingRef.current = false
    }

    return true
  }, [playlistMode, selectItem])

const playNext = useCallback(() => {

  const nextId = getItemIdAtOffset(1)

  if (!nextId) return

  selectItem(
      nextId,
      playlistMode
  )

}, [
  getItemIdAtOffset,
  playlistMode,
  selectItem
])

const playPrevious = useCallback(() => {

  const prevId = getItemIdAtOffset(-1)

  if (!prevId) return

  selectItem(
      prevId,
      playlistMode
  )

}, [
  getItemIdAtOffset,
  playlistMode,
  selectItem
])

  const autoPlayCurrentMedia = useCallback(async () => {
    if (!shouldAutoPlayRef.current) return
  
    const media = mediaRef.current
  
    if (!media) return
  
    try {
      await media.play()
      shouldAutoPlayRef.current = false
    } catch (err) {
      console.log('Autoplay blocked:', err.name, err.message)
    }
  }, [])

  const handleMediaCanPlay = useCallback(() => {
    mediaReadyRef.current = true
  
    autoPlayCurrentMedia()
  }, [autoPlayCurrentMedia])

  const handleMediaPlay = useCallback(() => {
    setIsMediaPlaying(true)
  }, [])

  const handleMediaPause = useCallback(() => {
    setIsMediaPlaying(false)
  }, [])

  const handleMediaTimeUpdate = useCallback((event) => {
    setPlaybackTime(event.currentTarget.currentTime || 0)
    const nextDuration = event.currentTarget.duration
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      setPlaybackDuration(nextDuration)
    }
  }, [])

  const handleMediaDuration = useCallback((event) => {
    const nextDuration = event.currentTarget.duration
    setPlaybackDuration(Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 0)
  }, [])

  const handleSeekAudio = useCallback((time) => {
    const media = mediaRef.current
    if (!media || !Number.isFinite(time)) return
    media.currentTime = Math.max(0, time)
    setPlaybackTime(media.currentTime || time)
  }, [])

  const handleSaveLyrics = async (lyrics) => {
    if (!selectedItem || selectedItem.kind !== 'audio') return
    setLyricsBusy(true)
    setError('')
    try {
      await updateMediaLyrics(selectedItem.id, lyrics)
    } catch (lyricsError) {
      console.error(lyricsError)
      setError(lyricsError?.message || getFirebaseErrorMessage(lyricsError) || '歌詞の保存に失敗しました。')
      throw lyricsError
    } finally {
      setLyricsBusy(false)
    }
  }

  const handleClearLyrics = async () => {
    if (!selectedItem || selectedItem.kind !== 'audio') return
    setLyricsBusy(true)
    setError('')
    try {
      await updateMediaLyrics(selectedItem.id, null)
    } catch (lyricsError) {
      console.error(lyricsError)
      setError(lyricsError?.message || getFirebaseErrorMessage(lyricsError) || '歌詞の削除に失敗しました。')
      throw lyricsError
    } finally {
      setLyricsBusy(false)
    }
  }

  const handleTogglePlayback = useCallback(async () => {
    const media = mediaRef.current
    if (!media) return

    try {
      if (media.paused) {
        await media.play()
      } else {
        media.pause()
      }
    } catch (err) {
      console.log('Toggle playback failed:', err.name, err.message)
    }
  }, [])

  const handleSeekToLyric = useCallback(async (time) => {
    const media = mediaRef.current
    if (!media || !Number.isFinite(time)) return

    try {
      media.currentTime = Math.max(0, time)
      setPlaybackTime(media.currentTime || time)
      await media.play()
    } catch (err) {
      console.log('Seek lyric failed:', err.name, err.message)
    }
  }, [])

  const uploadPrivateImage = async (file, usage) => {
    const kind = getMediaKind(file.type, file.name)
    if (kind !== 'image') {
      throw new Error('画像ファイルを選択してください。')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`ファイルは${formatSize(MAX_FILE_SIZE)}以下にしてください。`)
    }

    const metadata = createMediaMetadata(file, {
      inLibrary: false,
      usage,
    })
    return uploadMediaFile(file, metadata)
  }

  const cleanupPrivateImage = async (imageId) => {
    if (!imageId) return
    const previous = items.find((item) => item.id === imageId)
    const stillUsed = items.some(
      (item) =>
        item.id !== selectedItem?.id &&
        item.kind === 'audio' &&
        (item.coverId === imageId || item.jacketId === imageId),
    )
    if (previous?.inLibrary === false && !stillUsed) {
      await deleteMediaItem(imageId)
      mediaUrlCacheRef.current.delete(imageId)
    }
  }

  const handleCoverPick = async (file) => {
    if (!selectedItem || selectedItem.kind !== 'audio') return

    setCoverBusy(true)
    setError('')
    const previousCoverId = selectedItem.coverId || null

    try {
      const coverId = await uploadPrivateImage(file, 'cover')
      await updateMediaCover(selectedItem.id, coverId)
      await cleanupPrivateImage(previousCoverId === coverId ? null : previousCoverId)
    } catch (coverError) {
      console.error(coverError)
      setError(coverError?.message || getFirebaseErrorMessage(coverError) || 'カバー画像の設定に失敗しました。')
    } finally {
      setCoverBusy(false)
    }
  }

  const handleCoverClear = async () => {
    if (!selectedItem || selectedItem.kind !== 'audio') return

    setCoverBusy(true)
    setError('')
    const previousCoverId = selectedItem.coverId || null

    try {
      await updateMediaCover(selectedItem.id, null)
      setCoverPreviewUrl(null)
      await cleanupPrivateImage(previousCoverId)
    } catch (coverError) {
      console.error(coverError)
      setError('カバー画像の削除に失敗しました。')
    } finally {
      setCoverBusy(false)
    }
  }

  const handleJacketPick = async (file) => {
    if (!selectedItem || selectedItem.kind !== 'audio') return

    setJacketBusy(true)
    setError('')
    const previousJacketId = selectedItem.jacketId || null

    try {
      const jacketId = await uploadPrivateImage(file, 'jacket')
      await updateMediaJacket(selectedItem.id, jacketId)
      await cleanupPrivateImage(previousJacketId === jacketId ? null : previousJacketId)
    } catch (jacketError) {
      console.error(jacketError)
      setError(jacketError?.message || getFirebaseErrorMessage(jacketError) || 'ジャケット画像の設定に失敗しました。')
    } finally {
      setJacketBusy(false)
    }
  }

  const handleJacketClear = async () => {
    if (!selectedItem || selectedItem.kind !== 'audio') return

    setJacketBusy(true)
    setError('')
    const previousJacketId = selectedItem.jacketId || null

    try {
      await updateMediaJacket(selectedItem.id, null)
      setJacketPreviewUrl(null)
      await cleanupPrivateImage(previousJacketId)
    } catch (jacketError) {
      console.error(jacketError)
      setError('ジャケット画像の削除に失敗しました。')
    } finally {
      setJacketBusy(false)
    }
  }

  const handleJacketStyleChange = async (styleId) => {
    if (!selectedItem || selectedItem.kind !== 'audio') return

    setJacketBusy(true)
    setError('')

    try {
      await updateMediaJacketStyle(selectedItem.id, styleId)
    } catch (jacketError) {
      console.error(jacketError)
      setError(jacketError?.message || getFirebaseErrorMessage(jacketError) || 'ジャケットスタイルの保存に失敗しました。')
    } finally {
      setJacketBusy(false)
    }
  }

  const handleAssignCoverFromLibrary = async (coverId) => {
    if (!selectedItem || selectedItem.kind !== 'audio') {
      setError('先に音声トラックを選択してください。')
      return
    }

    setCoverBusy(true)
    setError('')

    try {
      await updateMediaCover(selectedItem.id, coverId)
    } catch (coverError) {
      console.error(coverError)
      setError('カバー画像の設定に失敗しました。')
    } finally {
      setCoverBusy(false)
    }
  }

  const startPlaylist = useCallback(() => {
    const queue = visiblePlayableItems.length > 0 ? visiblePlayableItems : playableItems
    if (queue.length === 0) return
    setPlaylistMode(true)
    const inQueue =
      selectedItem &&
      selectedItem.kind !== 'image' &&
      queue.some((item) => item.id === selectedItem.id)
    const startId = inQueue ? selectedItem.id : queue[0].id
    selectItem(startId, true)
  }, [visiblePlayableItems, playableItems, selectedItem, selectItem])

  const handleMediaEnded = useCallback(() => {
    if (!playlistMode) return
    if (visiblePlayableItems.length <= 1) return

    const nextId = getItemIdAtOffset(1)
    if (!nextId) return

    const nextItem = visiblePlayableItems.find((item) => item.id === nextId)
    if (!nextItem) return

    // Gọi play() đồng bộ trong ended — mobile chỉ cho phép trong chuỗi sự kiện này
    if (!advancePlaylistToItem(nextItem, true)) {
      playNext()
    }
  }, [
    playlistMode,
    visiblePlayableItems,
    getItemIdAtOffset,
    advancePlaylistToItem,
    playNext,
  ])

  useEffect(() => {
    if (!isLoggedIn) {
      setItems([])
      setSelectedItemId(null)
      setLoadingItems(false)
      return undefined
    }

    setLoadingItems(true)

    const unsubscribe = subscribeToMediaItems(
      (nextItems) => {
        setItems(nextItems)
        setSelectedItemId((currentId) => {
          if (currentId && nextItems.some((item) => item.id === currentId)) {
            return currentId
          }
          const firstPlayable = nextItems.find(
            (item) => item.kind === 'audio' || item.kind === 'video',
          )
          return firstPlayable?.id || null
        })
        setLoadingItems(false)
      },
      (loadError) => {
        console.error(loadError)
        setError(getFirebaseErrorMessage(loadError))
        setLoadingItems(false)
      },
    )

    return unsubscribe
  }, [isLoggedIn])

  useEffect(() => {
    const currentUrls = new Set([
      ...(previewUrl?.startsWith('blob:') ? [previewUrl] : []),
      ...mediaUrlCacheRef.current.values(),
    ])

    blobUrlsRef.current.forEach((url) => {
      if (!currentUrls.has(url)) {
        URL.revokeObjectURL(url)
      }
    })

    blobUrlsRef.current = currentUrls
  }, [previewUrl])

  useEffect(() => {
    setIsMediaPlaying(false)
    setPlaybackTime(0)
    setPlaybackDuration(0)
  }, [selectedItem?.id])

  useEffect(() => {
    if (selectedItem?.kind !== 'audio' || !selectedItem.coverId) {
      setCoverPreviewUrl(null)
      return undefined
    }

    const coverItem = items.find((item) => item.id === selectedItem.coverId)
    if (!coverItem) {
      setCoverPreviewUrl(null)
      return undefined
    }

    let cancelled = false

    ensureMediaUrl(coverItem.id, coverItem.type)
      .then((url) => {
        if (!cancelled) {
          setCoverPreviewUrl(url)
        }
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setCoverPreviewUrl(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedItem?.id, selectedItem?.kind, selectedItem?.coverId, items, ensureMediaUrl])

  useEffect(() => {
    if (selectedItem?.kind !== 'audio' || !selectedItem.jacketId) {
      setJacketPreviewUrl(null)
      return undefined
    }

    const jacketItem = items.find((item) => item.id === selectedItem.jacketId)
    if (!jacketItem) {
      setJacketPreviewUrl(null)
      return undefined
    }

    let cancelled = false

    ensureMediaUrl(jacketItem.id, jacketItem.type)
      .then((url) => {
        if (!cancelled) {
          setJacketPreviewUrl(url)
        }
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setJacketPreviewUrl(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedItem?.id, selectedItem?.kind, selectedItem?.jacketId, items, ensureMediaUrl])

  useEffect(() => {

    if (!selectedItem) {
      mediaReadyRef.current = false
      playRequestRef.current++
        setPreviewUrl(null)
        setLoadingPreview(false)
        return
    }

    const cachedUrl = mediaUrlCacheRef.current.get(selectedItem.id)
    if (cachedUrl) {
      setPreviewUrl(cachedUrl)
      setLoadingPreview(false)
      return
    }

    const requestId = ++previewRequestRef.current

    setLoadingPreview(true)
    setPreviewUrl(null)

    ensureMediaUrl(
        selectedItem.id,
        selectedItem.type
    )
        .then((url) => {

            // Nếu trong lúc đang tải người dùng đã chuyển bài,
            // bỏ luôn kết quả cũ.

            if (requestId !== previewRequestRef.current) {
                return
            }

            setPreviewUrl(url)
            setLoadingPreview(false)

        })
        .catch((err) => {

            if (requestId !== previewRequestRef.current)
                return

            console.error(err)

            setError(
                getFirebaseErrorMessage(err)
            )

            setLoadingPreview(false)

        })

}, [
    selectedItem?.id,
    selectedItem?.type,
    ensureMediaUrl,
])

  useEffect(() => {
    if (!playlistMode || !selectedItem || selectedItem.kind === 'image') return

    const nextId = getItemIdAtOffset(1)
    if (!nextId) return

    const nextItem = visiblePlayableItems.find((item) => item.id === nextId)
    prefetchMediaUrl(nextItem)
  }, [
    playlistMode,
    selectedItem?.id,
    selectedItem?.kind,
    visiblePlayableItems,
    getItemIdAtOffset,
    prefetchMediaUrl,
  ])

    useEffect(() => {

      if (!playlistMode) return

      if (!previewUrl) return

      if (loadingPreview) return

      if (!shouldAutoPlayRef.current) return

      if (selectedItem?.kind === 'image') return

      if (!mediaReadyRef.current) return

      autoPlayCurrentMedia()

  }, [
      previewUrl,
      loadingPreview,
      playlistMode,
      selectedItem?.id,
      selectedItem?.kind,
      autoPlayCurrentMedia
  ])

    useEffect(() => {

      if (isPlaylistAdvancingRef.current || shouldAutoPlayRef.current) return

      const media = mediaRef.current

      if (!media) return

      media.pause()

      media.currentTime = 0

  }, [
      selectedItem?.id
  ])

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [])

  const handleLogin = (event) => {
    event.preventDefault()

    if (password === PASSWORD) {
      try {
        window.localStorage.setItem(AUTH_KEY, 'true')
      } catch {
        // Ignore storage errors and keep the app working.
      }
      setIsLoggedIn(true)
      setError('')
      return
    }

    setError('パスワードが違います。')
  }

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(AUTH_KEY)
    } catch {
      // Ignore storage errors and keep the app working.
    }
    setIsLoggedIn(false)
    setPassword('')
    setError('')
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const kind = getMediaKind(file.type, file.name)
    if (kind === 'file') {
      setError('動画・音声・画像ファイルのみ対応しています。')
      event.target.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`ファイルは${formatSize(MAX_FILE_SIZE)}以下にしてください。`)
      event.target.value = ''
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadingFileName(file.name)
    setError('')

    try {
      const metadata = createMediaMetadata(file, {
        inLibrary: kind === 'image',
        ...(kind === 'image'
          ? {}
          : {
              order:
                playableItems.reduce(
                  (max, item) => Math.max(max, typeof item.order === 'number' ? item.order : -1),
                  -1,
                ) + 1,
            }),
      })
      const id = await uploadMediaFile(file, metadata, setUploadProgress)
      // Ảnh thư viện không nhảy sang preview / playlist
      if (kind !== 'image') {
        setSelectedItemId(id)
      }
      setLoadingItems(false)
    } catch (uploadError) {
      console.error(uploadError)
      setError(getFirebaseErrorMessage(uploadError))
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setUploadingFileName('')
      event.target.value = ''
    }
  }

  const startRename = (item, event) => {
    event?.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(getDisplayName(item.name || ''))
  }

  const cancelRename = () => {
    setEditingItemId(null)
    setEditingName('')
  }

  const saveRename = async (itemId) => {
    const current = items.find((item) => item.id === itemId)
    const nextName = withOriginalExtension(
      editingName,
      current?.originalName || current?.name || '',
    )

    if (!nextName) {
      setError('名前を入力してください。')
      return
    }

    if (current?.name === nextName) {
      cancelRename()
      return
    }

    try {
      await updateMediaName(itemId, nextName)
      cancelRename()
      setError('')
    } catch (renameError) {
      console.error(renameError)
      setError(renameError?.message || '名前の変更に失敗しました。')
    }
  }

  const reorderPlayableItems = async (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return

    // Custom playlist order stays on this device only
    if (listFilter !== 'all' && listFilter !== 'favorites') {
      setCustomPlaylists((current) =>
        current.map((playlist) => {
          if (playlist.id !== listFilter) return playlist
          const ids = [...playlist.trackIds]
          const fromIndex = ids.indexOf(fromId)
          const toIndex = ids.indexOf(toId)
          if (fromIndex < 0 || toIndex < 0) return playlist
          const [moved] = ids.splice(fromIndex, 1)
          ids.splice(toIndex, 0, moved)
          return { ...playlist, trackIds: ids }
        }),
      )
      return
    }

    if (listFilter !== 'all') return

    const currentIds = playableItems.map((item) => item.id)
    const fromIndex = currentIds.indexOf(fromId)
    const toIndex = currentIds.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) return

    const nextIds = [...currentIds]
    const [moved] = nextIds.splice(fromIndex, 1)
    nextIds.splice(toIndex, 0, moved)

    // Optimistic local update while Firestore catches up
    setItems((prev) => {
      const orderMap = new Map(nextIds.map((id, index) => [id, index]))
      return sortMediaItems(
        prev.map((item) =>
          orderMap.has(item.id) ? { ...item, order: orderMap.get(item.id) } : item,
        ),
      )
    })

    try {
      await updatePlaylistOrder(nextIds)
      setError('')
    } catch (reorderError) {
      console.error(reorderError)
      setError('並び替えに失敗しました。')
    }
  }

  const canReorderList = listFilter === 'all' || (listFilter !== 'favorites' && customPlaylists.some((p) => p.id === listFilter))

  const submitCreatePlaylist = () => {
    const id = createCustomPlaylist(playlistNameDraft, pendingPlaylistTrackId)
    if (!id) return
    setPlaylistNameDraft('')
    setCreatingPlaylist(false)
    setPendingPlaylistTrackId(null)
    setListFilter(id)
  }

  const copyTrackLink = async (itemId) => {
    try {
      await navigator.clipboard.writeText(getTrackShareUrl(itemId))
      setCopiedItemId(itemId)
      window.setTimeout(() => {
        setCopiedItemId((current) => (current === itemId ? null : current))
      }, 1600)
    } catch (copyError) {
      console.error(copyError)
      setError('リンクのコピーに失敗しました。')
    }
  }

  const shareTrack = async (item) => {
    if (!item || (item.kind !== 'audio' && item.kind !== 'video')) return
    if (sharingItemId) return

    const fileName = item.name || 'media'
    const displayName = getDisplayName(fileName)

    setSharingItemId(item.id)
    setError('')

    let createdObjectUrl = null
    try {
      const url = await ensureMediaUrl(item.id, item.type)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('ファイルの取得に失敗しました。')
      }
      const blob = await response.blob()
      const file = new File([blob], fileName, {
        type: item.type || blob.type || 'application/octet-stream',
      })

      const canShareFiles =
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function' &&
        navigator.canShare({ files: [file] })

      if (canShareFiles) {
        try {
          await navigator.share({
            files: [file],
            title: fileName,
            text: fileName,
          })
          setSharedItemId(item.id)
          window.setTimeout(() => {
            setSharedItemId((current) => (current === item.id ? null : current))
          }, 1600)
          return
        } catch (shareError) {
          if (shareError?.name === 'AbortError') return
          // Fall through to anchor download
        }
      }

      createdObjectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = createdObjectUrl
      anchor.download = fileName
      anchor.rel = 'noopener'
      anchor.setAttribute('download', fileName)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()

      setSharedItemId(item.id)
      window.setTimeout(() => {
        setSharedItemId((current) => (current === item.id ? null : current))
      }, 1600)
    } catch (shareError) {
      console.error(shareError)
      setError(shareError?.message || `「${displayName}」の共有に失敗しました。`)
    } finally {
      if (createdObjectUrl) {
        window.setTimeout(() => URL.revokeObjectURL(createdObjectUrl), 30_000)
      }
      setSharingItemId(null)
    }
  }

  const requestDelete = (itemId) => {
    setPendingDeleteId(itemId)
    setSwipeReveal(null)
  }

  const cancelDelete = () => {
    setPendingDeleteId(null)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    const itemId = pendingDeleteId
    setPendingDeleteId(null)
    await handleDelete(itemId)
  }

  useEffect(() => {
    if (!pendingDeleteId) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') cancelDelete()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDeleteId])

  const handleDelete = async (itemId) => {
    const target = items.find((item) => item.id === itemId)
    if (!target) return

    try {
      if (target.kind === 'image') {
        const linkedAudios = items.filter(
          (item) =>
            item.kind === 'audio' &&
            (item.coverId === itemId || item.jacketId === itemId),
        )
        await Promise.all(
          linkedAudios.map(async (item) => {
            if (item.coverId === itemId) {
              await updateMediaCover(item.id, null)
            }
            if (item.jacketId === itemId) {
              await updateMediaJacket(item.id, null)
            }
          }),
        )
        if (selectedItem?.coverId === itemId) {
          setCoverPreviewUrl(null)
        }
        if (selectedItem?.jacketId === itemId) {
          setJacketPreviewUrl(null)
        }
      }

      await deleteMediaItem(itemId)
      if (editingItemId === itemId) {
        setEditingItemId(null)
        setEditingName('')
      }
      if (selectedItemId === itemId) {

        if (mediaRef.current) {
            mediaRef.current.pause()
        }
    
        if (previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl)
        }
    
        setPreviewUrl(null)
    
    }
    } catch (deleteError) {
      console.error(deleteError)
      setError('削除に失敗しました。')
    }
  }

  return (
    <div className="app-shell">
      {!isLoggedIn ? (
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">M</div>
          <p className="eyebrow">共有用メディアボックス</p>
          <h1>動画・音声・画像を簡単に共有できます。</h1>
          <p className="lead">ログインしてファイルを追加し、すぐに確認できます。</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="sr-only" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              placeholder="パスワードを入力"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit">ログイン</button>
          </form>

          {error ? <p className="message error">{error}</p> : null}
        </section>
      ) : (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">共有メディアスペース</p>
              <h2>メディア共有</h2>
            </div>
            <div className="topbar-stats">
              <span className="stat-badge">{playableItems.length} 件</span>
              <span className="stat-badge">{playableItems.reduce((sum, item) => sum + (item.size || 0), 0) ? formatSize(playableItems.reduce((sum, item) => sum + (item.size || 0), 0)) : '0 MB'}</span>
              <button type="button" className="secondary-button" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </header>

          <section className="upload-card">
            <div>
              <p className="eyebrow">すぐアップロード</p>
              <h3>メディアを共有ボックスへ追加</h3>
              <p className="hint">1ファイルあたり最大 {formatSize(MAX_FILE_SIZE)}。画像は画像ライブラリへ入ります。</p>
              {uploading ? (
                <div className="upload-progress-wrap">
                  <p className="upload-progress-label">
                    {uploadingFileName} — {uploadProgress}%
                  </p>
                  <div className="upload-progress-track" aria-hidden="true">
                    <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
            <label className={`upload-button ${uploading ? 'disabled' : ''}`} htmlFor="video-upload">
              {uploading ? 'アップロード中...' : 'ファイルを追加'}
            </label>
            <input id="video-upload" type="file" accept="video/*,audio/*,image/*" disabled={uploading} onChange={handleUpload} />
          </section>

          {error ? <p className="message error">{error}</p> : null}

          <main className="content-grid">
            <section className="player-card">
              {loadingItems ? (
                <div className="empty-state">
                  <h3>読み込み中...</h3>
                  <p>クラウドからメディア一覧を取得しています。</p>
                </div>
              ) : selectedItem ? (
                <>
                  <div className="player-header">
                    <div>
                      <p className="eyebrow">プレビュー</p>
                      <h3>{getDisplayName(selectedItem.name)}</h3>
                    </div>
                    <div className="player-actions">
                      <button type="button" className="secondary-button" onClick={playPrevious} disabled={visiblePlayableItems.length < 2}>
                        前へ
                      </button>
                      <button type="button" className="secondary-button" onClick={playNext} disabled={visiblePlayableItems.length < 2}>
                        次へ
                      </button>
                      <button
                        type="button"
                        className={`playlist-toggle ${playlistMode ? 'is-on' : 'is-off'}`}
                        onClick={() => setPlaylistMode((current) => !current)}
                        aria-pressed={playlistMode}
                        title={playlistMode ? '連続再生をオフにする' : '連続再生をオンにする'}
                      >
                        <span className="playlist-toggle-label">連続再生</span>
                        <span className="playlist-toggle-track" aria-hidden="true">
                          <span className="playlist-toggle-knob" />
                          <span className="playlist-toggle-state">
                            {playlistMode ? 'ON' : 'OFF'}
                          </span>
                        </span>
                      </button>
                      <button type="button" className="primary-button" onClick={startPlaylist} disabled={visiblePlayableItems.length === 0 && playableItems.length === 0}>
                        リスト再生
                      </button>
                      <button type="button" className="danger-button" onClick={() => requestDelete(selectedItem.id)}>
                        削除
                      </button>
                    </div>
                  </div>

                  {loadingPreview ? (
                    <div className="empty-state">
                      <h3>プレビュー読み込み中...</h3>
                    </div>
                  ) : previewUrl ? (
                    <>
                      {selectedItem.kind === 'image' ? (
                        <img
                          key={selectedItem.id}
                          className="media-preview"
                          src={previewUrl}
                          alt={selectedItem.name}
                        />
                      ) : selectedItem.kind === 'audio' ? (
                        <>
                        <VinylPlayer
                          title={getDisplayName(selectedItem.name)}
                          coverSrc={coverPreviewUrl}
                          jacketSrc={jacketPreviewUrl}
                          jacketStyleId={selectedItem.jacketStyle || null}
                          trackId={selectedItem.id}
                          isPlaying={isMediaPlaying}
                          currentTime={playbackTime}
                          duration={playbackDuration}
                          coverBusy={coverBusy}
                          jacketBusy={jacketBusy}
                          onCoverPick={handleCoverPick}
                          onCoverClear={handleCoverClear}
                          onJacketPick={handleJacketPick}
                          onJacketClear={handleJacketClear}
                          onJacketStyleChange={handleJacketStyleChange}
                          onTogglePlayback={handleTogglePlayback}
                          onSeek={handleSeekAudio}
                        >
                          <audio
                            ref={mediaRef}
                            className="sr-only"
                            preload="auto"
                            src={previewUrl}
                            onCanPlayThrough={handleMediaCanPlay}
                            onLoadedMetadata={handleMediaDuration}
                            onDurationChange={handleMediaDuration}
                            onEnded={handleMediaEnded}
                            onPlay={handleMediaPlay}
                            onPause={handleMediaPause}
                            onTimeUpdate={handleMediaTimeUpdate}
                            onSeeked={handleMediaTimeUpdate}
                          />
                        </VinylPlayer>
                        <LyricsPanel
                          key={selectedItem.id}
                          trackId={selectedItem.id}
                          lyrics={selectedItem.lyrics}
                          currentTime={playbackTime}
                          isPlaying={isMediaPlaying}
                          busy={lyricsBusy}
                          onSave={handleSaveLyrics}
                          onClear={handleClearLyrics}
                          onSeek={handleSeekToLyric}
                        />
                        </>
                      ) : (
                        <video
                          ref={mediaRef}
                          className="video-player"
                          controls
                          playsInline
                          preload="auto"
                          src={previewUrl}
                          onCanPlayThrough={handleMediaCanPlay}
                          onEnded={handleMediaEnded}
                          onPlay={handleMediaPlay}
                          onPause={handleMediaPause}
                          onTimeUpdate={handleMediaTimeUpdate}
                          onSeeked={handleMediaTimeUpdate}
                        />
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <h3>プレビューを読み込めませんでした。</h3>
                    </div>
                  )}

                  <div className="video-meta">
                    <span className={`kind-badge kind-${selectedItem.kind}`}>
                      {getKindLabel(selectedItem.kind)}
                    </span>
                    <span>{formatSize(selectedItem.size)}</span>
                    <span>{new Date(selectedItem.createdAt).toLocaleString('ja-JP')}</span>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>まだメディアがありません。</h3>
                  <p>最初のファイルを追加して共有を始めましょう。</p>
                </div>
              )}
            </section>

            <aside className="list-card">
              <div className="list-header">
                <h3>再生リスト</h3>
                <span>{visiblePlayableItems.length} 件</span>
              </div>

              <div className="list-filter-tabs" role="tablist" aria-label="リストフィルター">
                <button
                  type="button"
                  role="tab"
                  aria-selected={listFilter === 'all'}
                  className={`list-filter-tab${listFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('all')}
                >
                  すべて
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={listFilter === 'favorites'}
                  className={`list-filter-tab${listFilter === 'favorites' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('favorites')}
                >
                  お気に入り
                  {favoriteIds.length > 0 ? (
                    <span className="list-filter-count">{favoriteIds.length}</span>
                  ) : null}
                </button>
                {customPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    role="tab"
                    aria-selected={listFilter === playlist.id}
                    className={`list-filter-tab${listFilter === playlist.id ? ' is-active' : ''}`}
                    onClick={() => setListFilter(playlist.id)}
                    onDoubleClick={() => {
                      setRenamingPlaylistId(playlist.id)
                      setPlaylistNameDraft(playlist.name)
                    }}
                    title="ダブルクリックで名前変更"
                  >
                    {playlist.name}
                    {playlist.trackIds.length > 0 ? (
                      <span className="list-filter-count">{playlist.trackIds.length}</span>
                    ) : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="list-filter-tab list-filter-tab--add"
                  onClick={() => {
                    setCreatingPlaylist(true)
                    setRenamingPlaylistId(null)
                    setPendingPlaylistTrackId(null)
                    setPlaylistNameDraft('')
                  }}
                  title="プレイリストを作成"
                  aria-label="プレイリストを作成"
                >
                  ＋
                </button>
              </div>

              {creatingPlaylist || renamingPlaylistId ? (
                <form
                  className="playlist-name-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (renamingPlaylistId) {
                      renameCustomPlaylist(renamingPlaylistId, playlistNameDraft)
                      setRenamingPlaylistId(null)
                      setPlaylistNameDraft('')
                    } else {
                      submitCreatePlaylist()
                    }
                  }}
                >
                  <input
                    autoFocus
                    value={playlistNameDraft}
                    placeholder="例: 英語学習"
                    maxLength={40}
                    onChange={(event) => setPlaylistNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setCreatingPlaylist(false)
                        setRenamingPlaylistId(null)
                        setPlaylistNameDraft('')
                        setPendingPlaylistTrackId(null)
                      }
                    }}
                    aria-label="プレイリスト名"
                  />
                  <button type="submit" className="icon-button" title="保存">✓</button>
                  <button
                    type="button"
                    className="icon-button"
                    title="キャンセル"
                    onClick={() => {
                      setCreatingPlaylist(false)
                      setRenamingPlaylistId(null)
                      setPlaylistNameDraft('')
                      setPendingPlaylistTrackId(null)
                    }}
                  >
                    ×
                  </button>
                  {renamingPlaylistId ? (
                    <button
                      type="button"
                      className="icon-button danger"
                      title="このプレイリストを削除"
                      onClick={() => {
                        deleteCustomPlaylist(renamingPlaylistId)
                        setRenamingPlaylistId(null)
                        setPlaylistNameDraft('')
                      }}
                    >
                      削除
                    </button>
                  ) : null}
                </form>
              ) : null}

              {listFilter === 'favorites' ? (
                <p className="playlist-hint">この端末のお気に入りです。ハートで追加・解除できます。</p>
              ) : listFilter !== 'all' ? (
                <p className="playlist-hint">
                  この端末だけのプレイリストです。＋で曲を追加、ドラッグで並び替え。
                  {listFilter !== 'favorites' ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="playlist-inline-action"
                        onClick={() => {
                          const playlist = customPlaylists.find((entry) => entry.id === listFilter)
                          if (!playlist) return
                          setRenamingPlaylistId(playlist.id)
                          setPlaylistNameDraft(playlist.name)
                        }}
                      >
                        名前変更 / 削除
                      </button>
                    </>
                  ) : null}
                </p>
              ) : playableItems.length > 1 ? (
                <p className="playlist-hint">
                  ドラッグで並び替え、リンク共有・ファイル共有
                  <span className="playlist-hint-desktop">
                    ・
                    <span className="hint-rename-icon" aria-hidden="true">
                      <RenameIcon />
                    </span>
                    {' '}で編集
                  </span>
                  <span className="playlist-hint-mobile"> · 右スワイプで編集 / 左スワイプで削除</span>
                </p>
              ) : null}
              {sharingItemId ? (
                <p className="share-status" role="status" aria-live="polite">
                  「{items.find((entry) => entry.id === sharingItemId)?.name || 'media'}」を準備中...
                </p>
              ) : null}

              {loadingItems ? (
                <div className="empty-list">
                  <p>読み込み中...</p>
                </div>
              ) : playableItems.length === 0 ? (
                <div className="empty-list">
                  <p>音声・動画を追加するとここに表示されます。</p>
                </div>
              ) : visiblePlayableItems.length === 0 ? (
                <div className="empty-list">
                  <p>
                    {listFilter === 'favorites'
                      ? 'お気に入りはまだありません。ハートを押して追加できます。'
                      : 'このプレイリストは空です。曲の＋から追加してください。'}
                  </p>
                </div>
              ) : (
                <ul className="video-list">
                  {visiblePlayableItems.map((item) => {
                    const swipeMode = swipeReveal?.id === item.id ? swipeReveal.mode : null
                    const baseOffset = swipeMode === 'delete' ? -72 : swipeMode === 'rename' ? 72 : 0
                    const isFavorite = favoriteIdSet.has(item.id)
                    const allowDrag = canReorderList && editingItemId !== item.id && !swipeMode
                    return (
                    <li
                      key={item.id}
                      className={[
                        'video-item',
                        selectedItem?.id === item.id ? 'active' : '',
                        dragItemId === item.id ? 'is-dragging' : '',
                        dragOverItemId === item.id ? 'is-drag-over' : '',
                        swipeMode === 'delete' ? 'is-swiped-delete' : '',
                        swipeMode === 'rename' ? 'is-swiped-rename' : '',
                      ].filter(Boolean).join(' ')}
                      draggable={allowDrag}
                      onDragStart={(event) => {
                        if (!allowDrag) {
                          event.preventDefault()
                          return
                        }
                        if (swipeReveal) setSwipeReveal(null)
                        setDragItemId(item.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', item.id)
                      }}
                      onDragOver={(event) => {
                        if (!canReorderList) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        if (dragOverItemId !== item.id) {
                          setDragOverItemId(item.id)
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverItemId === item.id) {
                          setDragOverItemId(null)
                        }
                      }}
                      onDrop={(event) => {
                        if (!canReorderList) return
                        event.preventDefault()
                        const fromId = event.dataTransfer.getData('text/plain') || dragItemId
                        setDragItemId(null)
                        setDragOverItemId(null)
                        reorderPlayableItems(fromId, item.id)
                      }}
                      onDragEnd={() => {
                        setDragItemId(null)
                        setDragOverItemId(null)
                      }}
                    >
                      <div
                        className="video-item-swipe-action video-item-swipe-action--rename"
                        aria-hidden={swipeMode !== 'rename'}
                      >
                        <button
                          type="button"
                          className="swipe-rename-btn"
                          tabIndex={swipeMode === 'rename' ? 0 : -1}
                          title="名前を変更"
                          aria-label="名前を変更"
                          onClick={(event) => {
                            setSwipeReveal(null)
                            startRename(item, event)
                          }}
                        >
                          <span className="swipe-rename-icon" aria-hidden="true">
                            <RenameIcon />
                          </span>
                        </button>
                      </div>

                      <div
                        className="video-item-swipe-action video-item-swipe-action--delete"
                        aria-hidden={swipeMode !== 'delete'}
                      >
                        <button
                          type="button"
                          className="swipe-delete-btn"
                          tabIndex={swipeMode === 'delete' ? 0 : -1}
                          onClick={() => requestDelete(item.id)}
                        >
                          削除
                        </button>
                      </div>

                      <div
                        className="video-item-body"
                        onTouchStart={(event) => {
                          const touch = event.touches[0]
                          if (!touch) return
                          swipeStartRef.current = {
                            x: touch.clientX,
                            y: touch.clientY,
                            id: item.id,
                            ignoring: false,
                          }
                          swipeOffsetRef.current = baseOffset
                        }}
                        onTouchMove={(event) => {
                          const touch = event.touches[0]
                          const start = swipeStartRef.current
                          if (!touch || start.id !== item.id) return
                          const dx = touch.clientX - start.x
                          const dy = touch.clientY - start.y
                          if (!start.ignoring && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
                            swipeStartRef.current.ignoring = true
                            return
                          }
                          if (start.ignoring) return
                          if (Math.abs(dx) > 8) {
                            event.preventDefault()
                          }
                          const next = Math.min(72, Math.max(-72, baseOffset + dx))
                          swipeOffsetRef.current = next
                          event.currentTarget.style.transform = `translateX(${next}px)`
                        }}
                        onTouchEnd={(event) => {
                          const start = swipeStartRef.current
                          if (start.id !== item.id) return
                          const offset = swipeOffsetRef.current
                          event.currentTarget.style.transform = ''
                          if (offset <= -40) {
                            setSwipeReveal({ id: item.id, mode: 'delete' })
                          } else if (offset >= 40) {
                            setSwipeReveal({ id: item.id, mode: 'rename' })
                          } else {
                            setSwipeReveal(null)
                          }
                          swipeStartRef.current = { x: 0, y: 0, id: null, ignoring: false }
                          swipeOffsetRef.current = 0
                        }}
                        onTouchCancel={(event) => {
                          event.currentTarget.style.transform = ''
                          swipeStartRef.current = { x: 0, y: 0, id: null, ignoring: false }
                          swipeOffsetRef.current = 0
                        }}
                      >
                      {canReorderList ? (
                        <span className="drag-handle" title="ドラッグで並び替え" aria-hidden="true">
                          ⠿
                        </span>
                      ) : (
                        <span className="drag-handle drag-handle--disabled" aria-hidden="true" />
                      )}

                      {editingItemId === item.id ? (
                        <form
                          className="rename-form"
                          onSubmit={(event) => {
                            event.preventDefault()
                            saveRename(item.id)
                          }}
                        >
                          <input
                            autoFocus
                            value={editingName}
                            placeholder="曲名"
                            onChange={(event) => setEditingName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelRename()
                              }
                            }}
                            aria-label="曲名"
                          />
                          <button type="submit" className="icon-button" title="保存">
                            ✓
                          </button>
                          <button type="button" className="icon-button" title="キャンセル" onClick={cancelRename}>
                            ×
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="video-title"
                          onClick={() => {
                            if (swipeMode) {
                              setSwipeReveal(null)
                              return
                            }
                            selectItem(item.id, true)
                          }}
                        >
                          <strong>
                            <span className={`kind-chip kind-${item.kind}`} aria-hidden="true">
                              {item.kind === 'audio' ? '♪' : '▶'}
                            </span>
                            <span className="track-name">{getDisplayName(item.name)}</span>
                          </strong>
                          <span>{formatSize(item.size)}</span>
                        </button>
                      )}

                      <div className="item-actions">
                        {editingItemId !== item.id ? (
                          <>
                            <button
                              type="button"
                              className={`icon-button icon-button--favorite${isFavorite ? ' is-favorite' : ''}`}
                              title={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
                              aria-label={isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
                              aria-pressed={isFavorite}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleFavorite(item.id)
                              }}
                            >
                              <HeartIcon filled={isFavorite} />
                            </button>
                            <div className="playlist-add-wrap">
                              <button
                                type="button"
                                className={`icon-button icon-button--playlist${playlistMenuItemId === item.id ? ' is-open' : ''}`}
                                title="プレイリストに追加"
                                aria-label="プレイリストに追加"
                                aria-expanded={playlistMenuItemId === item.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (playlistMenuItemId === item.id) {
                                    setPlaylistMenuItemId(null)
                                    setPlaylistMenuPos(null)
                                    return
                                  }
                                  const rect = event.currentTarget.getBoundingClientRect()
                                  const menuWidth = 200
                                  const left = Math.min(
                                    Math.max(8, rect.right - menuWidth),
                                    window.innerWidth - menuWidth - 8,
                                  )
                                  const spaceBelow = window.innerHeight - rect.bottom
                                  const openUp = spaceBelow < 180 && rect.top > spaceBelow
                                  setPlaylistMenuPos({
                                    left,
                                    top: openUp ? undefined : rect.bottom + 6,
                                    bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
                                  })
                                  setPlaylistMenuItemId(item.id)
                                }}
                              >
                                <PlaylistAddIcon />
                              </button>
                            </div>
                            <button
                              type="button"
                              className={`icon-button icon-button--link${copiedItemId === item.id ? ' is-copied' : ''}`}
                              title={copiedItemId === item.id ? 'コピーしました' : 'リンクをコピー'}
                              aria-label="リンクをコピー"
                              onClick={(event) => {
                                event.stopPropagation()
                                copyTrackLink(item.id)
                              }}
                            >
                              {copiedItemId === item.id ? <CheckIcon /> : <LinkIcon />}
                            </button>
                            <button
                              type="button"
                              className={`icon-button icon-button--share${
                                sharingItemId === item.id ? ' is-busy' : ''
                              }${sharedItemId === item.id ? ' is-done' : ''}`}
                              title={
                                sharingItemId === item.id
                                  ? `「${item.name || getDisplayName(item.name)}」を準備中...`
                                  : sharedItemId === item.id
                                    ? '共有しました'
                                    : `「${item.name || 'media'}」を共有`
                              }
                              aria-label={`「${item.name || 'media'}」を共有`}
                              aria-busy={sharingItemId === item.id}
                              disabled={sharingItemId === item.id}
                              onClick={(event) => {
                                event.stopPropagation()
                                shareTrack(item)
                              }}
                            >
                              {sharingItemId === item.id ? (
                                <SpinnerIcon />
                              ) : sharedItemId === item.id ? (
                                <CheckIcon />
                              ) : (
                                <ShareIcon />
                              )}
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--rename item-rename-btn"
                              title="名前を変更"
                              onClick={(event) => startRename(item, event)}
                            >
                              <RenameIcon />
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="icon-button danger item-delete-btn"
                          title="削除"
                          aria-label="削除"
                          onClick={() => requestDelete(item.id)}
                        >
                          ×
                        </button>
                      </div>
                      </div>
                    </li>
                    )
                  })}
                </ul>
              )}

              {imageItems.length > 0 ? (
                <div className="cover-library">
                  <div className="list-header">
                    <h3>画像ライブラリ</h3>
                    <span>{imageItems.length} 件</span>
                  </div>
                  <p className="cover-library-hint">
                    クリックで現在の曲のラベルに設定できます
                  </p>
                  <ul className="video-list">
                    {imageItems.map((item) => (
                      <li
                        key={item.id}
                        className={`video-item cover-item ${selectedItem?.coverId === item.id ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="video-title"
                          onClick={() => handleAssignCoverFromLibrary(item.id)}
                          disabled={coverBusy || selectedItem?.kind !== 'audio'}
                        >
                          <strong>{getDisplayName(item.name)}</strong>
                          <span>
                            {selectedItem?.coverId === item.id ? '使用中 · ' : ''}
                            {formatSize(item.size)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-button danger item-delete-btn"
                          title="削除"
                          aria-label="削除"
                          onClick={() => requestDelete(item.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </main>
        </>
      )}

      {pendingDeleteId ? (
        <div className="confirm-overlay" role="presentation" onClick={cancelDelete}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-confirm-title">削除の確認</h3>
            <p id="delete-confirm-desc">
              「{getDisplayName(items.find((item) => item.id === pendingDeleteId)?.name || '')}」を削除しますか？
              <br />
              この操作は取り消せません。
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button" onClick={cancelDelete}>
                キャンセル
              </button>
              <button type="button" className="danger-button" onClick={confirmDelete}>
                削除する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {playlistMenuItemId && playlistMenuPos
        ? createPortal(
            <div
              className="playlist-add-menu playlist-add-menu--portal"
              role="menu"
              style={{
                left: playlistMenuPos.left,
                top: playlistMenuPos.top,
                bottom: playlistMenuPos.bottom,
              }}
            >
              {customPlaylists.length === 0 ? (
                <p className="playlist-add-empty">まだプレイリストがありません</p>
              ) : (
                customPlaylists.map((playlist) => {
                  const inPlaylist = playlist.trackIds.includes(playlistMenuItemId)
                  return (
                    <button
                      key={playlist.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={inPlaylist}
                      className={`playlist-add-option${inPlaylist ? ' is-in' : ''}`}
                      onClick={() => {
                        toggleTrackInPlaylist(playlist.id, playlistMenuItemId)
                      }}
                    >
                      <span>{playlist.name}</span>
                      <span aria-hidden="true">{inPlaylist ? '✓' : '+'}</span>
                    </button>
                  )
                })
              )}
              <button
                type="button"
                className="playlist-add-option playlist-add-option--new"
                onClick={() => {
                  setPendingPlaylistTrackId(playlistMenuItemId)
                  setPlaylistMenuItemId(null)
                  setPlaylistMenuPos(null)
                  setCreatingPlaylist(true)
                  setRenamingPlaylistId(null)
                  setPlaylistNameDraft('')
                }}
              >
                新しいプレイリスト…
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default App
