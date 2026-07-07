import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  deleteMediaItem,
  getFirebaseErrorMessage,
  loadMediaBlobUrl,
  MAX_FILE_SIZE,
  subscribeToMediaItems,
  uploadMediaFile,
} from './firebase'

const AUTH_KEY = 'media-share-lite-auth'
const PASSWORD = 'hiro'

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

function createMediaMetadata(file) {
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    kind: getMediaKind(file.type, file.name),
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
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
  const [playlistMode, setPlaylistMode] = useState(false)
  const blobUrlsRef = useRef(new Set())
  const mediaRef = useRef(null)
  const shouldAutoPlayRef = useRef(false)
  const imageTimerRef = useRef(null)

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || items[0] || null,
    [items, selectedItemId],
  )

  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.id === selectedItemId),
    [items, selectedItemId],
  )

  const getItemIdAtOffset = useCallback((offset) => {
    if (items.length === 0) return null
    const baseIndex = selectedIndex >= 0 ? selectedIndex : 0
    const nextIndex = (baseIndex + offset + items.length) % items.length
    return items[nextIndex]?.id || null
  }, [items, selectedIndex])

  const selectItem = useCallback((itemId, autoPlay = false) => {
    shouldAutoPlayRef.current = autoPlay
    setSelectedItemId(itemId)
  }, [])

  const playNext = useCallback(() => {
    const nextId = getItemIdAtOffset(1)
    if (nextId) selectItem(nextId, playlistMode)
  }, [getItemIdAtOffset, playlistMode, selectItem])

  const playPrevious = useCallback(() => {
    const prevId = getItemIdAtOffset(-1)
    if (prevId) selectItem(prevId, playlistMode)
  }, [getItemIdAtOffset, playlistMode, selectItem])

  const startPlaylist = useCallback(() => {
    if (items.length === 0) return
    setPlaylistMode(true)
    selectItem(selectedItem?.id || items[0].id, true)
  }, [items, selectedItem?.id, selectItem])

  const handleMediaEnded = useCallback(() => {
    if (!playlistMode) return
    const nextId = getItemIdAtOffset(1)
    if (nextId) selectItem(nextId, true)
  }, [getItemIdAtOffset, playlistMode, selectItem])

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
          return nextItems[0]?.id || null
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
    const currentUrls = new Set(previewUrl?.startsWith('blob:') ? [previewUrl] : [])

    blobUrlsRef.current.forEach((url) => {
      if (!currentUrls.has(url)) {
        URL.revokeObjectURL(url)
      }
    })

    blobUrlsRef.current = currentUrls
  }, [previewUrl])

  useEffect(() => {
    if (!selectedItem) {
      setPreviewUrl(null)
      setLoadingPreview(false)
      return undefined
    }

    let cancelled = false
    setLoadingPreview(true)
    setPreviewUrl(null)

    loadMediaBlobUrl(selectedItem.id, selectedItem.type)
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url)
          setLoadingPreview(false)
        } else {
          URL.revokeObjectURL(url)
        }
      })
      .catch((previewError) => {
        console.error(previewError)
        if (!cancelled) {
          setError(getFirebaseErrorMessage(previewError))
          setLoadingPreview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedItem?.id, selectedItem?.type])

  useEffect(() => {
    if (!previewUrl || loadingPreview || !playlistMode || !shouldAutoPlayRef.current) return undefined

    if (selectedItem?.kind === 'audio' || selectedItem?.kind === 'video') {
      shouldAutoPlayRef.current = false
      const timer = window.setTimeout(() => {
        mediaRef.current?.play().catch(() => {})
      }, 0)
      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [previewUrl, loadingPreview, playlistMode, selectedItem?.kind])

  useEffect(() => {
    if (!playlistMode || !previewUrl || loadingPreview || selectedItem?.kind !== 'image') {
      return undefined
    }

    imageTimerRef.current = window.setTimeout(() => {
      playNext()
    }, 5000)

    return () => {
      if (imageTimerRef.current) {
        window.clearTimeout(imageTimerRef.current)
      }
    }
  }, [playlistMode, previewUrl, loadingPreview, selectedItem?.id, selectedItem?.kind, playNext])

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
      const metadata = createMediaMetadata(file)
      const id = await uploadMediaFile(file, metadata, setUploadProgress)
      setSelectedItemId(id)
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

  const handleDelete = async (itemId) => {
    if (!items.find((item) => item.id === itemId)) return

    try {
      await deleteMediaItem(itemId)
      if (selectedItemId === itemId) {
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
              <span className="stat-badge">{items.length} 件</span>
              <span className="stat-badge">{items.reduce((sum, item) => sum + (item.size || 0), 0) ? formatSize(items.reduce((sum, item) => sum + (item.size || 0), 0)) : '0 MB'}</span>
              <button type="button" className="secondary-button" onClick={handleLogout}>
                ログアウト
              </button>
            </div>
          </header>

          <section className="upload-card">
            <div>
              <p className="eyebrow">すぐアップロード</p>
              <h3>メディアを共有ボックスへ追加</h3>
              <p className="hint">1ファイルあたり最大 {formatSize(MAX_FILE_SIZE)}までアップロードできます</p>
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
                      <h3>{selectedItem.name}</h3>
                    </div>
                    <div className="player-actions">
                      <button type="button" className="secondary-button" onClick={playPrevious} disabled={items.length < 2}>
                        前へ
                      </button>
                      <button type="button" className="secondary-button" onClick={playNext} disabled={items.length < 2}>
                        次へ
                      </button>
                      <button
                        type="button"
                        className={`secondary-button ${playlistMode ? 'active' : ''}`}
                        onClick={() => setPlaylistMode((current) => !current)}
                      >
                        {playlistMode ? '連続再生 ON' : '連続再生 OFF'}
                      </button>
                      <button type="button" className="primary-button" onClick={startPlaylist} disabled={items.length === 0}>
                        リスト再生
                      </button>
                      <button type="button" className="danger-button" onClick={() => handleDelete(selectedItem.id)}>
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
                        <img className="media-preview" src={previewUrl} alt={selectedItem.name} />
                      ) : selectedItem.kind === 'audio' ? (
                        <div className="audio-card">
                          <p>{selectedItem.name}</p>
                          <audio ref={mediaRef} controls src={previewUrl} onEnded={handleMediaEnded} />
                        </div>
                      ) : (
                        <video
                          ref={mediaRef}
                          className="video-player"
                          controls
                          playsInline
                          preload="metadata"
                          src={previewUrl}
                          onEnded={handleMediaEnded}
                        />
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <h3>プレビューを読み込めませんでした。</h3>
                    </div>
                  )}

                  <div className="video-meta">
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
                <h3>メディア一覧</h3>
                <span>{items.length} 件</span>
              </div>

              {loadingItems ? (
                <div className="empty-list">
                  <p>読み込み中...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="empty-list">
                  <p>アップロードしたファイルがここに表示されます。</p>
                </div>
              ) : (
                <ul className="video-list">
                  {items.map((item) => (
                    <li key={item.id} className={`video-item ${selectedItem?.id === item.id ? 'active' : ''}`}>
                      <button type="button" className="video-title" onClick={() => selectItem(item.id)}>
                        <strong>{item.name}</strong>
                        <span>{formatSize(item.size)}</span>
                      </button>
                      <button type="button" className="icon-button danger" onClick={() => handleDelete(item.id)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </main>
        </>
      )}
    </div>
  )
}

export default App
