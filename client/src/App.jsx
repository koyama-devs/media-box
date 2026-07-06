import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { uploadFileToFirebase } from './firebase'

const STORAGE_KEY = 'media-share-lite-items'
const PASSWORD = '123456'

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

function createMediaRecord(file, urlOverride) {
  return new Promise((resolve, reject) => {
    try {
      const objectUrl = urlOverride || URL.createObjectURL(file)
      const kind = getMediaKind(file.type, file.name)

      resolve({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        kind,
        size: file.size,
        createdAt: new Date().toISOString(),
        url: objectUrl,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function formatSize(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const blobUrlsRef = useRef(new Set())

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (!saved) return

      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        setItems(parsed)
        if (parsed[0]) {
          setSelectedItemId(parsed[0].id)
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Ignore storage errors and keep the app working.
    }
  }, [items])

  useEffect(() => {
    const currentUrls = new Set(
      items
        .filter((item) => item.url?.startsWith('blob:'))
        .map((item) => item.url),
    )

    blobUrlsRef.current.forEach((url) => {
      if (!currentUrls.has(url)) {
        URL.revokeObjectURL(url)
      }
    })

    blobUrlsRef.current = currentUrls
  }, [items])

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || items[0] || null,
    [items, selectedItemId],
  )

  const handleLogin = (event) => {
    event.preventDefault()

    if (password === PASSWORD) {
      setIsLoggedIn(true)
      setError('')
      return
    }

    setError('パスワードが違います。サンプル: 123456')
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

    setUploading(true)
    setError('')

    try {
        // Try uploading to Firebase Storage first. If it fails, fall back to local blob URL.
        try {
          const { url } = await uploadFileToFirebase(file)
          const record = await createMediaRecord(file, url)
          setItems((prevItems) => [record, ...prevItems])
          setSelectedItemId(record.id)
        } catch (remoteErr) {
          console.warn('Firebase upload failed, falling back to local preview', remoteErr)
          const record = await createMediaRecord(file)
          setItems((prevItems) => [record, ...prevItems])
          setSelectedItemId(record.id)
        }
    } catch (uploadError) {
      console.error(uploadError)
      setError('アップロードに失敗しました。')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleDelete = (itemId) => {
    const nextItems = items.filter((item) => item.id !== itemId)
    const removedItem = items.find((item) => item.id === itemId)

    if (removedItem?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(removedItem.url)
    }

    setItems(nextItems)

    if (selectedItemId === itemId) {
      setSelectedItemId(nextItems[0]?.id || null)
    }
  }

  return (
    <div className="app-shell">
      {!isLoggedIn ? (
        <section className="login-card">
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
          <p className="hint">サンプルパスワード: 123456</p>
        </section>
      ) : (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">共有メディアスペース</p>
              <h2>メディア共有</h2>
            </div>
            <div className="topbar-stats">
              <span>{items.length} 件</span>
              <span>{items.reduce((sum, item) => sum + (item.size || 0), 0) ? formatSize(items.reduce((sum, item) => sum + (item.size || 0), 0)) : '0 MB'}</span>
            </div>
          </header>

          <section className="upload-card">
            <div>
              <p className="eyebrow">すぐアップロード</p>
              <h3>メディアを共有ボックスへ追加</h3>
            </div>
            <label className="upload-button" htmlFor="video-upload">
              {uploading ? 'アップロード中...' : 'ファイルを追加'}
            </label>
            <input id="video-upload" type="file" accept="video/*,audio/*,image/*" onChange={handleUpload} />
          </section>

          {error ? <p className="message error">{error}</p> : null}

          <main className="content-grid">
            <section className="player-card">
              {selectedItem ? (
                <>
                  <div className="player-header">
                    <div>
                      <p className="eyebrow">プレビュー</p>
                      <h3>{selectedItem.name}</h3>
                    </div>
                    <button type="button" className="danger-button" onClick={() => handleDelete(selectedItem.id)}>
                      削除
                    </button>
                  </div>

                  {selectedItem.kind === 'image' ? (
                    <img className="media-preview" src={selectedItem.url} alt={selectedItem.name} />
                  ) : selectedItem.kind === 'audio' ? (
                    <div className="audio-card">
                      <p>{selectedItem.name}</p>
                      <audio controls src={selectedItem.url} />
                    </div>
                  ) : (
                    <video className="video-player" controls playsInline preload="metadata" src={selectedItem.url} />
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

              {items.length === 0 ? (
                <div className="empty-list">
                  <p>アップロードしたファイルがここに表示されます。</p>
                </div>
              ) : (
                <ul className="video-list">
                  {items.map((item) => (
                    <li key={item.id} className={`video-item ${selectedItem?.id === item.id ? 'active' : ''}`}>
                      <button type="button" className="video-title" onClick={() => setSelectedItemId(item.id)}>
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
