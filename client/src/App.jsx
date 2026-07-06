import { useEffect, useMemo, useState } from 'react'
import './App.css'

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

function createMediaRecord(file) {
  return new Promise((resolve, reject) => {
    try {
      const objectUrl = URL.createObjectURL(file)
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
    return () => {
      items.forEach((item) => {
        if (item.url?.startsWith('blob:')) {
          URL.revokeObjectURL(item.url)
        }
      })
    }
  }, [items])

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

    setError('Sai mật khẩu. Mẫu: 123456')
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const kind = getMediaKind(file.type, file.name)
    if (kind === 'file') {
      setError('Chỉ hỗ trợ video, audio hoặc ảnh.')
      event.target.value = ''
      return
    }

    setUploading(true)
    setError('')

    try {
      const record = await createMediaRecord(file)
      setItems((prevItems) => [record, ...prevItems])
      setSelectedItemId(record.id)
    } catch (uploadError) {
      console.error(uploadError)
      setError('Upload thất bại.')
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
          <p className="eyebrow">Hộp chia sẻ media</p>
          <h1>Upload và chia sẻ video, audio, ảnh một cách đơn giản.</h1>
          <p className="lead">Đăng nhập, thêm file, rồi xem ngay trên trang.</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="sr-only" htmlFor="password">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              value={password}
              placeholder="Nhập mật khẩu"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit">Đăng nhập</button>
          </form>

          {error ? <p className="message error">{error}</p> : null}
          <p className="hint">Mật khẩu mẫu: 123456</p>
        </section>
      ) : (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">Kho media riêng</p>
              <h2>Media share</h2>
            </div>
            <div className="topbar-stats">
              <span>{items.length} mục</span>
              <span>{items.reduce((sum, item) => sum + (item.size || 0), 0) ? formatSize(items.reduce((sum, item) => sum + (item.size || 0), 0)) : '0 MB'}</span>
            </div>
          </header>

          <section className="upload-card">
            <div>
              <p className="eyebrow">Upload ngay</p>
              <h3>Thêm file vào hộp chia sẻ</h3>
            </div>
            <label className="upload-button" htmlFor="video-upload">
              {uploading ? 'Đang upload...' : 'Chọn file'}
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
                      <p className="eyebrow">Xem trước</p>
                      <h3>{selectedItem.name}</h3>
                    </div>
                    <button type="button" className="danger-button" onClick={() => handleDelete(selectedItem.id)}>
                      Xóa
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
                    <span>{new Date(selectedItem.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>Chưa có file nào.</h3>
                  <p>Hãy thêm file đầu tiên để bắt đầu.</p>
                </div>
              )}
            </section>

            <aside className="list-card">
              <div className="list-header">
                <h3>Danh sách file</h3>
                <span>{items.length} mục</span>
              </div>

              {items.length === 0 ? (
                <div className="empty-list">
                  <p>File upload sẽ hiện ở đây.</p>
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
