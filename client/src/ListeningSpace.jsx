import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AmbientEngine, tryEnterFullscreen, tryExitFullscreen } from './ambientAudio'
import {
    LISTENING_SPACES,
    compressImageFileToDataUrl,
    listeningSpaceStyleVars,
    loadSpaceBackgrounds,
    resolveListeningSpace,
    saveAmbientSettings,
    saveFocusModePreference,
    saveListeningSpaceId,
    saveSpaceBackground,
} from './listeningSpaces'
import SpaceParticles from './SpaceParticles'
import SpaceScenery, { SpaceSceneryPreview } from './SpaceScenery'
import { useFloatingPanel } from './useFloatingPanel'

function useResolvedBackgroundUrl(entry, loadLibraryImageUrl) {
  const [url, setUrl] = useState(null)
  const blobUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const revokeOwned = () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }

    if (!entry) {
      revokeOwned()
      setUrl(null)
      return undefined
    }

    if (entry.source === 'upload' && entry.dataUrl) {
      revokeOwned()
      setUrl(entry.dataUrl)
      return undefined
    }

    if (entry.source === 'library' && entry.itemId && loadLibraryImageUrl) {
      setUrl(null)
      loadLibraryImageUrl(entry.itemId, entry.mimeType || 'image/jpeg')
        .then((resolved) => {
          if (!cancelled) setUrl(resolved)
        })
        .catch(() => {
          if (!cancelled) setUrl(null)
        })
      return () => {
        cancelled = true
      }
    }

    revokeOwned()
    setUrl(null)
    return undefined
  }, [entry, loadLibraryImageUrl])

  useEffect(() => () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  return url
}

export default function ListeningSpace({
  open,
  spaceId,
  onSpaceChange,
  onClose,
  ambientEnabled,
  ambientVolume,
  onAmbientEnabledChange,
  onAmbientVolumeChange,
  focusMode,
  onFocusModeChange,
  playerExpanded = true,
  onTogglePlayerExpanded,
  panelMinimized = false,
  onPanelMinimizedChange,
  suggestedSpaceId = null,
  reducedMotion = false,
  libraryImages = [],
  loadLibraryImageUrl = null,
}) {
  const [displaySpaceId, setDisplaySpaceId] = useState(spaceId)
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  const [crossfading, setCrossfading] = useState(false)
  const [backgrounds, setBackgrounds] = useState(() => loadSpaceBackgrounds())
  const [bgBusy, setBgBusy] = useState(false)
  const [bgError, setBgError] = useState(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryThumbs, setLibraryThumbs] = useState({})
  const ambientRef = useRef(null)
  const fileInputRef = useRef(null)
  const {
    panelRef,
    panelStyle,
    panelClassName,
    onPointerDown,
  } = useFloatingPanel('hana-listening-space-panel-pos')

  const activeSpace = useMemo(() => resolveListeningSpace(displaySpaceId), [displaySpaceId])
  const activeEntry = backgrounds[spaceId] || null
  const displayEntry = backgrounds[displaySpaceId] || null
  const prevEntry = backgrounds[prevSpaceId] || null

  const displayBgUrl = useResolvedBackgroundUrl(displayEntry, loadLibraryImageUrl)
  const prevBgUrl = useResolvedBackgroundUrl(prevEntry, loadLibraryImageUrl)
  const activeBgUrl = useResolvedBackgroundUrl(activeEntry, loadLibraryImageUrl)

  const previewUrls = useMemo(() => {
    const map = {}
    for (const space of LISTENING_SPACES) {
      const entry = backgrounds[space.id]
      if (entry?.source === 'upload' && entry.dataUrl) {
        map[space.id] = entry.dataUrl
      }
    }
    return map
  }, [backgrounds])

  useEffect(() => {
    if (spaceId === displaySpaceId) return undefined
    setPrevSpaceId(displaySpaceId)
    setCrossfading(true)
    const timer = window.setTimeout(() => {
      setDisplaySpaceId(spaceId)
      setCrossfading(false)
    }, 480)
    return () => window.clearTimeout(timer)
  }, [spaceId, displaySpaceId])

  useEffect(() => {
    if (!open) {
      ambientRef.current?.stop()
      tryExitFullscreen()
      return undefined
    }

    if (!ambientRef.current) {
      ambientRef.current = new AmbientEngine()
    }

    if (ambientEnabled) {
      ambientRef.current.start(activeSpace.ambient, ambientVolume).catch(() => {})
    } else {
      ambientRef.current.stop()
    }

    return () => {
      ambientRef.current?.stop()
    }
  }, [open, ambientEnabled, ambientVolume, activeSpace.ambient])

  useEffect(() => {
    if (!open) return undefined
    document.body.classList.add('is-listening-space-open')
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (libraryOpen) {
          setLibraryOpen(false)
          return
        }
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('is-listening-space-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, libraryOpen])

  useEffect(() => () => {
    ambientRef.current?.stop()
    ambientRef.current = null
  }, [])

  useEffect(() => {
    if (!libraryOpen || !loadLibraryImageUrl || libraryImages.length === 0) return undefined
    let cancelled = false
    const loadThumbs = async () => {
      const next = {}
      await Promise.all(
        libraryImages.slice(0, 48).map(async (item) => {
          try {
            const url = await loadLibraryImageUrl(item.id, item.type || 'image/jpeg')
            if (!cancelled) next[item.id] = url
          } catch {
            /* skip broken */
          }
        }),
      )
      if (!cancelled) setLibraryThumbs((current) => ({ ...current, ...next }))
    }
    loadThumbs()
    return () => {
      cancelled = true
    }
  }, [libraryOpen, libraryImages, loadLibraryImageUrl])

  // Resolve library previews for chip thumbs (non-upload entries)
  useEffect(() => {
    if (!loadLibraryImageUrl) return undefined
    let cancelled = false
    const load = async () => {
      for (const space of LISTENING_SPACES) {
        const entry = backgrounds[space.id]
        if (entry?.source !== 'library' || !entry.itemId) continue
        if (previewUrls[space.id]) continue
        try {
          const url = await loadLibraryImageUrl(entry.itemId, entry.mimeType || 'image/jpeg')
          if (!cancelled) {
            setLibraryThumbs((current) => (
              current[entry.itemId] ? current : { ...current, [entry.itemId]: url }
            ))
          }
        } catch {
          /* ignore */
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [backgrounds, loadLibraryImageUrl, previewUrls])

  if (!open || typeof document === 'undefined') return null

  const chipPreviewUrl = (id) => {
    const entry = backgrounds[id]
    if (entry?.source === 'upload' && entry.dataUrl) return entry.dataUrl
    if (entry?.source === 'library' && entry.itemId) return libraryThumbs[entry.itemId] || null
    return null
  }

  const handleSpacePick = (nextId) => {
    saveListeningSpaceId(nextId)
    onSpaceChange?.(nextId)
    setLibraryOpen(false)
    setBgError(null)
  }

  const handleAmbientToggle = () => {
    const next = !ambientEnabled
    onAmbientEnabledChange?.(next)
    saveAmbientSettings({ enabled: next, volume: ambientVolume })
  }

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value)
    onAmbientVolumeChange?.(next)
    ambientRef.current?.setVolume(next)
    saveAmbientSettings({ enabled: ambientEnabled, volume: next })
  }

  const handleFocusToggle = () => {
    const next = !focusMode
    onFocusModeChange?.(next)
    saveFocusModePreference(next)
  }

  const handleOpenFullscreen = () => {
    tryEnterFullscreen()
  }

  const setPanelMinimized = (next) => {
    onPanelMinimizedChange?.(next)
  }

  const applyBackground = (entry) => {
    saveSpaceBackground(spaceId, entry)
    setBackgrounds(loadSpaceBackgrounds())
    setBgError(null)
  }

  const handleUploadPick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBgBusy(true)
    setBgError(null)
    try {
      const dataUrl = await compressImageFileToDataUrl(file)
      applyBackground({ source: 'upload', dataUrl })
    } catch (error) {
      setBgError(error?.message || '画像の設定に失敗しました。')
    } finally {
      setBgBusy(false)
    }
  }

  const handleLibraryPick = (item) => {
    applyBackground({
      source: 'library',
      itemId: item.id,
      mimeType: item.type || 'image/jpeg',
    })
    setLibraryOpen(false)
  }

  const handleResetBackground = () => {
    applyBackground(null)
    setLibraryOpen(false)
  }

  const hasCustomBg = Boolean(activeEntry)

  return createPortal(
    <>
      <div className="listening-space-root" aria-hidden="true">
        <div
          className={`listening-space-layer${crossfading ? ' is-fading' : ''}`}
          style={listeningSpaceStyleVars(prevSpaceId)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={prevSpaceId} backgroundUrl={prevBgUrl} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={prevSpaceId} reducedMotion={reducedMotion} />
        </div>
        <div
          className={`listening-space-layer is-front${crossfading ? ' is-active' : ''}`}
          style={listeningSpaceStyleVars(displaySpaceId)}
        >
          <div className="listening-space-sky" />
          <SpaceScenery spaceId={displaySpaceId} backgroundUrl={displayBgUrl} />
          <div className="listening-space-horizon" />
          <SpaceParticles spaceId={displaySpaceId} reducedMotion={reducedMotion} />
        </div>
      </div>

      <div
        ref={panelRef}
        className={`listening-space-panel${panelMinimized ? ' is-minimized' : ''}${panelClassName ? ` ${panelClassName}` : ''}`}
        style={panelStyle}
        role="region"
        aria-label="リスニングスペース"
        onPointerDown={onPointerDown}
      >
        {panelMinimized ? (
          <div className="listening-space-mini">
            <button
              type="button"
              className="floating-drag-handle"
              data-drag-handle
              aria-label="ドラッグして移動"
              title="ドラッグして移動"
            >
              ⋮⋮
            </button>
            <SpaceSceneryPreview spaceId={spaceId} backgroundUrl={activeBgUrl || chipPreviewUrl(spaceId)} />
            <span className="listening-space-mini-label">{activeSpace.labelShort}</span>
            <button
              type="button"
              className="icon-button listening-space-expand"
              onClick={() => setPanelMinimized(false)}
              aria-label="パネルを開く"
              title="パネルを開く"
            >
              ▲
            </button>
            <button type="button" className="icon-button listening-space-close" onClick={onClose} aria-label="閉じる">
              ×
            </button>
          </div>
        ) : (
          <>
            <div className="listening-space-panel-top">
              <div className="listening-space-panel-heading">
                <button
                  type="button"
                  className="floating-drag-handle"
                  data-drag-handle
                  aria-label="ドラッグして移動"
                  title="ドラッグして移動"
                >
                  ⋮⋮
                </button>
                <div>
                  <p className="listening-space-eyebrow">Listening Space</p>
                  <p className="listening-space-title">{activeSpace.label}</p>
                  <p className="listening-space-tagline">{activeSpace.tagline}</p>
                  {suggestedSpaceId && suggestedSpaceId !== spaceId ? (
                    <button
                      type="button"
                      className="listening-space-suggest"
                      onClick={() => handleSpacePick(suggestedSpaceId)}
                    >
                      おすすめ: {resolveListeningSpace(suggestedSpaceId).labelShort}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="listening-space-panel-actions">
                <button
                  type="button"
                  className="icon-button listening-space-minimize"
                  onClick={() => setPanelMinimized(true)}
                  aria-label="最小化"
                  title="最小化"
                >
                  ー
                </button>
                <button type="button" className="icon-button listening-space-close" onClick={onClose} aria-label="閉じる">
                  ×
                </button>
              </div>
            </div>

            <div className="listening-space-chips" role="group" aria-label="場所を選ぶ">
              {LISTENING_SPACES.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className={`listening-space-chip${space.id === spaceId ? ' is-active' : ''}`}
                  onClick={() => handleSpacePick(space.id)}
                >
                  <SpaceSceneryPreview spaceId={space.id} backgroundUrl={chipPreviewUrl(space.id)} />
                  <span>{space.labelShort}</span>
                </button>
              ))}
            </div>

            <div className="listening-space-bg-controls">
              <span className="listening-space-bg-label">背景</span>
              <SpaceSceneryPreview
                spaceId={spaceId}
                backgroundUrl={activeBgUrl || chipPreviewUrl(spaceId)}
                className="listening-space-bg-thumb"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleUploadPick}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={bgBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {bgBusy ? '処理中…' : '画像を選ぶ'}
              </button>
              <button
                type="button"
                className={`secondary-button${libraryOpen ? ' is-active' : ''}`}
                disabled={bgBusy}
                onClick={() => setLibraryOpen((current) => !current)}
              >
                ライブラリ
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={bgBusy || !hasCustomBg}
                onClick={handleResetBackground}
              >
                リセット
              </button>
            </div>
            {bgError ? <p className="listening-space-bg-error">{bgError}</p> : null}

            {libraryOpen ? (
              <div className="listening-space-library" role="listbox" aria-label="ライブラリから背景を選ぶ">
                {libraryImages.length === 0 ? (
                  <p className="listening-space-library-empty">ライブラリに画像がありません。</p>
                ) : (
                  libraryImages.slice(0, 48).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`listening-space-library-item${activeEntry?.source === 'library' && activeEntry.itemId === item.id ? ' is-active' : ''}`}
                      onClick={() => handleLibraryPick(item)}
                      title={item.name || item.id}
                    >
                      {libraryThumbs[item.id] ? (
                        <img src={libraryThumbs[item.id]} alt="" />
                      ) : (
                        <span className="listening-space-library-placeholder">…</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : null}

            <div className="listening-space-controls">
              <label className="listening-space-toggle">
                <input type="checkbox" checked={ambientEnabled} onChange={handleAmbientToggle} />
                <span>環境音</span>
              </label>
              <label className="listening-space-volume">
                <span>音量</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={ambientVolume}
                  disabled={!ambientEnabled}
                  onChange={handleVolumeChange}
                />
              </label>
              <label className="listening-space-toggle">
                <input type="checkbox" checked={focusMode} onChange={handleFocusToggle} />
                <span>集中モード</span>
              </label>
              <button
                type="button"
                className="secondary-button listening-space-player-toggle"
                onClick={() => onTogglePlayerExpanded?.()}
              >
                {playerExpanded ? '景色を見る' : 'プレイヤーを開く'}
              </button>
              <button type="button" className="secondary-button listening-space-fullscreen" onClick={handleOpenFullscreen}>
                全画面
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
